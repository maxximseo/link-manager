-- Migration: Add usage tracking to links and articles
-- Date: 2025-10-03

-- Add fields to project_links
ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS usage_limit INTEGER DEFAULT 999,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Add fields to project_articles
ALTER TABLE project_articles
ADD COLUMN IF NOT EXISTS usage_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_project_links_status ON project_links(status);
CREATE INDEX IF NOT EXISTS idx_project_articles_status ON project_articles(status);

-- Update existing records usage_count based on placement_content
UPDATE project_links pl
SET usage_count = (
    SELECT COUNT(DISTINCT pc.id)
    FROM placement_content pc
    WHERE pc.link_id = pl.id
)
WHERE EXISTS (
    SELECT 1 FROM placement_content pc WHERE pc.link_id = pl.id
);

UPDATE project_articles pa
SET usage_count = (
    SELECT COUNT(DISTINCT pc.id)
    FROM placement_content pc
    WHERE pc.article_id = pa.id
)
WHERE EXISTS (
    SELECT 1 FROM placement_content pc WHERE pc.article_id = pa.id
);

-- Update status based on usage
UPDATE project_links
SET status = 'exhausted'
WHERE usage_count >= usage_limit;

UPDATE project_articles
SET status = 'exhausted'
WHERE usage_count >= usage_limit;

-- Comment
COMMENT ON COLUMN project_links.usage_limit IS 'Maximum number of times this link can be used (999 = unlimited)';
COMMENT ON COLUMN project_links.usage_count IS 'Current number of times this link has been used';
COMMENT ON COLUMN project_links.status IS 'Status: active, exhausted';

COMMENT ON COLUMN project_articles.usage_limit IS 'Maximum number of times this article can be used (always 1)';
COMMENT ON COLUMN project_articles.usage_count IS 'Current number of times this article has been used';
COMMENT ON COLUMN project_articles.status IS 'Status: active, exhausted';
