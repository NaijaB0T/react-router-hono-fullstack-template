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

const PaymentInitializeSchema = z.object({
  amount: z.number().int().min(10000), // Minimum ₦100 in kobo
  email: z.string().email()
});

const PaymentVerifySchema = z.object({
  reference: z.string()
});

const ExtendFileSchema = z.object({
  fileId: z.string(),
  days: z.number().int().min(1).max(365) // Max 1 year extension
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
    
    // Check if user is authenticated
    const authHeader = c.req.header('Authorization');
    const userId = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const isAuthenticated = !!userId;
    
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
      
      // Insert file record with user association if authenticated
      if (isAuthenticated) {
        await c.env.DB.prepare(`
          INSERT INTO files (id, transfer_id, filename, filesize, r2_object_key, user_id, is_managed, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          fileId,
          transferId,
          fileData.filename,
          fileData.filesize,
          r2Key,
          userId,
          1, // Mark as managed
          createdAt
        ).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO files (id, transfer_id, filename, filesize, r2_object_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          fileId,
          transferId,
          fileData.filename,
          fileData.filesize,
          r2Key,
          createdAt
        ).run();
      }
      
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

// File Management API Routes

// Calculate extension cost based on file size and days
function calculateExtensionCost(fileSizeBytes: number, days: number): number {
  const fileSizeGB = fileSizeBytes / (1024 * 1024 * 1024); // Convert bytes to GB
  const costPerGBPerDay = 2; // ₦2 per GB per day
  return Math.ceil(fileSizeGB * days * costPerGBPerDay); // Round up to nearest naira
}

// Get user's managed files
app.get("/api/files", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    
    // Get user's managed files
    const files = await c.env.DB.prepare(`
      SELECT f.*, t.status as transfer_status, t.created_at as transfer_created_at
      FROM files f
      LEFT JOIN transfers t ON f.transfer_id = t.id
      WHERE f.user_id = ? AND f.is_managed = 1
      ORDER BY f.created_at DESC
    `).bind(userId).all();
    
    return c.json({ 
      files: files.results?.map(file => ({
        ...file,
        // Calculate current expiry (either original 24h or extended)
        current_expiry: file.extended_until || (file.transfer_created_at + (24 * 60 * 60 * 1000)),
        // Calculate if file is expired
        is_expired: (file.extended_until || (file.transfer_created_at + (24 * 60 * 60 * 1000))) < Date.now(),
        // Calculate extension cost for 1 day
        extension_cost_per_day: calculateExtensionCost(file.filesize, 1)
      })) || []
    });
    
  } catch (error) {
    console.error('Error fetching user files:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Extend file expiry
app.post("/api/files/extend", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    const body = await c.req.json();
    const validatedData = ExtendFileSchema.parse(body);
    
    // Get file details
    const file = await c.env.DB.prepare(`
      SELECT f.*, t.created_at as transfer_created_at
      FROM files f
      LEFT JOIN transfers t ON f.transfer_id = t.id
      WHERE f.id = ? AND f.user_id = ? AND f.is_managed = 1
    `).bind(validatedData.fileId, userId).first();
    
    if (!file) {
      return c.json({ error: 'File not found or not accessible' }, 404);
    }
    
    // Calculate extension cost
    const extensionCost = calculateExtensionCost(file.filesize, validatedData.days);
    
    // Check user's credit balance
    const user = await c.env.DB.prepare(`
      SELECT credits FROM users WHERE id = ?
    `).bind(userId).first();
    
    if (!user || user.credits < extensionCost) {
      return c.json({ 
        error: 'Insufficient credits',
        required_credits: extensionCost,
        current_credits: user?.credits || 0
      }, 400);
    }
    
    // Calculate new expiry date
    const currentExpiry = file.extended_until || (file.transfer_created_at + (24 * 60 * 60 * 1000));
    const newExpiry = Math.max(currentExpiry, Date.now()) + (validatedData.days * 24 * 60 * 60 * 1000);
    
    // Start transaction
    const extensionId = crypto.randomUUID();
    const now = Date.now();
    
    // Deduct credits from user
    await c.env.DB.prepare(`
      UPDATE users SET credits = credits - ?, updated_at = ? WHERE id = ?
    `).bind(extensionCost, now, userId).run();
    
    // Update file expiry
    await c.env.DB.prepare(`
      UPDATE files SET 
        extended_until = ?,
        total_extensions = total_extensions + 1,
        total_extension_cost = total_extension_cost + ?
      WHERE id = ?
    `).bind(newExpiry, extensionCost, validatedData.fileId).run();
    
    // Record extension transaction
    await c.env.DB.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, credits, description, reference, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      'debit',
      extensionCost * 100, // Convert to kobo for consistency
      -extensionCost,
      `File extension - ${file.filename} for ${validatedData.days} day(s)`,
      `extension_${extensionId}`,
      'success',
      now,
      now
    ).run();
    
    // Record extension history
    await c.env.DB.prepare(`
      INSERT INTO file_extensions (id, file_id, user_id, days_extended, cost_in_credits, new_expiry_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      extensionId,
      validatedData.fileId,
      userId,
      validatedData.days,
      extensionCost,
      newExpiry,
      now
    ).run();
    
    return c.json({ 
      success: true,
      new_expiry: newExpiry,
      cost_paid: extensionCost,
      remaining_credits: user.credits - extensionCost
    });
    
  } catch (error) {
    console.error('Error extending file:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete managed file
app.delete("/api/files/:fileId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    const fileId = c.req.param('fileId');
    
    // Get file details
    const file = await c.env.DB.prepare(`
      SELECT * FROM files WHERE id = ? AND user_id = ? AND is_managed = 1
    `).bind(fileId, userId).first();
    
    if (!file) {
      return c.json({ error: 'File not found or not accessible' }, 404);
    }
    
    // Delete file from R2
    if (file.r2_object_key) {
      try {
        await c.env.FILE_BUCKET.delete(file.r2_object_key);
      } catch (error) {
        console.error('Error deleting file from R2:', error);
      }
    }
    
    // Delete file record and associated extensions
    await c.env.DB.prepare(`
      DELETE FROM file_extensions WHERE file_id = ?
    `).bind(fileId).run();
    
    await c.env.DB.prepare(`
      DELETE FROM files WHERE id = ?
    `).bind(fileId).run();
    
    return c.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting file:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get file extension history
app.get("/api/files/:fileId/extensions", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    const fileId = c.req.param('fileId');
    
    // Verify file ownership
    const file = await c.env.DB.prepare(`
      SELECT id FROM files WHERE id = ? AND user_id = ? AND is_managed = 1
    `).bind(fileId, userId).first();
    
    if (!file) {
      return c.json({ error: 'File not found or not accessible' }, 404);
    }
    
    // Get extension history
    const extensions = await c.env.DB.prepare(`
      SELECT * FROM file_extensions WHERE file_id = ? ORDER BY created_at DESC
    `).bind(fileId).all();
    
    return c.json({ extensions: extensions.results || [] });
    
  } catch (error) {
    console.error('Error fetching file extensions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Credits and Payment API Routes

// Get user credits
app.get("/api/credits", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    
    // Get or create user
    let user = await c.env.DB.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first();
    
    if (!user) {
      // Create user if doesn't exist
      await c.env.DB.prepare(`
        INSERT INTO users (id, email, credits, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(userId, 'user@example.com', 0, Date.now(), Date.now()).run();
      
      user = { id: userId, credits: 0 };
    }
    
    return c.json({ credits: user.credits || 0 });
    
  } catch (error) {
    console.error('Error fetching credits:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get user transactions
app.get("/api/transactions", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    
    // Get recent transactions with pagination
    const limit = parseInt(c.req.query('limit') || '10');
    const offset = parseInt(c.req.query('offset') || '0');
    
    const transactions = await c.env.DB.prepare(`
      SELECT id, type, amount, credits, description, status, created_at, updated_at
      FROM transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all();
    
    return c.json({ 
      transactions: transactions.results,
      total: transactions.results.length
    });
    
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Debug endpoint to check recent transactions for a user
app.get("/api/transactions/debug", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    
    // Get recent transactions
    const transactions = await c.env.DB.prepare(`
      SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `).bind(userId).all();
    
    return c.json({ 
      userId,
      transactions: transactions.results 
    });
    
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Initialize payment with Paystack
app.post("/api/payments/initialize", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = authHeader.slice(7);
    const body = await c.req.json();
    const validatedData = PaymentInitializeSchema.parse(body);
    
    // Create transaction record
    const transactionId = crypto.randomUUID();
    const reference = `aroko_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const credits = Math.floor(validatedData.amount / 100); // Convert kobo back to Naira (1 naira = 1 credit)
    
    await c.env.DB.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, credits, description, reference, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      transactionId,
      userId,
      'credit',
      validatedData.amount,
      credits,
      `Credit purchase - ${credits} credits`,
      reference,
      'pending',
      Date.now(),
      Date.now()
    ).run();
    
    // Initialize Paystack payment
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: validatedData.email,
        amount: validatedData.amount,
        reference: reference,
        callback_url: `${c.env.BASE_URL}/account?payment=success`,
        metadata: {
          userId: userId,
          transactionId: transactionId,
          credits: credits
        }
      })
    });
    
    if (!paystackResponse.ok) {
      throw new Error('Paystack initialization failed');
    }
    
    const paystackData = await paystackResponse.json();
    
    // Create payment record
    await c.env.DB.prepare(`
      INSERT INTO payments (id, user_id, transaction_id, paystack_reference, amount, status, paystack_response, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      transactionId,
      reference,
      validatedData.amount,
      'pending',
      JSON.stringify(paystackData),
      Date.now(),
      Date.now()
    ).run();
    
    return c.json(paystackData);
    
  } catch (error) {
    console.error('Error initializing payment:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Verify payment (webhook and manual verification)
app.post("/api/payments/verify", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = PaymentVerifySchema.parse(body);
    
    // Verify with Paystack
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${validatedData.reference}`, {
      headers: {
        'Authorization': `Bearer ${c.env.PAYSTACK_SECRET_KEY}`
      }
    });
    
    if (!paystackResponse.ok) {
      throw new Error('Paystack verification failed');
    }
    
    const paystackData = await paystackResponse.json();
    
    if (paystackData.status && paystackData.data.status === 'success') {
      // Get transaction
      const transaction = await c.env.DB.prepare(`
        SELECT * FROM transactions WHERE reference = ?
      `).bind(validatedData.reference).first();
      
      if (!transaction) {
        return c.json({ error: 'Transaction not found' }, 404);
      }
      
      // Check if transaction is already processed to prevent double crediting
      if (transaction.status === 'success') {
        return c.json({ status: 'already_processed', credits_added: transaction.credits });
      }
      
      // Update transaction status
      await c.env.DB.prepare(`
        UPDATE transactions SET status = 'success', updated_at = ? WHERE id = ?
      `).bind(Date.now(), transaction.id).run();
      
      // Update payment status
      await c.env.DB.prepare(`
        UPDATE payments SET status = 'success', paystack_response = ?, updated_at = ? WHERE paystack_reference = ?
      `).bind(JSON.stringify(paystackData), Date.now(), validatedData.reference).run();
      
      // Add credits to user account (only if transaction wasn't already successful)
      await c.env.DB.prepare(`
        UPDATE users SET credits = credits + ?, updated_at = ? WHERE id = ?
      `).bind(transaction.credits, Date.now(), transaction.user_id).run();
      
      return c.json({ status: 'success', credits_added: transaction.credits });
    } else {
      // Payment failed
      await c.env.DB.prepare(`
        UPDATE transactions SET status = 'failed', updated_at = ? WHERE reference = ?
      `).bind(Date.now(), validatedData.reference).run();
      
      await c.env.DB.prepare(`
        UPDATE payments SET status = 'failed', paystack_response = ?, updated_at = ? WHERE paystack_reference = ?
      `).bind(JSON.stringify(paystackData), Date.now(), validatedData.reference).run();
      
      return c.json({ status: 'failed', message: 'Payment verification failed' });
    }
    
  } catch (error) {
    console.error('Error verifying payment:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Paystack webhook
app.post("/api/webhooks/paystack", async (c) => {
  try {
    const body = await c.req.text();
    const signature = c.req.header('x-paystack-signature');
    
    // Verify webhook signature
    const hash = await crypto.subtle.digest(
      'SHA-512',
      new TextEncoder().encode(c.env.PAYSTACK_SECRET_KEY + body)
    );
    const expectedSignature = Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (signature !== expectedSignature) {
      return c.json({ error: 'Invalid signature' }, 400);
    }
    
    const event = JSON.parse(body);
    
    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      
      // Verify and process payment
      await fetch(`${c.env.BASE_URL}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference })
      });
    }
    
    return c.json({ status: 'success' });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
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
      
      // 1. Clean up completed expired transfers (unmanaged files)
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
      
      // 3. Clean up expired managed files (user files that weren't extended)
      const expiredManagedFiles = await env.DB.prepare(`
        SELECT f.id, f.r2_object_key, f.filename, t.created_at as transfer_created_at
        FROM files f
        LEFT JOIN transfers t ON f.transfer_id = t.id
        WHERE f.is_managed = 1 
        AND (
          (f.extended_until IS NOT NULL AND f.extended_until < ?) OR
          (f.extended_until IS NULL AND (t.created_at + 86400000) < ?)
        )
      `).bind(now, now).all();
      
      for (const file of expiredManagedFiles.results as Array<{ id: string, r2_object_key: string, filename: string }>) {
        try {
          // Delete file from R2
          if (file.r2_object_key) {
            await env.FILE_BUCKET.delete(file.r2_object_key);
            console.log(`Deleted expired managed file: ${file.filename}`);
          }
          
          // Delete file extensions
          await env.DB.prepare(`
            DELETE FROM file_extensions WHERE file_id = ?
          `).bind(file.id).run();
          
          // Delete file record
          await env.DB.prepare(`
            DELETE FROM files WHERE id = ?
          `).bind(file.id).run();
          
        } catch (error) {
          console.error(`Error cleaning up expired managed file ${file.filename}:`, error);
        }
      }
      
      console.log(`Cleaned up ${expiredTransfers.results.length} expired transfers, ${abandonedTransfers.results.length} abandoned transfers, and ${expiredManagedFiles.results.length} expired managed files`);
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
};
