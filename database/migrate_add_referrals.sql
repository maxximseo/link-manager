-- Migration: Add Referral/Affiliate System
-- Version: 2.7.0
-- Date: 2025-12-09
-- Description: Adds referral tracking with 20% commission system

-- Add new columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_balance DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_referral_earnings DECIMAL(10,2) DEFAULT 0;

-- Create index for referral lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id);

-- Set default referral_code = username for existing users
UPDATE users
SET referral_code = username
WHERE referral_code IS NULL;

-- Create referral_transactions table
CREATE TABLE IF NOT EXISTS referral_transactions (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    placement_id INTEGER REFERENCES placements(id) ON DELETE SET NULL,
    transaction_amount DECIMAL(10,2) NOT NULL,
    commission_rate INTEGER DEFAULT 20,
    commission_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'credited',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for referral_transactions
CREATE INDEX IF NOT EXISTS idx_referral_transactions_referrer ON referral_transactions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_referee ON referral_transactions(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_status ON referral_transactions(status);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_created_at ON referral_transactions(created_at);

-- Create referral_withdrawals table for tracking withdrawal requests
CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_user ON referral_withdrawals(user_id);

-- Comments
COMMENT ON COLUMN users.referral_code IS 'Unique referral code for affiliate links (default: username)';
COMMENT ON COLUMN users.referred_by_user_id IS 'User ID who referred this user';
COMMENT ON COLUMN users.referral_balance IS 'Current withdrawable referral earnings';
COMMENT ON COLUMN users.total_referral_earnings IS 'Total lifetime referral earnings';
COMMENT ON TABLE referral_transactions IS 'Tracks all referral commissions (20% of final_price)';
COMMENT ON TABLE referral_withdrawals IS 'Tracks referral balance withdrawals to main balance';
