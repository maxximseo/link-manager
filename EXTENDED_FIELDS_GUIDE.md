# Extended Fields Guide - Link Manager v2.5.0+

## Overview

Version 2.5.0 introduces flexible content rendering system. You can now pass any data from the admin panel to WordPress sites without modifying plugin code.

## New Database Fields

### project_links table

| Field | Type | Description |
|-------|------|-------------|
| `image_url` | VARCHAR(500) | URL of image to display with link |
| `link_attributes` | JSONB | Custom HTML attributes (class, style, rel, target, title, data-*) |
| `wrapper_config` | JSONB | Wrapper tag configuration (wrapper_tag, wrapper_class, wrapper_style) |
| `custom_data` | JSONB | Any additional custom data |

## API Response Format

The WordPress API endpoint now returns extended fields:

```json
{
  "links": [
    {
      "url": "https://example.com",
      "anchor_text": "Example Link",
      "html_context": "Check out <a href=\"...\">Example Link</a> for more info",
      "position": "",

      "image_url": "https://example.com/image.jpg",
      "link_attributes": {
        "class": "custom-link featured",
        "rel": "nofollow sponsored",
        "target": "_blank",
        "data-id": "12345",
        "data-category": "main"
      },
      "wrapper_config": {
        "wrapper_tag": "div",
        "wrapper_class": "link-wrapper highlighted",
        "wrapper_style": "border: 1px solid #ccc; padding: 10px;"
      },
      "custom_data": {
        "description": "This is a featured link",
        "category": "main",
        "priority": 1,
        "html": "<div class='custom'>...</div>"
      }
    }
  ]
}
```

## WordPress Plugin Templates

### Template: `default`

Standard rendering using `html_context` or simple anchor.

**Shortcode:**
```
[lm_links template="default"]
```

**Output:**
- If `html_context` exists: renders the HTML context
- If `wrapper_config` exists: wraps content in custom tag
- If `link_attributes` exists: adds custom attributes to anchor
- Otherwise: renders simple `<a>` tag

### Template: `with_image`

Displays image alongside link.

**Shortcode:**
```
[lm_links template="with_image"]
```

**Output:**
```html
<div class="lmw-link-with-image">
  <img src="..." alt="..." class="lmw-link-image" />
  <a href="..." class="...">Link Text</a>
</div>
```

### Template: `card`

Card layout with image, title, and description.

**Shortcode:**
```
[lm_links template="card"]
```

**Output:**
```html
<div class="lmw-link-card">
  <div class="lmw-card-image"><img src="..." alt="..." /></div>
  <div class="lmw-card-content">
    <h4 class="lmw-card-title"><a href="...">Link Text</a></h4>
    <p class="lmw-card-description">Description from custom_data</p>
  </div>
</div>
```

### Template: `custom`

Fully custom HTML rendering via `custom_data.html`.

**Shortcode:**
```
[lm_links template="custom"]
```

**Output:**
Uses `custom_data.html` field if provided, otherwise falls back to default template.

## Usage Examples

### Example 1: Simple Link with Custom Class

**Database entry:**
```sql
INSERT INTO project_links (anchor_text, url, link_attributes)
VALUES (
  'My Link',
  'https://example.com',
  '{"class": "btn btn-primary", "target": "_blank"}'::jsonb
);
```

**WordPress output:**
```html
<a href="https://example.com" class="btn btn-primary" target="_blank">My Link</a><br>
```

### Example 2: Link with Image

**Database entry:**
```sql
INSERT INTO project_links (anchor_text, url, image_url)
VALUES (
  'Featured Product',
  'https://example.com/product',
  'https://example.com/images/product.jpg'
);
```

**Shortcode:**
```
[lm_links template="with_image"]
```

**Output:**
```html
<div class="lmw-link-with-image">
  <img src="https://example.com/images/product.jpg" alt="Featured Product" class="lmw-link-image" />
  <a href="https://example.com/product" target="_blank">Featured Product</a>
</div>
```

### Example 3: Link with Wrapper

**Database entry:**
```sql
INSERT INTO project_links (anchor_text, url, wrapper_config)
VALUES (
  'Important Link',
  'https://example.com',
  '{"wrapper_tag": "div", "wrapper_class": "alert alert-info", "wrapper_style": "margin: 20px;"}'::jsonb
);
```

