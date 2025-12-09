-- Migration: Add USDT TRC20 wallet support to referral system
-- Date: 2025-12-09

-- Add USDT wallet column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS usdt_wallet VARCHAR(100);

-- Add column to track when wallet was last updated (for 1 month cooldown)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS usdt_wallet_updated_at TIMESTAMP;

-- Add new columns to referral_withdrawals table for wallet withdrawals
ALTER TABLE referral_withdrawals
ADD COLUMN IF NOT EXISTS withdrawal_type VARCHAR(20) DEFAULT 'balance',
ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(100),
ADD COLUMN IF NOT EXISTS admin_comment TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processed_by INTEGER REFERENCES users(id);

-- Update existing withdrawals to have 'balance' type
UPDATE referral_withdrawals
SET withdrawal_type = 'balance'
WHERE withdrawal_type IS NULL;

-- Create index for faster admin queries
CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_status ON referral_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_withdrawal_type ON referral_withdrawals(withdrawal_type);

-- Comments
COMMENT ON COLUMN users.usdt_wallet IS 'USDT TRC20 wallet address for referral withdrawals';
COMMENT ON COLUMN referral_withdrawals.withdrawal_type IS 'Type: balance (instant) or wallet (requires admin approval)';
COMMENT ON COLUMN referral_withdrawals.wallet_address IS 'USDT TRC20 wallet address at time of withdrawal';
COMMENT ON COLUMN referral_withdrawals.admin_comment IS 'Admin comment (used for rejection reason)';
COMMENT ON COLUMN referral_withdrawals.processed_at IS 'When the withdrawal was processed by admin';
COMMENT ON COLUMN referral_withdrawals.processed_by IS 'Admin user who processed the withdrawal';
