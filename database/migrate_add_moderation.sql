-- Migration: Add moderation columns to placements table
-- Date: 2025-11-25
-- Description: Adds columns for tracking placement approval workflow

-- Add columns for moderation audit trail
ALTER TABLE placements
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create index for efficient queries on pending_approval status
CREATE INDEX IF NOT EXISTS idx_placements_pending_approval
ON placements(status)
WHERE status = 'pending_approval';

-- Add comment for documentation
COMMENT ON COLUMN placements.approved_at IS 'Timestamp when placement was approved by admin';
COMMENT ON COLUMN placements.approved_by IS 'Admin user_id who approved the placement';
COMMENT ON COLUMN placements.rejection_reason IS 'Reason provided when placement was rejected';
