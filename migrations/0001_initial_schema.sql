-- migrations/0001_initial_schema.sql
CREATE TABLE transfers (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending', -- pending -> complete -> expired
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
