-- Fix usage_count for already placed articles and links
-- This migration updates usage_count based on actual placements in placement_content

-- Update usage_count for project_links based on placement_content
UPDATE project_links pl
SET usage_count = (
  SELECT COUNT(DISTINCT pc.placement_id)
  FROM placement_content pc
  WHERE pc.link_id = pl.id
);

-- Update usage_count for project_articles based on placement_content
UPDATE project_articles pa
SET usage_count = (
  SELECT COUNT(DISTINCT pc.placement_id)
  FROM placement_content pc
  WHERE pc.article_id = pa.id
);

-- Show results
SELECT 'Links with usage_count > 0' as info, COUNT(*) as count
FROM project_links
WHERE usage_count > 0
UNION ALL
SELECT 'Articles with usage_count > 0' as info, COUNT(*) as count
FROM project_articles
WHERE usage_count > 0;
