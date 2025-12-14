# Quick Technical Decisions

Fast reference for day-to-day technical decisions and patterns. For major architectural decisions, see [ADR.md](ADR.md).

**Last Updated**: December 2025

---

## Database Patterns

### ✅ Always Use Transactions for Multi-Table Operations

```javascript
// ✅ CORRECT
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO placements...');
  await client.query('UPDATE sites...');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}

// ❌ WRONG
await query('INSERT INTO placements...');
await query('UPDATE sites...');  // If this fails, placement exists but quota not updated
```

**See**: [ADR-004](ADR.md#adr-004-transaction-wrapped-multi-step-operations)

---

### ✅ Use COALESCE for Partial Updates

```javascript
// ✅ CORRECT - Only updates provided fields
UPDATE sites
SET site_name = COALESCE($1, site_name),
    max_links = COALESCE($2, max_links)
WHERE id = $3

// ❌ WRONG - Overwrites with NULL
UPDATE sites
SET site_name = $1,
    max_links = $2
WHERE id = $3
```

**See**: [ADR-014](ADR.md#adr-014-coalesce-pattern-for-partial-updates)

---

### ✅ Always Use parseInt() for COUNT Results

```javascript
// ✅ CORRECT
const result = await query('SELECT COUNT(*) FROM placements');
const count = parseInt(result.rows[0].count);
if (count === 0) { /* ... */ }

// ❌ WRONG - PostgreSQL COUNT returns string "0"
if (result.rows[0].count === 0) { /* ... */ }  // Always false!
```

**Reason**: PostgreSQL `COUNT()` returns `string`, not `number`

---

### ✅ Parameterized Queries ONLY

```javascript
// ✅ CORRECT
await query('SELECT * FROM users WHERE username = $1', [username]);

// ❌ FORBIDDEN - SQL Injection vulnerability
await query(`SELECT * FROM users WHERE username = '${username}'`);
```

**See**: [ADR-007](ADR.md#adr-007-parameterized-queries-only)

---

## API Patterns

### ✅ Context-Aware Validation

```javascript
// ✅ CORRECT - Different validation rules per parameter type
// Express-validator for basic validation
body('updates.*.value').isInt({ min: 0 })

// Context-aware validation in controller
if (parameter === 'dr' || parameter === 'da') {
  const invalidValues = updates.filter(u => u.value > 100);
  if (invalidValues.length > 0) {
    return res.status(400).json({
      error: `${parameter.toUpperCase()} values must be between 0 and 100`
    });
  }
}
// ref_domains, rd_main, norm, keywords, traffic: no upper limit - proceed

// GEO: string validation
if (parameter === 'geo') {
  value = value.toUpperCase();  // Auto-uppercase
}

// ❌ WRONG - Same validation for all parameter types
body('updates.*.value').isInt({ min: 0, max: 100 })  // Blocks ref_domains=5000!
```

**See**: [ADR-017](ADR.md#adr-017-context-aware-validation-for-site-parameters)

---

### ✅ Error Response Format

```javascript
// ✅ CORRECT - Consistent error format
try {
  const result = await service.doSomething();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Operation failed', { error: error.message });
  res.status(400).json({ error: 'Failed to do something', details: error.message });
}

// ❌ WRONG - Inconsistent format
res.status(400).send('Error');  // Not JSON
res.json({ message: 'Error' });  // Use 'error' not 'message'
```

---

### ✅ Cache Invalidation

```javascript
// ✅ CORRECT - Clear related caches
async function createPlacement() {
  // ... create placement
  await cache.delPattern('placements:*');
  await cache.delPattern('projects:*');
  await cache.delPattern('wp:*');
}

// ❌ WRONG - Forget to invalidate cache
async function createPlacement() {
  // ... create placement
  // Cache still returns old data!
}
```

**Pattern**: `cache.delPattern('prefix:*')` clears all keys matching pattern

---

### ✅ Pagination Limits

```javascript
// ✅ CORRECT - Explicit high limit for bulk operations
PlacementsAPI.getAll({ limit: 5000 })

// ❌ WRONG - Uses default limit of 20
PlacementsAPI.getAll()  // Only gets 20 records!
```

**See**: [ADR-015](ADR.md#adr-015-pagination-limits-5000-max)

---

## Code Quality (ESLint + Prettier)

### ✅ Mark Intentionally Unused Variables with `_`

```javascript
// ✅ CORRECT - Prefix with _ to ignore ESLint warning
const [_error, data] = await handleAsync(fetchData());
function middleware(req, _res, next) { /* ... */ }

// ❌ WRONG - Generates "unused variable" warning
const [error, data] = await handleAsync(fetchData());  // 'error' is defined but never used
```

---

### ✅ Use const by Default

```javascript
// ✅ CORRECT - Use const for values that won't be reassigned
const userId = req.user.id;
const result = await query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ WRONG - Using let when const would work
let userId = req.user.id;  // ESLint: Prefer const
```

---

### ✅ Use Strict Equality

```javascript
// ✅ CORRECT - Use === for type-safe comparison
if (count === 0) { /* ... */ }
if (status === 'active') { /* ... */ }

// ✅ OK - == null is allowed by eqeqeq 'smart' rule
if (value == null) { /* ... */ }  // Catches both null and undefined

// ❌ WRONG - Use === instead
if (count == 0) { /* ... */ }  // ESLint warning
```

---

### ✅ Async Functions Must Have Await

```javascript
// ✅ CORRECT - Async function has await
async function getUser(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

// ❌ WRONG - Async without await (likely a bug)
async function getUser(id) {  // ESLint: require-await
  const result = query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];  // Returns Promise, not data!
}
```

---

### ✅ Use logger Instead of console.log

```javascript
// ✅ CORRECT - Use Winston logger
const logger = require('../config/logger');
logger.info('User logged in', { userId: user.id });
logger.error('Database error', { error: err.message });

// ✅ OK - console.warn, console.error, console.info are allowed
console.error('Critical failure');

// ❌ WRONG - console.log triggers ESLint warning
console.log('Debug:', data);  // ESLint: no-console
```

---

### ✅ Run Lint Before Committing

```bash
# Quick check
npm run lint

# Auto-fix formatting
npm run lint:fix
```

**See**: [ADR-022](ADR.md#adr-022-eslint--prettier-code-quality)

---

## Frontend Patterns

### ✅ Script Loading Order (ADR-021)

```html
<!-- ✅ CORRECT - Dependencies loaded first -->
<!-- 1. Security (XSS protection) -->
<script src="/js/security.js"></script>
<!-- 2. Auth (token management) -->
<script src="/js/auth.js"></script>
<!-- 3. Shared utilities -->
<script src="/js/badge-utils.js"></script>
<script src="/js/api.js"></script>
<!-- 4. Page-specific -->
<script src="/js/placements-manager.js"></script>

<!-- ❌ WRONG - Wrong order breaks dependencies -->
<script src="/js/placements-manager.js"></script>  <!-- Uses escapeHtml() -->
<script src="/js/security.js"></script>            <!-- Defines escapeHtml() -->
```

**See**: [ADR-021](ADR.md#adr-021-frontend-shared-utilities-architecture)

---

### ✅ Use Shared Badge Functions

```javascript
// ✅ CORRECT - Import from badge-utils.js
const statusBadge = getPlacementStatusBadge(placement.status);
const typeBadge = getPlacementTypeBadge(placement.type);
const formattedDate = formatDateTime(placement.created_at);

// ❌ WRONG - Duplicate badge configs in page JS
const PLACEMENT_STATUS_BADGES = {  // Duplicates badge-utils.js!
  'placed': '<span class="badge bg-success">Размещено</span>',
  // ...
};
```

**Available from badge-utils.js**:
- `getPlacementStatusBadge(status)`
- `getPlacementTypeBadge(type)`
- `getTransactionTypeBadge(type)`
- `getSiteTypeBadge(siteType)`
- `getUserRoleBadge(role)`
- `formatDate(dateString)`
- `formatDateTime(dateString)`
- `getAutoRenewalIcon(enabled)`
- `getAmountColorClass(amount)`
- `getBalanceColorClass(balance)`
- `formatExpiryWithColor(expiresAt)`
- `getDrColorClass(dr)`, `getDaColorClass(da)`, etc.

---

### ✅ Check Function Location Before Adding

```javascript
// ✅ CORRECT - Use existing shared function
// security.js exports: escapeHtml(), showAlert()
const safeHtml = escapeHtml(userInput);
showAlert('Success!', 'success');

// ❌ WRONG - Redefining shared function
function escapeHtml(text) {  // Already in security.js!
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

**Function Location Reference**:
| Function | File | Loaded |
|----------|------|--------|
| `escapeHtml()` | security.js | 1st |
| `showAlert()` | security.js | 1st |
| `getToken()` | auth.js | 2nd |
| `isAdmin()` | auth.js | 2nd |
| `isAuthenticated()` | auth.js | 2nd |
| `getCurrentUser()` | auth.js | 2nd |
| `get*Badge()` | badge-utils.js | 3rd |
| `format*()` | badge-utils.js | 3rd |
| `apiCall()` | api.js | 4th |

---

### ✅ API Call Error Handling

```javascript
// ✅ CORRECT
try {
  const result = await apiCall('/api/projects');
  // Handle success
} catch (error) {
  showNotification(error.message, 'error');
  console.error('API error:', error);
}

// ❌ WRONG - Silent failure
const result = await apiCall('/api/projects');  // If error, page just breaks
```

---

### ✅ XSS Protection

```javascript
// ✅ CORRECT
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
element.innerHTML = escapeHtml(userInput);

// ❌ WRONG - XSS vulnerability
element.innerHTML = userInput;  // User can inject <script> tags!
```

---

### ✅ Modal Visibility Classes

```css
/* ✅ CORRECT - Support both .active and .show */
.modal.active,
.modal.show {
  display: flex;
}

/* ❌ WRONG - Only one class */
.modal.show {
  display: flex;
}
```

**Reason**: Different parts of code use different conventions

---

## WordPress Plugin Patterns

### ✅ Always Sanitize Inputs

```php
// ✅ CORRECT
$api_key = sanitize_text_field($_POST['api_key']);
$site_url = esc_url_raw($_POST['site_url']);

// ❌ WRONG
$api_key = $_POST['api_key'];  // XSS vulnerability!
```

---

### ✅ Always Escape Outputs

```php
// ✅ CORRECT
echo '<a href="' . esc_url($link['url']) . '">' . esc_html($link['anchor_text']) . '</a>';

// ❌ WRONG
echo '<a href="' . $link['url'] . '">' . $link['anchor_text'] . '</a>';  // XSS!
```

---

### ✅ Use Nonces for Forms

```php
// ✅ CORRECT
<?php wp_nonce_field('lmw_save_settings', 'lmw_settings_nonce'); ?>
<form method="post">...</form>

// In handler:
if (!wp_verify_nonce($_POST['lmw_settings_nonce'], 'lmw_save_settings')) {
  die('Security check failed');
}

// ❌ WRONG - No CSRF protection
<form method="post">...</form>
```

---

## Caching Patterns

### ✅ Cache Key Naming

```javascript
// ✅ CORRECT - Descriptive with parameters
const cacheKey = `wp:content:${api_key}`;
const cacheKey = `placements:user:${userId}:p${page}:l${limit}`;

// ❌ WRONG - Generic or missing params
const cacheKey = `content`;  // What content?
const cacheKey = `placements:${userId}`;  // Missing page/limit!
```

---

### ✅ Cache TTL Guidelines

```javascript
// Frequently changing data: 2-5 minutes
cache.set('placements:user:123', data, 120);  // 2 minutes

// Slowly changing data: 5-10 minutes
cache.set('wp:content:api123', data, 300);  // 5 minutes

// Rarely changing data: 30-60 minutes
cache.set('discount:tiers', data, 1800);  // 30 minutes
```

---

## Security Patterns

### ✅ URL Validation (SSRF Protection)

```javascript
// ✅ CORRECT - Validate before HTTP request
const validUrl = await validateExternalUrl(url);
const response = await axios.get(validUrl);

// ❌ WRONG - No validation
const response = await axios.get(url);  // User can access localhost!
```

**Blocks**: localhost, 127.0.0.1, 10.x, 192.168.x, 169.254.x, metadata endpoints

---

### ✅ Rate Limiting

```javascript
// ✅ CORRECT - Apply appropriate limiter
router.post('/login', loginLimiter, authController.login);  // 5/15min
router.post('/projects', createOperationLimiter, ...);      // 10/min
router.post('/billing/purchase', financialLimiter, ...);    // 50/min

// ❌ WRONG - No rate limiting
router.post('/login', authController.login);  // Vulnerable to brute force!
```

**See**: [ADR-006](ADR.md#adr-006-5-tier-rate-limiting-strategy)

---

### ✅ Admin-Only Public Sites (v2.5.4+)

```javascript
// ✅ CORRECT - Strip is_public for non-admin users
const createSite = async (req, res) => {
  let { is_public, ...siteData } = req.body;

  // Only admin can create public sites
  if (req.user.role !== 'admin') {
    is_public = false;  // Force private
  }

  const site = await siteService.createSite(req.user.id, { ...siteData, is_public });
};

// ❌ WRONG - Allow any user to make sites public
const createSite = async (req, res) => {
  const site = await siteService.createSite(req.user.id, req.body);  // User can set is_public!
};
```

**See**: [ADR-020](ADR.md#adr-020-admin-only-public-site-control)

---

## Logging Patterns

### ✅ Log Levels

```javascript
// ✅ CORRECT - Use appropriate levels
logger.error('Database connection failed', { error: err.message });  // Production visible
logger.warn('Cache miss', { key });  // Production visible
logger.info('Server started on port 3003');  // Production visible
logger.debug('Query executed', { query, duration });  // Development only

// ❌ WRONG - Wrong level
logger.error('User logged in');  // Not an error!
logger.debug('Payment failed');  // Should be error!
```

---

### ✅ Structured Logging

```javascript
// ✅ CORRECT - JSON object with context
logger.error('Failed to create placement', {
  userId: 123,
  projectId: 456,
  error: error.message,
  stack: error.stack
});

// ❌ WRONG - String concatenation
logger.error('Failed to create placement for user 123 project 456: ' + error.message);
```

---

## Common Mistakes to Avoid

### ❌ Forgetting to Release Client

```javascript
// ❌ WRONG - Memory leak!
const client = await pool.connect();
await client.query('BEGIN');
// ... error thrown here
await client.query('COMMIT');
client.release();  // Never reached if error!

// ✅ CORRECT
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ...
  await client.query('COMMIT');
} finally {
  client.release();  // Always executes
}
```

---

### ❌ Using redis.keys() in Production

```javascript
// ❌ WRONG - Blocks entire Redis server!
const keys = await redis.keys('placements:*');

// ✅ CORRECT - Use cursor-based SCAN
let cursor = '0';
const keys = [];
do {
  const result = await redis.scan(cursor, 'MATCH', 'placements:*', 'COUNT', 100);
  cursor = result[0];
  keys.push(...result[1]);
} while (cursor !== '0');
```

---

### ❌ Not Handling Promise Rejections

```javascript
// ❌ WRONG - Unhandled rejection
router.post('/test', async (req, res) => {
  const result = await dangerousOperation();  // If error, server crashes!
  res.json(result);
});

// ✅ CORRECT
router.post('/test', async (req, res) => {
  try {
    const result = await dangerousOperation();
    res.json(result);
  } catch (error) {
    logger.error('Operation failed', { error: error.message });
    res.status(500).json({ error: 'Operation failed' });
  }
});
```

---

## Quick References

### Environment Variables Required

```bash
NODE_ENV=development|production
PORT=3003
DATABASE_URL=postgresql://...
JWT_SECRET=<min-32-chars>
BCRYPT_ROUNDS=8  # dev: 8, prod: 10

# Optional (graceful degradation)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

---

### PostgreSQL Connection Pool Config

```javascript
{
  max: 25,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 10000  // Fail after 10s
}
```

---

### Bootstrap Modal Classes

```javascript
// Show modal
modal.classList.add('show', 'active');
modal.style.display = 'flex';

// Hide modal
modal.classList.remove('show', 'active');
modal.style.display = 'none';
```

---

### Git Commit Message Format

```bash
git commit -m "Brief description

Detailed explanation if needed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### ✅ Pass ALL Fields Through Controller-Service Stack

When updating a record, ALL editable fields must be:
1. Extracted in controller from `req.body`
2. Passed to service function
3. Included in SQL UPDATE with COALESCE

```javascript
// ✅ CORRECT - All fields passed through
// Controller
const { url, anchor_text, usage_limit, html_context } = req.body;
await service.updateLink(id, { url, anchor_text, usage_limit, html_context });

// Service
const result = await query(`
  UPDATE project_links
  SET url = COALESCE($1, url),
      anchor_text = COALESCE($2, anchor_text),
      usage_limit = COALESCE($3, usage_limit),
      html_context = COALESCE($4, html_context),
      updated_at = NOW()
  WHERE id = $5
`, [url, anchor_text, usage_limit, html_context, id]);

// ❌ WRONG - html_context not passed through
const { url, anchor_text, usage_limit } = req.body;  // Missing html_context!
await service.updateLink(id, { url, anchor_text, usage_limit });
// Result: html_context silently not saved
```

**See**: [ADR-028](ADR.md#adr-028-complete-field-pass-through-in-controller-service-layer)

---

### ✅ Always Include updated_at in UPDATE Queries

```javascript
// ✅ CORRECT
UPDATE table SET field = $1, updated_at = NOW() WHERE id = $2

// ❌ WRONG
UPDATE table SET field = $1 WHERE id = $2  // No audit trail
```

**See**: [ADR-029](ADR.md#adr-029-database-timestamp-columns-updated_at)

---

### ✅ Database: Supabase SSL Configuration

```javascript
// ✅ CORRECT - Only Supabase SSL detection
if (process.env.DB_HOST?.includes('supabase.com')) {
  sslConfig = { rejectUnauthorized: false };
  logger.info('Using SSL with disabled certificate verification for Supabase');
}

// ❌ OUTDATED - DigitalOcean database no longer supported
if (process.env.DB_HOST?.includes('ondigitalocean.com')) {  // Removed in v2.6.9
  // ...
}
```

**See**: [ADR-030](ADR.md#adr-030-database-migration-from-digitalocean-to-supabase), [ADR-032](ADR.md#adr-032-complete-removal-of-digitalocean-database-references)

---

### ✅ Infrastructure: What's Where

| Service | Provider | Notes |
|---------|----------|-------|
| PostgreSQL | **Supabase** | Primary database |
| Redis/Valkey | DigitalOcean | Cache & queues |
| Backup Storage | DO Spaces | S3-compatible |
| App Hosting | DigitalOcean | Node.js app |

**Key Insight**: Database is Supabase, but DO Spaces and Redis remain on DigitalOcean.

---

## When in Doubt

1. **Database operations** → Check [ADR-001](ADR.md#adr-001-no-orm---direct-sql-queries), [ADR-004](ADR.md#adr-004-transaction-wrapped-multi-step-operations)
2. **Authentication** → Check [ADR-002](ADR.md#adr-002-jwt-authentication-without-database-lookups)
3. **Caching** → Check [ADR-003](ADR.md#adr-003-redis-cache-with-graceful-degradation)
4. **Security** → Check [ADR-007](ADR.md#adr-007-parameterized-queries-only), [ADR-011](ADR.md#adr-011-static-php-sites-support), [ADR-020](ADR.md#adr-020-admin-only-public-site-control)
5. **Frontend architecture** → Check [ADR-005](ADR.md#adr-005-modular-frontend-vanilla-js), [ADR-021](ADR.md#adr-021-frontend-shared-utilities-architecture)
6. **Frontend shared utilities** → Check [ADR-021](ADR.md#adr-021-frontend-shared-utilities-architecture)
7. **Performance** → Check [RUNBOOK.md](RUNBOOK.md#monitoring--alerts)
8. **Site parameters** → Check [ADR-018](ADR.md#adr-018-geo-parameter-system)
9. **Optimization approach** → Check [OPTIMIZATION_PRINCIPLES.md](OPTIMIZATION_PRINCIPLES.md)
10. **Public sites access** → Check [ADR-020](ADR.md#adr-020-admin-only-public-site-control)
11. **Database provider** → Check [ADR-030](ADR.md#adr-030-database-migration-from-digitalocean-to-supabase), [ADR-032](ADR.md#adr-032-complete-removal-of-digitalocean-database-references)

---

## Contribution Guidelines

When adding new patterns:
1. Keep it concise (1-2 code examples)
2. Show ✅ CORRECT and ❌ WRONG
3. Add "See: [ADR-XXX]" link if relevant
4. Group by category (Database, API, Frontend, etc.)

**Review**: Monthly during team sync
**Last Review**: December 2025
**Next Review**: January 2026

---

## UI/UX Patterns

### ✅ Modern Modal Design (Figma-style)

**Added**: December 2025 (v2.6.10)

When creating or updating modal dialogs, use the Figma-style design system:

```html
<!-- ✅ CORRECT - Modern modal structure -->
<div class="modal-content project-modal-content">
  <div class="project-modal-header">
    <div class="project-modal-title-section">
      <div class="project-modal-icon">
        <i class="bi bi-folder-plus"></i>
      </div>
      <div>
        <h5 class="project-modal-title">Modal Title</h5>
        <p class="project-modal-subtitle" data-i18n="subtitleKey">Subtitle text</p>
      </div>
    </div>
    <button class="project-modal-close" onclick="closeModal()">
      <i class="bi bi-x-lg"></i>
    </button>
  </div>
  <div class="project-modal-body">
    <!-- Form content -->
  </div>
</div>

<!-- ❌ WRONG - Old Bootstrap style -->
<div class="modal-header">
  <h5 class="modal-title">Title</h5>
  <button type="button" class="btn-close"></button>
</div>
```

**Key CSS Properties**:
```css
.project-modal-header {
  background: linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%);
  padding: 1.5rem 2rem;
  display: flex;
  align-items: flex-start;  /* Close button at top */
  justify-content: space-between;
}

.project-modal-icon {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 0.75rem;
}

.project-form-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
```

**Naming Convention**: Prefix modal CSS classes with page context:
- `project-modal-*` for dashboard.html
- `site-modal-*` for sites.html

**See**: [ADR-033](ADR.md#adr-033-modern-modal-design-system-figma-style)

---

### ✅ Translation Key Naming

```javascript
// ✅ CORRECT - Descriptive camelCase
{
  maxLinks: 'Макс. ссылок на главной',
  configureProjectSettings: 'Настройте параметры вашего проекта',
  sidebarAddLink: 'Купить ссылки',
  exportCsv: 'Экспорт CSV'
}

// ❌ WRONG - Generic or inconsistent
{
  max: 'Максимум',           // Too generic
  add_link: 'Добавить',      // Use camelCase, not snake_case
  EXPORT_BTN: 'Экспорт'      // Use camelCase, not UPPERCASE
}
```

**Pattern**: Use `data-i18n` attribute with descriptive key:
```html
<label data-i18n="maxLinks">Макс. ссылок на главной</label>
<button data-i18n="exportCsv">Экспорт CSV</button>
```

---

### ✅ Close Button Alignment in Modal Headers

```css
/* ✅ CORRECT - Close button at top */
.modal-header {
  align-items: flex-start;
}

/* ❌ WRONG - Close button centered vertically */
.modal-header {
  align-items: center;  /* Close button looks disconnected */
}
```

**Reason**: When modal header has icon + title + subtitle, close button should align to top-right corner, not vertically centered.
