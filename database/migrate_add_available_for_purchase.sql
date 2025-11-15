-- Migration: Add available_for_purchase column to sites table
-- Date: 2025-01-15
-- Purpose: Allow site owners to control whether their sites are available for new placements
--          When set to FALSE, site will not appear in placement purchase lists

-- Add the available_for_purchase column with default TRUE
ALTER TABLE sites ADD COLUMN IF NOT EXISTS available_for_purchase BOOLEAN DEFAULT TRUE;

-- Add comment explaining the column
COMMENT ON COLUMN sites.available_for_purchase IS
'Controls whether the site is available for new placements. When FALSE, site is hidden from placement purchase lists.';

-- Update any existing sites to have available_for_purchase = TRUE
UPDATE sites SET available_for_purchase = TRUE WHERE available_for_purchase IS NULL;
