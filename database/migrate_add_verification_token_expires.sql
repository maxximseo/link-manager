-- Migration: Add verification_token_expires_at column to users table
-- Version: 2.8.1
-- Date: 2025-12-24
-- Description: Fixes registration error where column was missing

BEGIN;

-- Add the missing column for email verification token expiry
ALTER TABLE users
ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP WITHOUT TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN users.verification_token_expires_at IS 'Expiration timestamp for email verification token';

COMMIT;
