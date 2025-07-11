-- Reset database to new schema
-- This will delete all existing data

-- Drop tables if they exist
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS transfers;

-- Create new schema
CREATE TABLE transfers (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE files (
    id TEXT PRIMARY KEY,
    transfer_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    filesize INTEGER NOT NULL,
    r2_object_key TEXT,
    FOREIGN KEY (transfer_id) REFERENCES transfers(id)
);