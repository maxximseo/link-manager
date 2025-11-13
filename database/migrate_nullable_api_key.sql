-- Migration: Make api_key nullable for static PHP sites
-- Date: 2025-11-13
-- Description: Remove NOT NULL constraint from sites.api_key to allow static_php sites without API keys

BEGIN;

-- Check if constraint exists and remove it
ALTER TABLE sites ALTER COLUMN api_key DROP NOT NULL;

-- Verify the change
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'sites' AND column_name = 'api_key';

COMMIT;

-- Expected result: api_key should have is_nullable = 'YES'
