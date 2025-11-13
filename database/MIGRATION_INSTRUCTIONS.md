# Database Migration Instructions

## Issue: column "user_id" of relation "placements" does not exist

This error occurs when the production database was created from an older version of `init.sql` that didn't include the `user_id` column in the `placements` table.

## Solution

Run the migration script on your production server to add the `user_id` column:

### Option 1: Via SSH to Production Server

```bash
# SSH into your DigitalOcean droplet or app server
ssh user@your-server

# Navigate to the project directory
cd /path/to/link-manager

# Run the migration
node database/run_user_id_migration.js
```

### Option 2: Via DigitalOcean Console

1. Go to your DigitalOcean Database cluster
2. Open the console/terminal
3. Connect to your database:
```bash
psql $DATABASE_URL
```
4. Run the migration SQL directly:
```sql
BEGIN;

ALTER TABLE placements
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_placements_user ON placements(user_id);

UPDATE placements p
SET user_id = pr.user_id
FROM projects pr
WHERE p.project_id = pr.id
AND p.user_id IS NULL;

COMMIT;
```

### Option 3: From Local Machine (if you have DATABASE_URL in .env)

```bash
# Make sure your .env file has the correct DATABASE_URL
node database/run_user_id_migration.js
```

## Verification

After running the migration, verify it worked:

```sql
-- Check if user_id column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'placements'
AND column_name = 'user_id';

-- Check if all placements have user_id populated
SELECT COUNT(*) as placements_without_user_id
FROM placements
WHERE user_id IS NULL;
```

## What This Migration Does

1. **Adds user_id column** to placements table (if it doesn't exist)
2. **Creates index** on user_id for better query performance
3. **Populates user_id** for existing placements by looking up the user_id from the related project

## After Migration

Once the migration is complete:
1. Restart your application server
2. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)
3. Try creating a placement again

The error should be resolved.
