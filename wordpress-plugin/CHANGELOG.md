# Link Manager Widget Pro - Changelog

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
