-- Migration: Add GEO column to sites table
-- GEO is a 2-3 letter country/region code (e.g., "PL", "EN", "RU", "DE")
-- Default: "EN" (English/International)
-- Run with: node database/run_geo_migration.js

-- Add GEO column
ALTER TABLE sites ADD COLUMN IF NOT EXISTS geo VARCHAR(10) DEFAULT 'EN';

-- Create index for filtering by GEO
CREATE INDEX IF NOT EXISTS idx_sites_geo ON sites(geo);
