-- Migration: Add site_type support for static PHP sites
-- Version: 1.0
-- Date: 2025-01-13
-- Description: Adds site_type column to differentiate between WordPress and static PHP sites

BEGIN;

-- Add site_type column with default 'wordpress' for existing sites
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS site_type VARCHAR(20) DEFAULT 'wordpress';

-- Add check constraint to ensure only valid types
ALTER TABLE sites
ADD CONSTRAINT check_site_type CHECK (site_type IN ('wordpress', 'static_php'));

-- Create index for faster filtering by site type
CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(site_type);

-- Add comment for documentation
COMMENT ON COLUMN sites.site_type IS 'Type of site: wordpress (requires API key) or static_php (uses domain-based detection)';

-- For static_php sites, max_articles should be 0 (only links supported)
-- This constraint will be enforced in application logic, not at DB level

COMMIT;
