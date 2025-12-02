-- Migration: Add updated_at column to placements table
-- This fixes the scheduled placements cron job failure:
-- "column updated_at of relation placements does not exist"

-- Step 1: Add the column
ALTER TABLE placements
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Update existing records with reasonable timestamps
UPDATE placements
SET updated_at = COALESCE(published_at, NOW())
WHERE updated_at IS NULL;

-- Step 3: Add NOT NULL constraint after populating data
-- (commented out - keeping nullable for flexibility)
-- ALTER TABLE placements ALTER COLUMN updated_at SET NOT NULL;

-- Verification query (run manually to confirm):
-- SELECT id, status, updated_at FROM placements LIMIT 10;
