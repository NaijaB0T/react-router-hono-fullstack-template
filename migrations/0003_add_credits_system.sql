-- Add credits system tables
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  credits INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'credit' or 'debit'
  amount INTEGER NOT NULL, -- in kobo (smallest currency unit)
  credits INTEGER NOT NULL, -- credits amount
  description TEXT NOT NULL,
  reference TEXT UNIQUE, -- Paystack reference or internal reference
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  paystack_reference TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL, -- in kobo
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  paystack_response TEXT, -- JSON response from Paystack
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (transaction_id) REFERENCES transactions (id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);