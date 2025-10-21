-- Migration: Add composite index for placement queries
-- Performance optimization for frequent project+site lookups
-- Created: 2025-10-21

-- Add composite index on placements(project_id, site_id)
-- This index speeds up queries that check if placement exists for a project+site combination
CREATE INDEX IF NOT EXISTS idx_placements_project_site
ON placements(project_id, site_id);

-- Verify index created
\di idx_placements_project_site
