-- Migration: Add main_site_url column to projects table
-- Date: 2025-11-12
-- Purpose: Allow projects to have a main website URL for better organization

-- Check if column already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'projects'
        AND column_name = 'main_site_url'
    ) THEN
        -- Add main_site_url column
        ALTER TABLE projects
        ADD COLUMN main_site_url VARCHAR(500);

        RAISE NOTICE 'Column main_site_url added to projects table';
    ELSE
        RAISE NOTICE 'Column main_site_url already exists in projects table';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN projects.main_site_url IS 'Main website URL of the project (optional)';
