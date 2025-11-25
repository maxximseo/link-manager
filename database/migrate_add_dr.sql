-- Migration: Add DR (Domain Rating) column to sites table
-- Date: 2025-01-25
-- Purpose: Store Ahrefs Domain Rating for each site

-- Add DR column with default 0
ALTER TABLE sites ADD COLUMN IF NOT EXISTS dr INTEGER DEFAULT 0;

-- Create index for sorting/filtering by DR
CREATE INDEX IF NOT EXISTS idx_sites_dr ON sites(dr);

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'dr'
  ) THEN
    RAISE NOTICE 'DR column added successfully to sites table';
  ELSE
    RAISE EXCEPTION 'Failed to add DR column to sites table';
  END IF;
END $$;
