-- Migration: Add updated_at column to tables that need it
-- This fixes errors like:
-- "column updated_at of relation placements does not exist"
-- "column updated_at of relation project_links does not exist"

-- Placements table
ALTER TABLE placements
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE placements
SET updated_at = COALESCE(published_at, NOW())
WHERE updated_at IS NULL;

-- Project links table
ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE project_links
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Project articles table
ALTER TABLE project_articles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE project_articles
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Registration tokens table
ALTER TABLE registration_tokens
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE registration_tokens
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Verification queries (run manually to confirm):
-- SELECT id, updated_at FROM placements LIMIT 5;
-- SELECT id, updated_at FROM project_links LIMIT 5;
-- SELECT id, updated_at FROM project_articles LIMIT 5;
