# Link Manager Widget Pro

WordPress plugin for displaying content placed through the Link Manager system.

## Installation

1. Upload the `link-manager-widget.php` file and `assets` folder to your WordPress plugins directory (`/wp-content/plugins/link-manager-widget/`)
2. Activate the plugin through the WordPress admin panel
3. Go to Settings → Link Manager Widget to configure the API connection

## Configuration

### Required Settings

1. **API Key**: Your site's unique API key (auto-generated or manually set)
2. **API Endpoint**: The Link Manager API URL (default: https://shark-app-9kv6u.ondigitalocean.app/api)
3. **Cache Duration**: How long to cache content from the API (default: 3600 seconds)

## Usage

### Shortcodes

Display all placed content:
```
[link_manager]
```

Display only links:
```
[lm_links]
[lm_links position="header"]
[lm_links limit="10" style="inline"]
```

### Articles

**Important:** Articles are now automatically published as full WordPress posts when placed on your site. They are NOT displayed through shortcodes or widgets. Each article becomes a complete WordPress post with:
- Full content and formatting
- SEO-friendly permalinks
- Categories and tags support
- WordPress post management capabilities

### Widgets

The plugin provides one widget that can be added through **Appearance → Widgets**:

1. **Link Manager Links** - Display links in sidebar/footer

### Shortcode Parameters

#### Links Shortcode
- `position` - Filter links by position (header/footer/sidebar)
- `limit` - Maximum number of links to display
- `style` - Display style (list/inline)

## Styling

The plugin includes default styles that can be customized through your theme's CSS. Main CSS classes:

- `.lmw-content` - Main container
- `.lmw-links` - Links container
- `.lmw-articles` - Articles container
- `.lmw-article` - Individual article
- `.lmw-article-title` - Article title
- `.lmw-article-content` - Article content

## API Integration

The plugin fetches content from the Link Manager API endpoint:
```
GET /api/wordpress/get-content/{api_key}
```

Content is cached to reduce API calls and improve performance.

## Requirements

- WordPress 5.0 or higher
- PHP 7.0 or higher
- Active Link Manager account with placed content

## Support

For issues or questions, please contact the Link Manager support team or create an issue on GitHub.