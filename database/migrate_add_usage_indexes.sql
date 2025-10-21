-- Migration: Add composite indexes for usage tracking queries
-- Performance optimization for filtering by usage_count and usage_limit
-- Created: 2025-10-21

-- Add composite index on project_links for usage-based filtering
CREATE INDEX IF NOT EXISTS idx_project_links_usage
ON project_links(project_id, usage_count, usage_limit)
WHERE status = 'active';

-- Add composite index on project_articles for usage-based filtering
CREATE INDEX IF NOT EXISTS idx_project_articles_usage
ON project_articles(project_id, usage_count, usage_limit)
WHERE status = 'active';

-- Verify indexes created
\di idx_project_links_usage
\di idx_project_articles_usage
