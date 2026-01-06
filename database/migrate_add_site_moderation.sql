-- Migration: Add moderation columns to sites table
-- Date: 2026-01-06
-- Description: Adds columns for tracking site moderation workflow for public sale

-- Add moderation_status column
-- NULL = private (never requested public sale)
-- 'pending' = requested public sale, waiting for admin approval
-- 'approved' = admin approved, can be public
-- 'rejected' = admin rejected with reason
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT NULL;

-- Add rejection reason column
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create index for efficient queries on pending sites
CREATE INDEX IF NOT EXISTS idx_sites_moderation_status
ON sites(moderation_status)
WHERE moderation_status = 'pending';

-- Add comments for documentation
COMMENT ON COLUMN sites.moderation_status IS 'Moderation status: NULL (private), pending, approved, rejected';
COMMENT ON COLUMN sites.rejection_reason IS 'Reason provided when site was rejected from public marketplace';
