-- Migration: Add updated_at columns to users and sites tables
-- Version: 2.8.1
-- Date: 2025-12-24
-- Description: Required for slot rental system to track modification times

BEGIN;

-- ============================================
-- 1. Add updated_at to users table
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- 2. Add updated_at to sites table
-- ============================================

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- 3. Add comments
-- ============================================

COMMENT ON COLUMN users.updated_at IS 'Timestamp of last update to user record';
COMMENT ON COLUMN sites.updated_at IS 'Timestamp of last update to site record';

COMMIT;
