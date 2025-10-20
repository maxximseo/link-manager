-- Add wordpress_post_id and status columns to placements table
-- Migration for existing databases

-- Add status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'placements'
        AND column_name = 'status'
    ) THEN
        ALTER TABLE placements ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
        RAISE NOTICE 'Added status column to placements table';
    END IF;
END $$;

-- Add wordpress_post_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'placements'
        AND column_name = 'wordpress_post_id'
    ) THEN
        ALTER TABLE placements ADD COLUMN wordpress_post_id INTEGER;
        RAISE NOTICE 'Added wordpress_post_id column to placements table';
    END IF;
END $$;

-- Update existing placements with default status
UPDATE placements SET status = 'pending' WHERE status IS NULL;

-- Create index for wordpress_post_id lookups
CREATE INDEX IF NOT EXISTS idx_placements_wordpress_post_id ON placements(wordpress_post_id);

-- Verification
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'placements'
AND column_name IN ('status', 'wordpress_post_id')
ORDER BY column_name;
