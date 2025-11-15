-- Migration: Remove UNIQUE constraint on anchor_text to allow duplicate anchors
-- Date: 2025-01-15
-- Purpose: Allow multiple links with the same anchor text in a project
--          Each link still has unique ID and can only be used once (usage_limit)

-- Drop the UNIQUE index on (project_id, anchor_text)
DROP INDEX IF EXISTS idx_project_links_project_anchor_unique;

-- Create a regular (non-unique) index for performance
-- This maintains query performance without enforcing uniqueness
CREATE INDEX IF NOT EXISTS idx_project_links_project_anchor
ON project_links (project_id, LOWER(anchor_text));

-- Add comment explaining the change
COMMENT ON INDEX idx_project_links_project_anchor IS
'Non-unique index for project_links anchor text lookup. Allows duplicate anchors while maintaining query performance.';
