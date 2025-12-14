-- Migration: Add locked bonus system for referral program
-- Description: Users who register via referral link get $50 locked bonus
--              Bonus unlocks after depositing $100+
-- Date: 2025-01-XX

BEGIN;

-- Add columns for locked bonus system
ALTER TABLE users
ADD COLUMN IF NOT EXISTS locked_bonus DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN IF NOT EXISTS locked_bonus_unlock_amount DECIMAL(10, 2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS locked_bonus_unlocked BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN users.locked_bonus IS 'Locked referral bonus amount (unlocks after deposit)';
COMMENT ON COLUMN users.locked_bonus_unlock_amount IS 'Minimum deposit amount required to unlock bonus';
COMMENT ON COLUMN users.locked_bonus_unlocked IS 'Whether the locked bonus has been unlocked';

-- Create index for finding users with locked bonus (for admin dashboard)
CREATE INDEX IF NOT EXISTS idx_users_locked_bonus ON users(locked_bonus) WHERE locked_bonus > 0;

COMMIT;
