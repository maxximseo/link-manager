-- Migration: Add limits_changed_at column to sites table
-- Purpose: Track when max_links/max_articles were last changed by non-admin users
-- Restriction: Users can only change these values once every 6 months

-- Add column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites' AND column_name = 'limits_changed_at'
    ) THEN
        ALTER TABLE sites ADD COLUMN limits_changed_at TIMESTAMP DEFAULT NULL;
        RAISE NOTICE 'Added limits_changed_at column to sites table';
    ELSE
        RAISE NOTICE 'limits_changed_at column already exists';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN sites.limits_changed_at IS 'Timestamp when max_links/max_articles were last changed by non-admin user. Used for 6-month cooldown enforcement.';