**Output:**
```html
<div class="alert alert-info" style="margin: 20px;">
  <a href="https://example.com" target="_blank">Important Link</a>
</div><br>
```

### Example 4: Card Layout with Description

**Database entry:**
```sql
INSERT INTO project_links (
  anchor_text, url, image_url, custom_data
) VALUES (
  'Premium Service',
  'https://example.com/service',
  'https://example.com/service-image.jpg',
  '{"description": "Best premium service for your business needs"}'::jsonb
);
```

**Shortcode:**
```
[lm_links template="card"]
```

**Output:**
```html
<div class="lmw-link-card">
  <div class="lmw-card-image"><img src="https://example.com/service-image.jpg" alt="Premium Service" /></div>
  <div class="lmw-card-content">
    <h4 class="lmw-card-title"><a href="https://example.com/service" target="_blank">Premium Service</a></h4>
    <p class="lmw-card-description">Best premium service for your business needs</p>
  </div>
</div>
```

### Example 5: Completely Custom HTML

**Database entry:**
```sql
INSERT INTO project_links (
  anchor_text, url, custom_data
) VALUES (
  'Custom Link',
  'https://example.com',
  '{"html": "<div class=\"custom-container\"><span class=\"icon\">🔗</span><a href=\"https://example.com\" class=\"custom-link\">Custom Link</a></div>"}'::jsonb
);
```

**Shortcode:**
```
[lm_links template="custom"]
```

**Output:**
```html
<div class="custom-container">
  <span class="icon">🔗</span>
  <a href="https://example.com" class="custom-link">Custom Link</a>
</div>
```

### Example 6: Link with SEO Attributes

**Database entry:**
```sql
INSERT INTO project_links (
  anchor_text, url, link_attributes
) VALUES (
  'Sponsored Link',
  'https://example.com',
  '{"rel": "nofollow sponsored", "title": "Visit our partner site", "class": "sponsored-link"}'::jsonb
);
```

**Output:**
```html
<a href="https://example.com" rel="nofollow sponsored" title="Visit our partner site" class="sponsored-link">Sponsored Link</a><br>
```

### Example 7: Link with Data Attributes

**Database entry:**
```sql
INSERT INTO project_links (
  anchor_text, url, link_attributes
) VALUES (
  'Tracked Link',
  'https://example.com',
  '{"data-id": "12345", "data-category": "main", "data-tracking": "true", "class": "tracked"}'::jsonb
);
```

**Output:**
```html
<a href="https://example.com" data-id="12345" data-category="main" data-tracking="true" class="tracked" target="_blank">Tracked Link</a><br>
```

## Allowed HTML Tags & Attributes

### Default Template
- `<a>`: href, target, rel, class, style, title
- `<strong>`, `<em>`, `<b>`, `<i>`
- `<span>`: class, style
- `<img>`: src, alt, class, style

### Custom Template
- All above tags plus:
- `<div>`: class, style, data-*

## Security

All HTML output is sanitized using WordPress `wp_kses()` function with allowed tags and attributes only. Custom data-* attributes are allowed but their values are escaped.

## Migration

To add extended fields to existing database:

```bash
node database/run_extended_fields_migration.js
```

This adds 4 new JSONB columns to `project_links` table.

## Styling

Add custom CSS to your WordPress theme to style the new elements:

```css
/* Link with image */
.lmw-link-with-image {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}

.lmw-link-image {
  max-width: 50px;
  height: auto;
}

/* Card layout */
.lmw-link-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  margin: 15px 0;
}

.lmw-card-image img {
  width: 100%;
  height: auto;
}

.lmw-card-content {
  padding: 15px;
}

.lmw-card-title {
  margin: 0 0 10px 0;
}

.lmw-card-description {
  color: #666;
  margin: 0;
}
```

## Backward Compatibility

All existing links continue to work without any changes. Extended fields are optional:
- If not provided, plugin uses default rendering
- `html_context` takes precedence when available
- Custom attributes are applied only when specified

## Future Enhancements

Possible future additions:
- Frontend UI for editing extended fields
- More built-in templates
- Template customization via admin panel
- Bulk update tools for extended fields
