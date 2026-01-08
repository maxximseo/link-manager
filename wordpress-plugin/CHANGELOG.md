# Link Manager Widget Pro - Changelog

## Version 2.6.1 (2026-01-08)

### Changed
- **Simplified admin interface**: Removed redundant sections for cleaner settings page
- **Status section moved to top**: Connection status and quotas now displayed immediately after page title
- No need to scroll down or click buttons to see site connection status

### Removed
- **Test Connection button**: Status is now shown automatically at page load
- **Basic Usage documentation**: Shortcode examples removed from settings
- **Templates documentation**: Template examples removed from settings
- **Extended Fields Support section**: Technical documentation removed from settings
- **Widgets section**: Widget documentation removed from settings

### UI/UX
- Admin page now shows only essential information:
  1. Quick Registration Form (only if no API key)
  2. Status (connection, site name, quotas)
  3. Settings (API Key, Endpoint, Cache Duration)
- Faster page load without JavaScript for test connection
- Cleaner interface focused on configuration

---

## Version 2.6.0 (2025-12-26)

### Added
- **Multi-layer fallback caching**: 3-level cache system to keep links visible even when API is unavailable
  - Level 1: WordPress Transient (5 minutes) - fast, volatile
  - Level 2: wp_options persistent storage (7 days) - survives cache clears
  - Level 3: File-based cache (UNLIMITED) - emergency fallback, persists until API responds
- **Automatic endpoint migration**: Plugin can receive new API endpoint from server response
  - Checks for `endpoint_update` field in API response
  - Automatically updates stored endpoint when migration is available
  - Saves previous endpoint for potential rollback
- New constant `LMW_PERSISTENT_TTL` (7 days) for persistent storage
- Methods: `get_persistent_storage()`, `update_persistent_storage()`, `get_file_cache()`, `update_file_cache()`, `check_endpoint_update()`

### Improved
- **Enhanced resilience**: Plugin continues showing existing links even if API is down for days/weeks
- Reduced API timeout from 30s to 15s for faster fallback
- Error logging for all fallback scenarios

### Architecture
- Cache fallback chain: Transient → wp_options → File
- On API success: Updates ALL three cache layers
- On API failure: Falls back through layers until content found
- File cache location: `wp-content/cache/lmw_{hash}.json`

### Use Cases
- **API server downtime**: Links remain visible from persistent/file cache
- **Domain migration**: Admin can broadcast new endpoint to all 200+ sites from dashboard
- **Network issues**: Graceful degradation with cached content

---

## Version 2.4.5 (2025-01-16)

### Added
- **Comprehensive status display**: Status section now shows both placed content AND available quotas
- New method `verify_api_connection()` to fetch site quotas from `/wordpress/verify` endpoint
- Automatic caching of verification data (5 minutes)

### Improved
- **Enhanced Status section** displays:
  - Site name
  - **Placed content**: Count of actually placed links and articles
  - **Links quota**: Used/Max with available count (color-coded)
  - **Articles quota**: Used/Max with available count (color-coded)
- Color indicators:
  - Blue for available quota
  - Red for exhausted quota
- Styled info box with gray background for better readability

### UI/UX
- Single Status section now provides complete overview:
  - What's currently on the site (placed content)
  - How much capacity is remaining (quotas)
  - Visual distinction between available and exhausted quotas
- No need to click "Test Connection" to see quotas anymore

---

## Version 2.4.4 (2025-01-16)

### Improved
- **Enhanced connection status display**: Test Connection now shows available content statistics
- Displays "Available content: X links, Y articles"
- Shows quota usage: "Links: X / Y used" and "Articles: X / Y used"
- Better visibility of remaining content capacity

### Backend
- Updated `/api/wordpress/verify` endpoint to return content availability data
- Returns `available_links`, `available_articles`, `used_links`, `used_articles`, `max_links`, `max_articles`

---

## Version 2.4.3 (2025-01-16)

### Changed
- **Simplified widget settings**: Removed "Number of links" field from widget configuration
- Widget now displays all available links (no limit)
- Cleaner UI with only Title and Style options

---

## Version 2.4.2 (2025-01-16)

### Fixed
- **Browser autofill issue**: Added `autocomplete="off"` to registration token field to prevent browser from auto-filling old API keys
- Ensures token field is always empty on page load

---

## Version 2.4.1 (2025-01-16)

### Improved
- **Better UX for registration form**: Improved placeholder text and added step-by-step instructions
- Added visual hints about token format (starts with `reg_`, ~68 characters)
- Clearer guidance for users without a token

---

## Version 2.4.0 (2025-01-15)

### Added
- **Bulk site registration with tokens**: Admin can now generate registration tokens in the Link Manager dashboard and use them to quickly register multiple WordPress sites
- Quick registration form in plugin settings (shown when no API key exists)
- Auto-generation of API keys during token-based registration
- CSRF protection with WordPress nonces for registration form

### Changed
- Settings page now shows registration form prominently when API key is not configured
- Improved onboarding flow for new site installations

### Security
- All registration requests are rate-limited on the server (5 requests per minute)
- Registration tokens support expiry dates and usage limits
- Auto-generated API keys use secure random generation

---

## Version 2.3.0 (2025-01-15)

### Changed
- **Clean link output**: Removed all wrapper elements (div, ul, li) and CSS classes
- Links now output as simple `<a>` tags with `<br>` separators
- Matches static widget output format for consistency
- Maintains XSS protection (esc_url, esc_html)
- Maintains `target="_blank"` for external links

### Removed
- Removed `style` parameter (inline/list) - all links use clean format now
- Removed div wrappers with `.lmw-links` class
- Removed ul/li list structure with `.lmw-link-list` class
- Removed pipe separators from inline style

### Migration Notes
If you were using the `style="inline"` or `style="list"` parameters, they are now ignored. All links output in clean format:

**Before (v2.2.2):**
```html
<div class="lmw-links lmw-style-list">
    <ul class="lmw-link-list">
        <li><a href="..." target="_blank">Link 1</a></li>
        <li><a href="..." target="_blank">Link 2</a></li>
    </ul>
</div>
```

**After (v2.3.0):**
```html
<a href="..." target="_blank">Link 1</a><br>
<a href="..." target="_blank">Link 2</a><br>
```

### Benefits
- No CSS conflicts with WordPress themes
- Better SEO (cleaner HTML)
- Consistent output across WordPress and static sites
- Easier to style with theme CSS if needed

---

## Version 2.2.2 (Previous)

### Features
- API key-based authentication
- Links shortcode support
- Articles published as WordPress posts
- Caching (5 minutes)
- XSS protection
