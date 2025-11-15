-- Migration: Add registration_tokens table for bulk WordPress site registration
-- Date: 2025-01-15
-- Purpose: Allow admins to generate tokens that WordPress sites can use to self-register

-- Create registration_tokens table
CREATE TABLE IF NOT EXISTS registration_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    label VARCHAR(255),
    max_uses INTEGER DEFAULT 0, -- 0 = unlimited
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_registration_tokens_token ON registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_registration_tokens_user_id ON registration_tokens(user_id);

-- Add comment explaining the table
COMMENT ON TABLE registration_tokens IS
'Stores registration tokens that allow WordPress sites to self-register. Admin generates token, distributes to WordPress sites via plugin.';

COMMENT ON COLUMN registration_tokens.max_uses IS
'Maximum number of times this token can be used. 0 = unlimited uses.';

COMMENT ON COLUMN registration_tokens.current_uses IS
'Number of times this token has been used for successful registrations.';
