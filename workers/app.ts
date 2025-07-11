import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { z } from "zod";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Validation schemas
const CreateTransferSchema = z.object({
  files: z.array(z.object({
    filename: z.string(),
    filesize: z.number().positive().max(15 * 1024 * 1024 * 1024) // 15GB limit
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
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
    const createdAt = Date.now();
    
    console.log('Inserting transfer record...');
    console.log('Transfer ID:', transferId);
    
    // Check if database is available
    if (!c.env.DB) {
      console.error('Database binding not available');
      return c.json({ error: 'Database not configured' }, 500);
    }
    
    // Insert transfer record (handle both old and new schema)
    try {
      // Try new schema first
      await c.env.DB.prepare(`
        INSERT INTO transfers (id, status, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(
        transferId,
        'pending',
        expiresAt,
        createdAt
      ).run();
    } catch (error) {
      console.log('New schema failed, trying old schema compatibility...');
      // Fallback to old schema with dummy email values
      await c.env.DB.prepare(`
        INSERT INTO transfers (id, sender_email, recipient_emails, message, status, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        transferId,
        'anonymous@naijatransfer.com', // dummy email
        JSON.stringify(['anonymous@naijatransfer.com']), // dummy email array
        null, // no message
        'pending',
        expiresAt,
        createdAt
      ).run();
    }
    
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
    
    console.log(`Uploading part ${partNumber} for upload ${uploadId}`);
    
    const multipartUpload = c.env.FILE_BUCKET.resumeMultipartUpload(key, uploadId);
    const uploadPart = await multipartUpload.uploadPart(partNumber, chunk);
    
    console.log(`Part ${partNumber} uploaded successfully with etag: ${uploadPart.etag}`);
    
    return c.json({ 
      partNumber,
      etag: uploadPart.etag 
    });
    
  } catch (error) {
    console.error('Error uploading chunk:', error);
    return c.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Validate transfer for resumption
app.get("/api/transfers/validate/:transferId", async (c) => {
  try {
    const transferId = c.req.param('transferId');
    
    // Check if transfer exists and is not expired
    const transfer = await c.env.DB.prepare(`
      SELECT * FROM transfers WHERE id = ? AND expires_at > ?
    `).bind(transferId, Date.now()).first();
    
    if (!transfer) {
      return c.json({ 
        valid: false, 
        reason: 'Transfer not found or expired' 
      });
    }
    
    // If transfer is already complete, no need to resume
    if (transfer.status === 'complete') {
      return c.json({ 
        valid: false, 
        reason: 'Transfer already completed' 
      });
    }
    
    return c.json({ 
      valid: true, 
      transfer: {
        id: transfer.id,
        status: transfer.status,
        expires_at: transfer.expires_at,
        created_at: transfer.created_at
      }
    });
    
  } catch (error) {
    console.error('Error validating transfer:', error);
    return c.json({ 
      valid: false, 
      reason: 'Server error during validation' 
    }, 500);
  }
});

// Get upload status for resumption
app.get("/api/uploads/status/:transferId/:fileId", async (c) => {
  try {
    const transferId = c.req.param('transferId');
    const fileId = c.req.param('fileId');
    
    // Get file details from database
    const file = await c.env.DB.prepare(`
      SELECT * FROM files WHERE id = ? AND transfer_id = ?
    `).bind(fileId, transferId).first();
    
    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    // For R2, we can't directly query uploaded parts, but we can return what we know
    return c.json({
      fileId,
      filename: file.filename,
      filesize: file.filesize,
      r2_object_key: file.r2_object_key,
      // Note: R2 doesn't provide a way to list uploaded parts
      // so resumption relies on client-side state
      message: 'Use client-side state for resumption'
    });
    
  } catch (error) {
    console.error('Error getting upload status:', error);
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
    
    return c.json({ success: true, object });
    
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

// Helper function to clean up a completed transfer
async function cleanupTransfer(env: Env, transferId: string, reason: string) {
  try {
    // Get files for this transfer
    const files = await env.DB.prepare(`
      SELECT r2_object_key FROM files WHERE transfer_id = ?
    `).bind(transferId).all();
    
    // Delete files from R2
    for (const file of files.results as Array<{ r2_object_key: string }>) {
      if (file.r2_object_key) {
        try {
          await env.FILE_BUCKET.delete(file.r2_object_key);
          console.log(`Deleted ${reason} file: ${file.r2_object_key}`);
        } catch (error) {
          console.error(`Error deleting file ${file.r2_object_key}:`, error);
        }
      }
    }
    
    // Delete file records
    await env.DB.prepare(`
      DELETE FROM files WHERE transfer_id = ?
    `).bind(transferId).run();
    
    // Delete transfer record
    await env.DB.prepare(`
      DELETE FROM transfers WHERE id = ?
    `).bind(transferId).run();
    
  } catch (error) {
    console.error(`Error cleaning up transfer ${transferId}:`, error);
  }
}

// Helper function to clean up incomplete transfers and their multipart uploads
async function cleanupIncompleteTransfer(env: Env, transferId: string) {
  try {
    // Get files for this transfer with their upload metadata
    const files = await env.DB.prepare(`
      SELECT r2_object_key FROM files WHERE transfer_id = ?
    `).bind(transferId).all();
    
    // For incomplete transfers, we need to abort multipart uploads
    // Note: R2 doesn't provide a direct way to list/abort multipart uploads
    // So we'll just delete any partial objects and let R2's lifecycle policies handle cleanup
    for (const file of files.results as Array<{ r2_object_key: string }>) {
      if (file.r2_object_key) {
        try {
          // Try to delete the object (in case it was partially uploaded)
          await env.FILE_BUCKET.delete(file.r2_object_key);
          console.log(`Cleaned up abandoned upload: ${file.r2_object_key}`);
        } catch (error) {
          // This is expected for incomplete uploads - the object doesn't exist yet
          console.log(`No object to delete for ${file.r2_object_key} (expected for incomplete upload)`);
        }
      }
    }
    
    // Delete file records
    await env.DB.prepare(`
      DELETE FROM files WHERE transfer_id = ?
    `).bind(transferId).run();
    
    // Delete transfer record
    await env.DB.prepare(`
      DELETE FROM transfers WHERE id = ?
    `).bind(transferId).run();
    
    console.log(`Cleaned up abandoned transfer: ${transferId}`);
    
  } catch (error) {
    console.error(`Error cleaning up incomplete transfer ${transferId}:`, error);
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
      
      // 1. Clean up completed expired transfers
      const expiredTransfers = await env.DB.prepare(`
        SELECT id FROM transfers WHERE expires_at < ? AND status = 'complete'
      `).bind(now).all();
      
      for (const transfer of expiredTransfers.results as Array<{ id: string }>) {
        await cleanupTransfer(env, transfer.id, 'expired completed');
      }
      
      // 2. Clean up abandoned incomplete transfers (older than 24 hours)
      const abandonedTransfers = await env.DB.prepare(`
        SELECT id FROM transfers WHERE expires_at < ? AND status = 'pending'
      `).bind(now).all();
      
      for (const transfer of abandonedTransfers.results as Array<{ id: string }>) {
        await cleanupIncompleteTransfer(env, transfer.id);
      }
      
      console.log(`Cleaned up ${expiredTransfers.results.length} expired transfers and ${abandonedTransfers.results.length} abandoned transfers`);
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
};
