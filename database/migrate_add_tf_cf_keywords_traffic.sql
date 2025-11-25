-- Migration: Add TF, CF, Keywords, Traffic columns to sites table
-- Date: November 2025
-- Version: 2.5.2
--
-- Parameters:
-- TF (Trust Flow) - Majestic metric, 0-100
-- CF (Citation Flow) - Majestic metric, 0-100
-- Keywords - Ahrefs keyword count, no upper limit
-- Traffic - Ahrefs traffic estimate, no upper limit

-- Add TF column (Trust Flow from Majestic)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS tf INTEGER DEFAULT 0;

-- Add CF column (Citation Flow from Majestic)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS cf INTEGER DEFAULT 0;

-- Add Keywords column (keyword count from Ahrefs)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS keywords INTEGER DEFAULT 0;

-- Add Traffic column (traffic estimate from Ahrefs)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS traffic INTEGER DEFAULT 0;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sites'
  AND column_name IN ('tf', 'cf', 'keywords', 'traffic')
ORDER BY column_name;
