-- migrations/0002_remove_email_fields.sql
-- Remove email fields from transfers table

-- Disable foreign key constraints temporarily
PRAGMA foreign_keys = OFF;

-- Create new transfers table with updated schema
CREATE TABLE transfers_new (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- Copy existing data (excluding email fields)
INSERT INTO transfers_new (id, status, expires_at, created_at)
SELECT id, status, expires_at, created_at FROM transfers;

-- Create new files table with the same schema but clean foreign key
CREATE TABLE files_new (
    id TEXT PRIMARY KEY,
    transfer_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    filesize INTEGER NOT NULL,
    r2_object_key TEXT,
    FOREIGN KEY (transfer_id) REFERENCES transfers_new(id)
);

-- Copy files data
INSERT INTO files_new (id, transfer_id, filename, filesize, r2_object_key)
SELECT id, transfer_id, filename, filesize, r2_object_key FROM files;

-- Drop old tables
DROP TABLE files;
DROP TABLE transfers;

-- Rename new tables
ALTER TABLE transfers_new RENAME TO transfers;
ALTER TABLE files_new RENAME TO files;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;