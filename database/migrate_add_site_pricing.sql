-- Migration: Add custom pricing fields to sites table
-- Date: 2025-12-06
-- Purpose: Enable per-site custom pricing for link and article placements

-- Add price columns to sites table
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS price_link NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_article NUMERIC(10, 2) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN sites.price_link IS 'Custom price for link placements. NULL = use default $25.00';
COMMENT ON COLUMN sites.price_article IS 'Custom price for article/guest post placements. NULL = use default $15.00';

-- Existing sites will have NULL prices (use PRICING constants as fallback)
-- No need to UPDATE existing records, NULL is the correct value for "use default"
