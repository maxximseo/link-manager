-- Migration: Backfill NULL site_type values with 'wordpress'
-- Date: 2025-01-13
-- Description: Sets default site_type to 'wordpress' for all existing sites with NULL value

BEGIN;

-- Update all NULL site_type values to 'wordpress' (default)
UPDATE sites
SET site_type = 'wordpress'
WHERE site_type IS NULL;

-- Log the number of rows updated
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % sites with NULL site_type to wordpress', updated_count;
END $$;

COMMIT;
