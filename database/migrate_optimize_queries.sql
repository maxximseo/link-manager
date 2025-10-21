-- Migration: Optimize slow queries with composite indexes
-- Addresses: Sites query (1144-2334ms), Project stats (1086-2547ms), Dashboard stats (1172-1191ms)
-- Created: 2025-10-21

-- Index 1: Sites query optimization
-- Query: SELECT ... FROM sites WHERE user_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_sites_user_created
ON sites(user_id, created_at DESC);

-- Index 2: Project links - optimize placement count joins
CREATE INDEX IF NOT EXISTS idx_project_links_project
ON project_links(project_id, id);

-- Index 3: Project articles - optimize placement count joins
CREATE INDEX IF NOT EXISTS idx_project_articles_project
ON project_articles(project_id, id);

-- Index 4: Placement content - optimize link/article counting
CREATE INDEX IF NOT EXISTS idx_placement_content_placement_link
ON placement_content(placement_id, link_id);

CREATE INDEX IF NOT EXISTS idx_placement_content_placement_article
ON placement_content(placement_id, article_id);

-- Index 5: Placements - optimize user-based filtering
CREATE INDEX IF NOT EXISTS idx_placements_site_project
ON placements(site_id, project_id, id);

-- Verify indexes created
SELECT indexname, tablename FROM pg_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
