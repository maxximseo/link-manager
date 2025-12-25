-- Migration: Add pending_approval and rejected statuses to site_slot_rentals
-- Version: 2.8.1
-- Date: 2025-12-25
-- Description: Adds new statuses for rental approval workflow

BEGIN;

-- Drop existing constraint if exists
ALTER TABLE site_slot_rentals
  DROP CONSTRAINT IF EXISTS site_slot_rentals_status_check;

-- Add new constraint with expanded status values
ALTER TABLE site_slot_rentals
  ADD CONSTRAINT site_slot_rentals_status_check
  CHECK (status IN ('pending_approval', 'active', 'expired', 'cancelled', 'rejected'));

-- Add comment explaining statuses
COMMENT ON COLUMN site_slot_rentals.status IS 'Rental status: pending_approval (awaiting tenant confirmation), active (confirmed and paid), expired (past expiry date), cancelled (cancelled by owner), rejected (rejected by tenant)';

COMMIT;

-- Verification
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'site_slot_rentals_status_check';
