-- Migration: Add history JSONB column to site_slot_rentals
-- Purpose: Track all rental lifecycle events (created, approved, rejected, etc.)
-- Date: 2025-12-25

BEGIN;

-- Add history column (array of audit events)
ALTER TABLE site_slot_rentals
ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for fast JSONB queries (optional, for future analytics)
CREATE INDEX IF NOT EXISTS idx_site_slot_rentals_history
ON site_slot_rentals USING GIN (history);

-- Verify column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'site_slot_rentals'
    AND column_name = 'history'
  ) THEN
    RAISE NOTICE 'SUCCESS: history column added to site_slot_rentals';
  ELSE
    RAISE EXCEPTION 'FAILED: history column was not added';
  END IF;
END $$;

COMMIT;
