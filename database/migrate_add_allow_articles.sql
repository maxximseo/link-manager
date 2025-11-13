-- Migration: Add allow_articles column to sites table
-- Purpose: Allow WordPress site owners to disable article placements while keeping links enabled
-- Date: 2025-01-13

BEGIN;

-- Add column with default TRUE (all existing WordPress sites allow articles by default)
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS allow_articles BOOLEAN DEFAULT TRUE;

-- For static_php sites, force to FALSE (they never support articles anyway)
UPDATE sites
SET allow_articles = FALSE
WHERE site_type = 'static_php';

-- Add index for filtering when selecting sites for article placements
CREATE INDEX IF NOT EXISTS idx_sites_allow_articles
ON sites(allow_articles)
WHERE site_type = 'wordpress';

-- Add comment for documentation
COMMENT ON COLUMN sites.allow_articles IS 'Whether the site allows article placements. Links are always allowed. Static PHP sites always have this as FALSE.';

COMMIT;

-- Verification query (uncomment to test):
-- SELECT id, site_url, site_type, allow_articles, max_articles FROM sites ORDER BY site_type, id;
