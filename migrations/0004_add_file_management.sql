-- Add user file management features
-- Add user_id column to files table to track ownership
ALTER TABLE files ADD COLUMN user_id TEXT;

-- Add extension tracking columns
ALTER TABLE files ADD COLUMN extended_until INTEGER; -- Unix timestamp for when file expires (can be extended beyond 24h)
ALTER TABLE files ADD COLUMN is_managed BOOLEAN DEFAULT 0; -- Whether file is managed by authenticated user
ALTER TABLE files ADD COLUMN total_extensions INTEGER DEFAULT 0; -- Number of times file has been extended
ALTER TABLE files ADD COLUMN total_extension_cost INTEGER DEFAULT 0; -- Total credits spent on extensions
ALTER TABLE files ADD COLUMN created_at INTEGER; -- Unix timestamp for when file was created

-- Create index for efficient querying
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_extended_until ON files(extended_until);
CREATE INDEX idx_files_is_managed ON files(is_managed);

-- Create file_extensions table to track extension history
CREATE TABLE file_extensions (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    days_extended INTEGER NOT NULL,
    cost_in_credits INTEGER NOT NULL,
    new_expiry_date INTEGER NOT NULL, -- Unix timestamp
    created_at INTEGER NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX idx_file_extensions_file_id ON file_extensions(file_id);
CREATE INDEX idx_file_extensions_user_id ON file_extensions(user_id);