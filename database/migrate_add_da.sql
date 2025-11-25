-- Migration: Add DA (Domain Authority) column to sites table
-- Domain Authority is a metric from MOZ (0-100)

-- Add DA column with default value 0
ALTER TABLE sites ADD COLUMN IF NOT EXISTS da INTEGER DEFAULT 0;

-- Create index for DA queries
CREATE INDEX IF NOT EXISTS idx_sites_da ON sites(da);

-- Verify migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites' AND column_name = 'da'
    ) THEN
        RAISE NOTICE 'DA column successfully added to sites table';
    ELSE
        RAISE EXCEPTION 'Failed to add DA column to sites table';
    END IF;
END $$;
