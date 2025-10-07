-- Remove description column from projects table
-- This migration removes the unused description field

ALTER TABLE projects DROP COLUMN IF EXISTS description;
