# Link Manager Widget Pro - Changelog

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
