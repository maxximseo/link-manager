-- Migration: Change link usage_limit default to 1 and add html_context
-- Date: 2025-10-07

-- Add html_context field for surrounding text
ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS html_context TEXT;

-- Update default for new links (can't change existing DEFAULT constraint)
-- Instead, update existing links to usage_limit=1
UPDATE project_links
SET usage_limit = 1
WHERE usage_limit = 999;

-- Alter default for future inserts
ALTER TABLE project_links
ALTER COLUMN usage_limit SET DEFAULT 1;

-- Add position field if not exists (for ordering in content)
ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

COMMENT ON COLUMN project_links.html_context IS 'Full HTML context surrounding the link (e.g., "Visit <a href=...>anchor</a> for more info")';
COMMENT ON COLUMN project_links.usage_limit IS 'Maximum number of times this link can be used (default 1)';
COMMENT ON COLUMN project_links.position IS 'Position/order in the article where this link should appear';
