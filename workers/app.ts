import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { z } from "zod";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Validation schemas
const CreateTransferSchema = z.object({
  senderEmail: z.string().email(),
  recipientEmails: z.string().min(1),
  message: z.string().optional(),
  files: z.array(z.object({
    filename: z.string(),
    filesize: z.number().positive()
  }))
});

const CompleteTransferSchema = z.object({
  transferId: z.string(),
  key: z.string(),
  uploadId: z.string(),
  parts: z.array(z.object({
    partNumber: z.number().int().min(1),
    etag: z.string()
  }))
});

// API Routes

// Create a new transfer
app.post("/api/transfers", async (c) => {
  try {
    console.log('Creating transfer - parsing request body...');
    const body = await c.req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    console.log('Validating data...');
    const validatedData = CreateTransferSchema.parse(body);
    console.log('Validation successful');
    
    const transferId = crypto.randomUUID();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now
    const createdAt = Date.now();
    
    console.log('Inserting transfer record...');
    console.log('Transfer ID:', transferId);
    
    // Check if database is available
    if (!c.env.DB) {
      console.error('Database binding not available');
      return c.json({ error: 'Database not configured' }, 500);
    }
    
    // Insert transfer record
    await c.env.DB.prepare(`
      INSERT INTO transfers (id, sender_email, recipient_emails, message, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      transferId,
      validatedData.senderEmail,
      JSON.stringify(validatedData.recipientEmails.split(',').map(e => e.trim())),
      validatedData.message || null,
      'pending',
      expiresAt,
      createdAt
    ).run();
    
    console.log('Transfer record inserted successfully');
    
    // Check if R2 bucket is available
    if (!c.env.FILE_BUCKET) {
      console.error('R2 bucket binding not available');
      return c.json({ error: 'File storage not configured' }, 500);
    }
    
    // Process files and create multipart uploads
    const fileResponses = [];
    
    console.log('Processing files...');
    for (const fileData of validatedData.files) {
      console.log('Processing file:', fileData.filename);
      
      const fileId = crypto.randomUUID();
      const r2Key = `transfers/${transferId}/${fileId}/${fileData.filename}`;
      
      console.log('Creating multipart upload for:', r2Key);
      
      // Create multipart upload
      const multipartUpload = await c.env.FILE_BUCKET.createMultipartUpload(r2Key);
      console.log('Multipart upload created, ID:', multipartUpload.uploadId);
      
      // Insert file record
      await c.env.DB.prepare(`
        INSERT INTO files (id, transfer_id, filename, filesize, r2_object_key)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        fileId,
        transferId,
        fileData.filename,
        fileData.filesize,
        r2Key
      ).run();
      
      console.log('File record inserted for:', fileData.filename);
      
      fileResponses.push({
        fileId,
        filename: fileData.filename,
        uploadId: multipartUpload.uploadId,
        key: r2Key
      });
    }
    
    console.log('Transfer created successfully');
    return c.json({
      transferId,
      files: fileResponses
    });
    
  } catch (error) {
    console.error('Error creating transfer:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    if (error instanceof z.ZodError) {
      console.log('Validation error details:', error.errors);
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    
    // Return more specific error information
    return c.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Upload chunk directly
app.post("/api/uploads/chunk", async (c) => {
  try {
    const formData = await c.req.formData();
    const key = formData.get('key') as string;
    const uploadId = formData.get('uploadId') as string;
    const partNumber = parseInt(formData.get('partNumber') as string);
    const chunk = formData.get('chunk') as File;
    
    if (!key || !uploadId || !partNumber || !chunk) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const multipartUpload = c.env.FILE_BUCKET.resumeMultipartUpload(key, uploadId);
    const uploadPart = await multipartUpload.uploadPart(partNumber, chunk);
    
    return c.json({ 
      partNumber,
      etag: uploadPart.etag 
    });
    
  } catch (error) {
    console.error('Error uploading chunk:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Complete multipart upload
app.post("/api/transfers/complete", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = CompleteTransferSchema.parse(body);
    
    // Complete the multipart upload
    const multipartUpload = c.env.FILE_BUCKET.resumeMultipartUpload(
      validatedData.key,
      validatedData.uploadId
    );
    
    const object = await multipartUpload.complete(validatedData.parts);
    
    // Update transfer status to complete
    await c.env.DB.prepare(`
      UPDATE transfers SET status = 'complete' WHERE id = ?
    `).bind(validatedData.transferId).run();
    
    // Get transfer details for email notification
    const transfer = await c.env.DB.prepare(`
      SELECT * FROM transfers WHERE id = ?
    `).bind(validatedData.transferId).first();
    
    let emailSent = false;
    if (transfer) {
      // Send email notification
      emailSent = await sendEmailNotification(c.env, transfer, validatedData.transferId);
    }
    
    return c.json({ success: true, object, emailSent });
    
  } catch (error) {
    console.error('Error completing transfer:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Download file endpoint
app.get("/api/download/:transferId", async (c) => {
  try {
    const transferId = c.req.param('transferId');
    
    // Get transfer details
    const transfer = await c.env.DB.prepare(`
      SELECT * FROM transfers WHERE id = ? AND status = 'complete' AND expires_at > ?
    `).bind(transferId, Date.now()).first();
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found or expired' }, 404);
    }
    
    // Get files for this transfer
    const files = await c.env.DB.prepare(`
      SELECT * FROM files WHERE transfer_id = ?
    `).bind(transferId).all();
    
    return c.json({
      transfer,
      files: files.results
    });
    
  } catch (error) {
    console.error('Error fetching download:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get file content
app.get("/api/file/:transferId/:filename", async (c) => {
  try {
    const transferId = c.req.param('transferId');
    const filename = c.req.param('filename');
    
    // Verify transfer exists and is not expired
    const transfer = await c.env.DB.prepare(`
      SELECT * FROM transfers WHERE id = ? AND status = 'complete' AND expires_at > ?
    `).bind(transferId, Date.now()).first();
    
    if (!transfer) {
      return c.json({ error: 'Transfer not found or expired' }, 404);
    }
    
    // Get file details
    const file = await c.env.DB.prepare(`
      SELECT * FROM files WHERE transfer_id = ? AND filename = ?
    `).bind(transferId, filename).first();
    
    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    // Get file from R2
    const object = await c.env.FILE_BUCKET.get(file.r2_object_key as string);
    
    if (!object) {
      return c.json({ error: 'File not found in storage' }, 404);
    }
    
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': object.size.toString()
      }
    });
    
  } catch (error) {
    console.error('Error downloading file:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Email notification function
async function sendEmailNotification(env: Env, transfer: any, transferId: string): Promise<boolean> {
  try {
    const recipientEmails = JSON.parse(transfer.recipient_emails);
    const allEmails = [transfer.sender_email, ...recipientEmails];
    
    const downloadUrl = `${env.BASE_URL || 'https://naijatransfer.com'}/download/${transferId}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>File Transfer Ready - NaijaTransfer</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin: 0 0 10px 0; font-size: 24px;">📦 NaijaTransfer</h1>
          <p style="margin: 0; color: #6b7280;">Fast, secure file transfer made simple</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Your file transfer is ready!</h2>
          
          <p style="margin-bottom: 20px;">A file transfer has been sent to you${transfer.message ? ' with the following message:' : '.'}</p>
          
          ${transfer.message ? `
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p style="margin: 0; font-style: italic;">"${transfer.message}"</p>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${downloadUrl}" style="background-color: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
              📥 Download Files
            </a>
          </div>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⏰ <strong>Important:</strong> This transfer will expire in 7 days from now.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              Powered by <strong>NaijaTransfer</strong> - Fast & Secure File Transfer
            </p>
            <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;">
              Built on the Cloudflare Developer Platform
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    let allEmailsSent = true;
    
    // Send email to each recipient individually
    for (const email of allEmails) {
      try {
        const emailData = {
          from: 'NaijaTransfer <noreply@naijatransfer.com>',
          to: [email],
          subject: '📦 Your file transfer is ready for download',
          html: htmlContent
        };
        
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailData)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Resend error for ${email}:`, errorText);
          allEmailsSent = false;
        } else {
          console.log(`Email sent successfully to ${email}`);
        }
      } catch (error) {
        console.error(`Error sending email to ${email}:`, error);
        allEmailsSent = false;
      }
    }
    
    return allEmailsSent;
  } catch (error) {
    console.error('Error in sendEmailNotification:', error);
    return false;
  }
}

app.get("*", (c) => {
  const requestHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE,
  );

  return requestHandler(c.req.raw, {
    cloudflare: { env: c.env, ctx: c.executionCtx },
  });
});

// Cron job for cleanup
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('Running cleanup cron job...');
    
    try {
      const now = Date.now();
      
      // Get expired transfers
      const expiredTransfers = await env.DB.prepare(`
        SELECT id FROM transfers WHERE expires_at < ? AND status = 'complete'
      `).bind(now).all();
      
      for (const transfer of expiredTransfers.results as Array<{ id: string }>) {
        // Get files for this transfer
        const files = await env.DB.prepare(`
          SELECT r2_object_key FROM files WHERE transfer_id = ?
        `).bind(transfer.id).all();
        
        // Delete files from R2
        for (const file of files.results as Array<{ r2_object_key: string }>) {
          if (file.r2_object_key) {
            try {
              await env.FILE_BUCKET.delete(file.r2_object_key);
            } catch (error) {
              console.error(`Error deleting file ${file.r2_object_key}:`, error);
            }
          }
        }
        
        // Delete file records
        await env.DB.prepare(`
          DELETE FROM files WHERE transfer_id = ?
        `).bind(transfer.id).run();
        
        // Delete transfer record
        await env.DB.prepare(`
          DELETE FROM transfers WHERE id = ?
        `).bind(transfer.id).run();
      }
      
      console.log(`Cleaned up ${expiredTransfers.results.length} expired transfers`);
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
};
