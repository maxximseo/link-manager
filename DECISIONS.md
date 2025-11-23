# Quick Technical Decisions

Fast reference for day-to-day technical decisions and patterns. For major architectural decisions, see [ADR.md](ADR.md).

**Last Updated**: January 2025

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

## Frontend Patterns

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

## When in Doubt

1. **Database operations** → Check [ADR-001](ADR.md#adr-001-no-orm---direct-sql-queries), [ADR-004](ADR.md#adr-004-transaction-wrapped-multi-step-operations)
2. **Authentication** → Check [ADR-002](ADR.md#adr-002-jwt-authentication-without-database-lookups)
3. **Caching** → Check [ADR-003](ADR.md#adr-003-redis-cache-with-graceful-degradation)
4. **Security** → Check [ADR-007](ADR.md#adr-007-parameterized-queries-only), [ADR-011](ADR.md#adr-011-static-php-sites-support)
5. **Frontend** → Check [ADR-005](ADR.md#adr-005-modular-frontend-vanilla-js)
6. **Performance** → Check [RUNBOOK.md](RUNBOOK.md#monitoring--alerts)

---

## Contribution Guidelines

When adding new patterns:
1. Keep it concise (1-2 code examples)
2. Show ✅ CORRECT and ❌ WRONG
3. Add "See: [ADR-XXX]" link if relevant
4. Group by category (Database, API, Frontend, etc.)

**Review**: Monthly during team sync
**Last Review**: January 2025
**Next Review**: February 2025
