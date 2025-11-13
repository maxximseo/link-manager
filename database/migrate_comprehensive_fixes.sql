-- Comprehensive Migration: Fix Critical Issues
-- Date: 2025-01-13
-- Description: Multiple critical fixes and improvements

BEGIN;

-- FIX #1: Add CHECK constraint to placement_content
-- Ensures every placement_content has either link_id OR article_id (not both, not neither)
ALTER TABLE placement_content
ADD CONSTRAINT IF NOT EXISTS check_placement_content_has_content
CHECK (
  (link_id IS NOT NULL AND article_id IS NULL) OR
  (link_id IS NULL AND article_id IS NOT NULL)
);

COMMENT ON CONSTRAINT check_placement_content_has_content ON placement_content IS
  'Ensures placement has exactly one content type (link OR article)';

-- FIX #2: Add UNIQUE index on (project_id, LOWER(anchor_text))
-- Prevents duplicate anchor texts within same project at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_links_project_anchor_unique
ON project_links (project_id, LOWER(anchor_text));

COMMENT ON INDEX idx_project_links_project_anchor_unique IS
  'Ensures anchor texts are unique within each project (case-insensitive)';

-- FIX #3: Add slug field to project_articles
-- Required by wordpress.controller.js:56
ALTER TABLE project_articles
ADD COLUMN IF NOT EXISTS slug VARCHAR(500);

-- Generate slugs for existing articles from title
UPDATE project_articles
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
WHERE slug IS NULL;

COMMENT ON COLUMN project_articles.slug IS
  'URL-friendly slug for the article (auto-generated from title if not provided)';

-- FIX #4: Add index on placements(status)
-- Improves performance for filtering by status
CREATE INDEX IF NOT EXISTS idx_placements_status ON placements(status);

COMMENT ON INDEX idx_placements_status IS
  'Performance index for filtering placements by status';

-- FIX #5: Add position and html_context to project_links if missing
-- These fields are used by the system but may not exist in all schemas
ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS position VARCHAR(50),
ADD COLUMN IF NOT EXISTS html_context TEXT;

COMMENT ON COLUMN project_links.position IS 'Position of the link (header, footer, content, etc.)';
COMMENT ON COLUMN project_links.html_context IS 'HTML context where the link should be placed';

-- Verification queries
DO $$
DECLARE
    invalid_placement_content INTEGER;
    duplicate_anchors INTEGER;
    articles_without_slug INTEGER;
BEGIN
    -- Check for invalid placement_content
    SELECT COUNT(*) INTO invalid_placement_content
    FROM placement_content
    WHERE (link_id IS NULL AND article_id IS NULL)
       OR (link_id IS NOT NULL AND article_id IS NOT NULL);

    IF invalid_placement_content > 0 THEN
        RAISE WARNING '% invalid placement_content records found!', invalid_placement_content;
    ELSE
        RAISE NOTICE '✓ All placement_content records are valid';
    END IF;

    -- Check for duplicate anchor texts
    SELECT COUNT(*) INTO duplicate_anchors
    FROM (
        SELECT project_id, LOWER(anchor_text), COUNT(*) as cnt
        FROM project_links
        GROUP BY project_id, LOWER(anchor_text)
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_anchors > 0 THEN
        RAISE WARNING '% duplicate anchor texts found! These will cause UNIQUE constraint violations.', duplicate_anchors;
    ELSE
        RAISE NOTICE '✓ No duplicate anchor texts found';
    END IF;

    -- Check articles without slug
    SELECT COUNT(*) INTO articles_without_slug
    FROM project_articles
    WHERE slug IS NULL;

    IF articles_without_slug > 0 THEN
        RAISE WARNING '% articles without slug', articles_without_slug;
    ELSE
        RAISE NOTICE '✓ All articles have slugs';
    END IF;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE '========================================';
END $$;

COMMIT;
