-- Add missing created_at column to files table
ALTER TABLE files ADD COLUMN created_at INTEGER;

-- Update existing files to have a created_at timestamp (set to current time)
-- This is safe because it's just for display purposes
UPDATE files SET created_at = unixepoch() * 1000 WHERE created_at IS NULL;