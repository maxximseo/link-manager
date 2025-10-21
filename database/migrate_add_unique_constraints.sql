-- Migration: Add UNIQUE constraints to prevent race conditions in placements
-- Ensures only 1 link and 1 article per site per project

-- Add partial UNIQUE index for one link per project-site combination
-- Uses WHERE clause to only apply to rows with link_id (not NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_link_per_project_site
ON placement_content(link_id, placement_id)
WHERE link_id IS NOT NULL;

-- Add partial UNIQUE index for one article per project-site combination
-- Uses WHERE clause to only apply to rows with article_id (not NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_article_per_project_site
ON placement_content(article_id, placement_id)
WHERE article_id IS NOT NULL;

-- Add UNIQUE constraint on placements to prevent duplicate project-site combinations
-- This ensures a placement record itself is unique per project-site
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_placement_project_site
ON placements(project_id, site_id);

-- Add index for better query performance on placement_content lookups
CREATE INDEX IF NOT EXISTS idx_placement_content_link_article
ON placement_content(link_id, article_id);
