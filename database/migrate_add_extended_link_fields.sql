-- Migration: Add extended fields to project_links for flexible content rendering
-- This allows passing any custom data (images, styles, attributes) through API to WordPress

-- Add new columns to project_links table
ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS link_attributes JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS wrapper_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN project_links.image_url IS 'URL of image to display with link';
COMMENT ON COLUMN project_links.link_attributes IS 'JSON object with link attributes (class, style, rel, target, title, data-*)';
COMMENT ON COLUMN project_links.wrapper_config IS 'JSON object with wrapper configuration (wrapper_tag, wrapper_class, wrapper_style)';
COMMENT ON COLUMN project_links.custom_data IS 'JSON object for any additional custom data';

-- Example usage:
-- image_url: 'https://example.com/image.jpg'
-- link_attributes: {"class": "custom-link", "rel": "nofollow sponsored", "target": "_blank", "data-id": "123"}
-- wrapper_config: {"wrapper_tag": "div", "wrapper_class": "link-wrapper", "wrapper_style": "margin: 10px;"}
-- custom_data: {"description": "Link description", "category": "main", "priority": 1}
