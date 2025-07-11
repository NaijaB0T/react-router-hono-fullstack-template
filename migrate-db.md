# Database Migration Instructions

## Option 1: Automatic Migration (Recommended)
The backend now automatically handles both old and new database schemas. Just try uploading a file and it should work.

## Option 2: Manual Migration (If needed)

If you want to manually update the database to the new schema, you can run these SQL commands:

### For Local Development:
```bash
# Connect to local D1 database
wrangler d1 execute naijatransfer-db --local --command="
CREATE TABLE transfers_new (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

INSERT INTO transfers_new (id, status, expires_at, created_at)
SELECT id, status, expires_at, created_at FROM transfers;

DROP TABLE transfers;
ALTER TABLE transfers_new RENAME TO transfers;
"
```

### For Production:
```bash
# Connect to production D1 database
wrangler d1 execute naijatransfer-db --command="
CREATE TABLE transfers_new (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

INSERT INTO transfers_new (id, status, expires_at, created_at)
SELECT id, status, expires_at, created_at FROM transfers;

DROP TABLE transfers;
ALTER TABLE transfers_new RENAME TO transfers;
"
```

## Option 3: Fresh Start
If you want to start completely fresh (this will delete all existing transfers):

```bash
# Local
wrangler d1 execute naijatransfer-db --local --file="./migrations/0001_initial_schema.sql"

# Production
wrangler d1 execute naijatransfer-db --file="./migrations/0001_initial_schema.sql"
```

## Verification
After migration, you can verify the schema:

```bash
wrangler d1 execute naijatransfer-db --local --command="PRAGMA table_info(transfers);"
```

The output should show only these columns:
- id (TEXT, PRIMARY KEY)
- status (TEXT, NOT NULL, DEFAULT 'pending')
- expires_at (INTEGER, NOT NULL)
- created_at (INTEGER, NOT NULL)