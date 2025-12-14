-- Migration: Add verification_token_expires_at column to users table
-- Date: 2025-12-14
-- Purpose: Allow email verification tokens to expire after 24 hours

-- Add expiration column for verification tokens
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;

-- Update existing tokens to expire in 24 hours (for any pending verifications)
UPDATE users
SET verification_token_expires_at = NOW() + INTERVAL '24 hours'
WHERE verification_token IS NOT NULL AND verification_token_expires_at IS NULL;
