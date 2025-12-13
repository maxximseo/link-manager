-- Migration: Add site moderation system
-- Version: 2.7.0
-- Date: 2025-12-12
-- Description: Adds moderation_status and rejection_reason columns to sites table

-- Add moderation_status column
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'pending';

-- Add rejection_reason column for storing rejection explanations
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update existing public sites to approved status
UPDATE sites
SET moderation_status = 'approved'
WHERE is_public = true AND moderation_status = 'pending';

-- Create index for faster moderation queries
CREATE INDEX IF NOT EXISTS idx_sites_moderation_status ON sites(moderation_status);

-- Add comment for documentation
COMMENT ON COLUMN sites.moderation_status IS 'Site moderation status: pending, approved, rejected';
COMMENT ON COLUMN sites.rejection_reason IS 'Reason for site rejection (only for rejected status)';
