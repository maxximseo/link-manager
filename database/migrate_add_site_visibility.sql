-- Migration: Add Site Visibility Control
-- Purpose: Add is_public column to control marketplace visibility
-- Date: 2025-11-14
--
-- Feature: Public/Private Sites
-- - Default: Sites are PRIVATE (is_public = FALSE)
-- - Owner can enable public purchases via checkbox
-- - Public sites appear in marketplace for all users
-- - Private sites only accessible to owner
--
-- Impact: All existing sites will become private (safe default)

BEGIN;

-- Step 1: Add is_public column with default FALSE
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- Step 2: Create index for marketplace queries (is_public + user_id)
CREATE INDEX IF NOT EXISTS idx_sites_visibility ON sites(is_public, user_id);

-- Step 3: Add column comment for documentation
COMMENT ON COLUMN sites.is_public IS 'Public marketplace visibility. TRUE = available for all users, FALSE = owner only (default)';

-- Step 4: Update table comment
COMMENT ON TABLE sites IS 'Website listings. Created 2025-01-13. Updated 2025-11-14: Added is_public for marketplace visibility control.';

COMMIT;

-- Verification queries (uncomment to test):
-- SELECT id, site_name, site_url, user_id, is_public FROM sites ORDER BY created_at DESC;
-- SELECT COUNT(*) as total_sites, SUM(CASE WHEN is_public THEN 1 ELSE 0 END) as public_sites FROM sites;
