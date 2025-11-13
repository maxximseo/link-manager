-- ============================================
-- Migration: Add user_id to placements table
-- Description: Adds user_id column to placements if it doesn't exist
-- Date: 2025-11-13
-- ============================================

BEGIN;

-- Add user_id column if it doesn't exist
ALTER TABLE placements
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Create index for user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_placements_user ON placements(user_id);

-- Populate user_id from projects for existing placements
UPDATE placements p
SET user_id = pr.user_id
FROM projects pr
WHERE p.project_id = pr.id
AND p.user_id IS NULL;

COMMIT;

-- ============================================
-- Migration completed successfully
-- ============================================
