# Architecture Decision Records (ADR)

This document records all major architectural and design decisions made in the Link Manager project.

---

## ADR-001: No ORM - Direct SQL Queries

**Status**: ✅ ACTIVE
**Date**: October 2024
**Decision Makers**: Development Team

### Context
Need to choose data access layer for PostgreSQL database interaction.

### Decision
Use **direct parameterized SQL queries** via `pg` driver pool, without ORM (Sequelize, TypeORM, Prisma).

### Rationale
**Advantages**:
- ✅ **Performance**: No ORM overhead, direct query optimization
- ✅ **Transparency**: Full control over SQL execution
- ✅ **Debugging**: Easy to read EXPLAIN ANALYZE output
- ✅ **Flexibility**: Complex JOINs without ORM limitations
- ✅ **Small footprint**: Fewer dependencies

**Trade-offs**:
- ❌ Manual schema synchronization (migrations required)
- ❌ No automatic relationship loading
- ❌ More verbose code for CRUD operations

### Implementation
```javascript
const { query } = require('../config/database');

const result = await query(
  'SELECT * FROM table WHERE id = $1 AND user_id = $2',
  [id, userId]
);
```

### Consequences
- All services must use parameterized queries for SQL injection protection
- Database schema changes require manual migration files
- Type safety handled via validation at controller layer

---

## ADR-002: JWT Authentication Without Database Lookups

**Status**: ✅ ACTIVE
**Date**: October 2024

### Context
Need fast authentication for API requests with minimal database overhead.

### Decision
Use **JWT tokens** with all user info embedded in payload, no database lookup in middleware.

### Rationale
**Performance**:
- Auth middleware: 0ms DB query time
- Token verification: ~1-2ms (cryptographic operation only)
- Scales linearly with request volume

**Security trade-off**:
- Cannot instantly revoke tokens (must wait for expiry)
- Solution: Short expiry (7 days) + token blacklist for critical cases

### Implementation
```javascript
// Payload structure
{
  userId: 123,
  username: 'admin',
  role: 'admin',
  iat: 1234567890,
  exp: 1234567890
}

// Access in controllers
req.user.id       // User ID
req.user.username // Username
req.user.role     // Role for RBAC
```

### Consequences
- ✅ Extremely fast auth checks
- ✅ No database load for authentication
- ❌ Role changes require re-login
- ❌ Cannot force logout (except token blacklist)

---

## ADR-003: Redis Cache with Graceful Degradation

**Status**: ✅ ACTIVE
**Date**: November 2024

### Context
Need caching for WordPress API and placements, but Redis may not always be available.

### Decision
Implement **optional Redis caching** with automatic fallback to no-cache mode.

### Rationale
**Hybrid approach**:
```javascript
if (redis.available()) {
  return await cache.get(key);
} else {
  return await database.query(...);
}
```

**Benefits**:
- ✅ Works in development without Redis
- ✅ Survives Redis outages in production
- ✅ 10-19x performance boost when available

### Cache Strategy
```javascript
'wp:content:{api_key}'        - 5 minutes   (WordPress content)
'placements:user:{userId}'    - 2 minutes   (Placements list)
'projects:user:{userId}'      - 5 minutes   (Projects list)
```

### Cache Invalidation
```javascript
// Automatic on mutations
createPlacement()  → clear('placements:*', 'projects:*', 'wp:*')
deletePlacement()  → clear('placements:*', 'projects:*')
updateContent()    → clear('wp:*')
```

### Consequences
- ✅ Development easier (no Redis setup required)
- ✅ Production more resilient
- ⚠️ Must handle cache invalidation carefully

---

## ADR-004: Transaction-Wrapped Multi-Step Operations

**Status**: ✅ ACTIVE
**Date**: January 2025

### Context
Placement creation involves 15+ database operations that must be atomic.

### Decision
Use **PostgreSQL transactions** for all multi-table operations with row-level locking.

### Rationale
**Data integrity issues without transactions**:
```javascript
// BAD: Race condition
await query('INSERT INTO placements...');  // Step 1 succeeds
await query('UPDATE sites SET used_links = used_links + 1...'); // Step 2 fails
// Result: Placement exists but quota not updated
```

**Solution with transactions**:
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // All operations atomic
  await client.query('INSERT INTO placements...');
  await client.query('INSERT INTO placement_content...');
  await client.query('UPDATE sites SET used_links = used_links + 1...');
  await client.query('UPDATE project_links SET usage_count = usage_count + 1...');

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### Row-Level Locking
```sql
SELECT * FROM placements WHERE id = $1 FOR UPDATE OF p
```
Prevents race conditions during concurrent deletes.

### Consequences
- ✅ Data consistency guaranteed
- ✅ No orphaned records
- ⚠️ Longer transaction time (held locks)
- ⚠️ Must release client connection in `finally` block

---

## ADR-005: Modular Frontend (Vanilla JS)

**Status**: ✅ ACTIVE
**Date**: October 2024

### Context
Need maintainable frontend without heavy framework overhead.

### Decision
Use **Vanilla JavaScript** with modular architecture, no React/Vue/Angular.

### Rationale
**Why no framework**:
- Application is mostly CRUD operations
- No complex state management needed
- Bundle size: 0 KB framework overhead
- Fast page loads (no hydration)

**Actual module structure** (December 2024):
```
backend/build/js/
├── security.js           # XSS protection, escapeHtml(), showAlert()
├── auth.js               # Token management, getToken(), isAdmin()
├── api.js                # Centralized API client (ProjectsAPI, SitesAPI, etc.)
├── badge-utils.js        # UI utilities (badges, colors, formatting)
├── navbar.js             # Navigation, notifications dropdown
├── navbar-config.js      # Navigation configuration
├── purchase-modal.js     # Purchase modal handlers
├── register.js           # Registration page logic
├── balance.js            # Balance page logic
├── placements-manager.js # Placements manager page
├── placements-manager-filters.js # Filters for placements
├── admin-dashboard.js    # Admin dashboard
├── admin-users.js        # Admin user management
└── admin-placements.js   # Admin placements management
```

### Benefits
- ✅ No build step required
- ✅ Fast page loads (<100ms)
- ✅ Easy debugging (readable source)
- ✅ Progressive enhancement

### Trade-offs
- ❌ Manual DOM manipulation
- ❌ No reactive data binding
- ❌ More verbose event handling

### Consequences
- Use Bootstrap 5 for UI components
- API calls via centralized `apiCall()` wrapper
- Notification system for user feedback
- Manual cache busting via query params

---

## ADR-006: Comprehensive Rate Limiting Strategy

**Status**: ✅ ACTIVE
**Date**: October 2024
**Updated**: December 2024 - Full coverage audit completed

### Context
Need DDoS protection without blocking legitimate users. All API endpoints must be rate limited.

### Decision
Implement **multi-tier rate limiting** based on operation sensitivity. **100% route coverage required**.

### Rate Limit Tiers
```javascript
LOGIN:       50 requests / 15 minutes  // Brute force protection (temporary increase from 5)
REGISTER:    5 requests / hour         // Account creation abuse prevention
REFRESH:     10 requests / minute      // Token refresh
API:         100 requests / minute     // General API operations
CREATE:      10 requests / minute      // Resource creation
PLACEMENT:   20 requests / minute      // Placement operations
WORDPRESS:   30 requests / minute      // Plugin endpoints
PUBLIC_API:  10 requests / minute      // Unauthenticated public endpoints
FINANCIAL:   50 requests / minute      // Billing batch operations
PURCHASE:    10 requests / minute      // Single purchase operations
DEPOSIT:     5 requests / minute       // Deposit operations (fraud prevention)
HEALTH:      60 requests / minute      // Monitoring systems (1/sec)
BACKUP:      5 requests / minute       // Manual backup trigger
DEBUG:       30 requests / minute      // Debug operations (admin only)
QUEUE:       100 requests / minute     // Queue management (admin only)
```

### Route Coverage (December 2024 Audit)
| Route File | Rate Limiters | Status |
|------------|---------------|--------|
| admin.routes.js | apiLimiter (global) + financialLimiter | ✅ |
| notification.routes.js | apiLimiter (all 6 endpoints) | ✅ |
| auth.routes.js | loginLimiter, registerLimiter, refreshLimiter | ✅ |
| billing.routes.js | purchaseLimiter, depositLimiter, financialLimiter | ✅ |
| site.routes.js | createLimiter, generalLimiter, registerLimiter | ✅ |
| project.routes.js | apiLimiter + createLimiter | ✅ |
| placement.routes.js | generalLimiter | ✅ |
| wordpress.routes.js | wordpressLimiter, publicApiLimiter | ✅ |
| static.routes.js | publicApiLimiter | ✅ |
| queue.routes.js | adminLimiter (global) | ✅ |
| debug.routes.js | debugLimiter (global) | ✅ |
| health.routes.js | healthLimiter, backupLimiter | ✅ |
| legacy.js | loginLimiter, apiLimiter | ✅ |

**Coverage**: 13/13 route files (100%)

### Implementation Patterns

**Pattern 1: Global middleware for all routes**
```javascript
router.use(authMiddleware);
router.use(adminMiddleware);
router.use(apiLimiter);  // Applied to ALL routes in file
```

**Pattern 2: Per-route middleware**
```javascript
router.get('/', authMiddleware, apiLimiter, controller.getAll);
router.post('/', authMiddleware, createLimiter, controller.create);
```

**Pattern 3: Stricter limits for sensitive operations**
```javascript
// Financial operations get stricter limits
router.post('/users/:id/adjust-balance', financialLimiter, ...);
router.post('/placements/:id/refund', financialLimiter, ...);
```

### Consequences
- ✅ 100% API endpoint protection
- ✅ DDoS mitigation at application level
- ✅ Different limits based on operation risk
- ✅ Public endpoints protected from enumeration attacks
- ⚠️ Must update docs when adding new routes
- ⚠️ Rate limit headers returned in all responses

---

## ADR-007: Parameterized Queries Only

**Status**: ✅ ACTIVE (CRITICAL)
**Date**: October 2024

### Context
Prevent SQL injection attacks across entire codebase.

### Decision
**NEVER concatenate user input into SQL strings**. Always use parameterized queries.

### Enforcement
```javascript
// ✅ CORRECT
await query(
  'SELECT * FROM users WHERE username = $1 AND email = $2',
  [username, email]
);

// ❌ FORBIDDEN
await query(
  `SELECT * FROM users WHERE username = '${username}'`
);
```

### Code Review Checklist
- [ ] All SQL queries use `$1, $2, $3...` placeholders
- [ ] No string concatenation with user input
- [ ] Dynamic table names sanitized via whitelist

### Consequences
- ✅ Complete SQL injection protection
- ✅ Query plan caching (PostgreSQL optimizes)
- ⚠️ Cannot parameterize table names (use whitelist)

---

## ADR-008: Extended Fields System (JSONB)

**Status**: ✅ ACTIVE
**Date**: January 2025 (v2.5.0)

### Context
Need to pass arbitrary metadata to WordPress without schema changes.

### Decision
Add **4 JSONB columns** to `project_links` table for extensibility.

### Schema
```sql
ALTER TABLE project_links
  ADD COLUMN image_url JSONB,
  ADD COLUMN link_attributes JSONB,
  ADD COLUMN wrapper_config JSONB,
  ADD COLUMN custom_data JSONB;
```

### Use Cases
```javascript
{
  "image_url": "https://example.com/icon.png",
  "link_attributes": {
    "class": "btn btn-primary",
    "style": "color: red;",
    "data-track": "true"
  },
  "wrapper_config": {
    "wrapper_tag": "div",
    "wrapper_class": "featured-link",
    "wrapper_style": "border: 2px solid gold;"
  },
  "custom_data": {
    "description": "Best product",
    "category": "premium",
    "html": "<div>Custom HTML</div>"
  }
}
```

### Rationale
**Why JSONB over individual columns**:
- ✅ Unlimited extensibility
- ✅ No schema migrations for new fields
- ✅ WordPress plugin can render any structure
- ✅ Indexed queries possible (GIN indexes)

**Why not separate tables**:
- Simpler queries (no JOINs)
- Atomic updates with link data
- Better performance for small objects

### WordPress Rendering
Plugin v2.4.5+ supports 4 templates:
```php
[lm_links template="default"]      // Standard
[lm_links template="with_image"]   // With image_url
[lm_links template="card"]         // Card layout
[lm_links template="custom"]       // custom_data.html
```

### Security
```php
// XSS protection
esc_url($link['image_url'])
esc_attr($link['link_attributes']['class'])
wp_kses_post($link['custom_data']['html'])
```

### Consequences
- ✅ Future-proof schema
- ✅ No plugin updates for new fields
- ⚠️ JSONB field size must be validated (max 10KB)
- ⚠️ WordPress plugin must handle missing fields gracefully

---

## ADR-009: Remove Anchor Text Uniqueness Constraint

**Status**: ✅ ACTIVE
**Date**: January 2025

### Context
Users need to reuse same anchor text for different URLs in same project.

### Decision
**Remove UNIQUE constraint** on `(project_id, anchor_text)` combination.

### Previous Behavior
```sql
-- OLD: Prevented duplicates
ALTER TABLE project_links
  ADD CONSTRAINT project_links_project_id_anchor_text_key
  UNIQUE (project_id, anchor_text);
```

**Problem**: Cannot create:
```javascript
{ anchor_text: "Buy Now", url: "https://shop1.com" }
{ anchor_text: "Buy Now", url: "https://shop2.com" }  // ❌ DUPLICATE ERROR
```

### New Behavior
```sql
-- NEW: Allow duplicates
ALTER TABLE project_links
  DROP CONSTRAINT IF EXISTS project_links_project_id_anchor_text_key;
```

**Now allowed**:
```javascript
{ anchor_text: "Buy Now", url: "https://shop1.com" }  // ✅
{ anchor_text: "Buy Now", url: "https://shop2.com" }  // ✅
{ anchor_text: "Learn More", url: "https://shop1.com" }  // ✅
```

### Use Cases Enabled
1. A/B testing same anchor with different destinations
2. Common anchors ("Click Here", "Read More") across links
3. Seasonal campaigns reusing anchors
4. Multiple affiliates with same CTA

### Migration
```bash
node database/run_remove_anchor_unique.js
```

### Consequences
- ✅ More flexible link management
- ✅ No frontend validation changes needed
- ⚠️ Duplicate detection now by URL+anchor combo (if needed)

---

## ADR-010: Bull Queue Workers (Optional)

**Status**: ✅ ACTIVE (OPTIONAL)
**Date**: November 2024

### Context
Heavy operations (batch placements, exports) block HTTP responses.

### Decision
Use **Bull + Redis** for background jobs with **graceful degradation**.

### Architecture
```javascript
if (redis.available()) {
  // Background processing
  await queue.add('batch-placement', { data });
  return res.json({ jobId: '123', status: 'queued' });
} else {
  // Synchronous fallback
  const result = await processPlacement(data);
  return res.json({ result, status: 'completed' });
}
```

### Workers
```
placement.worker.js  - Process batch placements
wordpress.worker.js  - Publish articles to WordPress
batch.worker.js      - Generate CSV/JSON exports
```

### Benefits
- ✅ Non-blocking HTTP responses (<50ms)
- ✅ Progress tracking via job IDs
- ✅ Automatic retry on failure
- ✅ Job prioritization

### Trade-offs
- Requires Redis infrastructure
- Adds complexity (job monitoring)
- Must handle "job not found" errors

### Monitoring
```bash
curl http://localhost:3003/api/queue/status
```

### Consequences
- Development works without Redis
- Production gains background processing
- Frontend must poll for job completion

---

## ADR-011: Static PHP Sites Support

**Status**: ✅ ACTIVE
**Date**: November 2025

### Context
Users have non-WordPress sites (static HTML/PHP) that need link placements.

### Decision
Support **two site types**: `wordpress` and `static_php` with domain-based authentication.

### Implementation
```javascript
// Database
site_type VARCHAR(20) DEFAULT 'wordpress'

// API
GET /api/static/get-content-by-domain?domain=example.com
```

### Widget Integration
```php
<?php
// static-widget/link-manager-widget.php
$domain = $_SERVER['HTTP_HOST'];
$api_url = "https://api.com/api/static/get-content-by-domain?domain=" . urlencode($domain);
$response = file_get_contents($api_url);
$data = json_decode($response, true);

foreach ($data['links'] as $link) {
    echo '<a href="' . htmlspecialchars($link['url']) . '">'
       . htmlspecialchars($link['anchor_text']) . '</a><br>';
}
?>
```

### Constraints
- ✅ Static sites: **links only** (no articles)
- ✅ `max_articles` forced to 0
- ✅ API key optional (uses domain matching)
- ✅ 5-minute cache (same as WordPress)

### Domain Normalization
```javascript
// All resolve to "example.com"
https://www.example.com/path
http://example.com
https://example.com/
```

### Security
```php
// XSS protection
htmlspecialchars($link['url'])
htmlspecialchars($link['anchor_text'])

// SSRF protection (server-side)
- Block localhost, 127.0.0.1
- Block private IPs (10.x, 192.168.x)
- Block cloud metadata (169.254.169.254)
```

### Consequences
- ✅ Expands market to non-WordPress users
- ✅ Simpler integration (no plugin install)
- ❌ Cannot publish articles (WordPress-only feature)
- ⚠️ Must migrate: `api_key` column to nullable

---

## ADR-012: Billing System Architecture

**Status**: ✅ ACTIVE
**Date**: November 2025

### Context
Need prepaid billing with balance, discounts, and auto-renewal.

### Decision
Implement **transaction-based billing** with user balance and discount tiers.

### Schema
```sql
users
├── balance NUMERIC(10, 2)
├── total_spent NUMERIC(10, 2)
└── current_discount INTEGER

transactions
├── type (deposit/purchase/renewal/refund)
├── amount NUMERIC(10, 2)
├── balance_before/after NUMERIC(10, 2)
└── description TEXT

discount_tiers
├── tier_name (Стандарт/Бронза/Серебро/Золото/Платина)
├── min_spent NUMERIC(10, 2)
└── discount_percentage INTEGER
```

### Pricing Model
```javascript
const PRICING = {
  LINK_HOMEPAGE: 25.00,
  ARTICLE_GUEST_POST: 15.00,
  BASE_RENEWAL_DISCOUNT: 30
};

// Discount tiers
$0+     → 0%  discount
$100+   → 5%  discount
$500+   → 10% discount
$1000+  → 15% discount
$5000+  → 20% discount
```

### Purchase Flow
```javascript
1. Check user balance >= price
2. Calculate discount based on total_spent
3. Apply discount to price
4. Create transaction (type: 'purchase')
5. Deduct from balance
6. Create placement
7. Update total_spent
8. Recalculate discount tier
```

### Auto-Renewal
```javascript
// Cron job runs daily
for (placement in expiring_placements) {
  if (placement.auto_renewal && user.balance >= renewal_price) {
    await renewPlacement(placement.id);
  }
}
```

### Transaction Atomicity
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Deduct balance
  await client.query('UPDATE users SET balance = balance - $1...', [price]);

  // Create transaction record
  await client.query('INSERT INTO transactions...', [...]);

  // Create placement
  await client.query('INSERT INTO placements...', [...]);

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw new Error('Payment failed');
}
```

### Consequences
- ✅ Transparent pricing
- ✅ Full transaction history
- ✅ Automatic discounts
- ⚠️ Requires balance top-ups
- ⚠️ Must handle insufficient funds

---

## ADR-013: Bulk Registration via Tokens

**Status**: ✅ ACTIVE
**Date**: November 2025

### Context
Agencies need to register 100+ WordPress sites without manual entry.

### Decision
Implement **token-based registration** system for bulk site onboarding.

### Flow
```
1. Admin generates token in dashboard
   POST /api/sites/generate-token
   → Returns: "reg_abc123def456..."

2. Admin distributes token to WordPress sites

3. WordPress plugin auto-registers
   POST /api/sites/register-from-wordpress
   Body: { registration_token, site_url, api_key }
```

### Token Schema
```sql
CREATE TABLE registration_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(128) UNIQUE,     -- 'reg_' + 64 hex chars
  label VARCHAR(255),             -- "January 2025 Batch"
  max_uses INTEGER DEFAULT 0,     -- 0 = unlimited
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### Token Format
```javascript
const token = 'reg_' + crypto.randomBytes(32).toString('hex');
// Length: 68 characters (4 prefix + 64 hex)
```

### Validation Logic
```javascript
const validateToken = async (token) => {
  const result = await query(
    'SELECT * FROM registration_tokens WHERE token = $1',
    [token]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid token');
  }

  const t = result.rows[0];

  if (t.expires_at && new Date(t.expires_at) < new Date()) {
    throw new Error('Token expired');
  }

  if (t.max_uses > 0 && t.current_uses >= t.max_uses) {
    throw new Error('Token exhausted');
  }

  return t;
};
```

### Security Features
1. **No authentication required** (token IS the authentication)
2. **Rate limiting**: 5 registrations/minute (prevent abuse)
3. **Expiry dates**: Auto-expire after N days
4. **Usage limits**: Prevent unlimited registrations
5. **CSRF protection**: WordPress nonce verification

### WordPress Plugin Integration
```php
// Plugin v2.4.0+ shows registration form
if (empty($api_key)):
  <form method="post">
    <input name="registration_token" placeholder="reg_..." required />
    <button name="register_site">Register This Site</button>
  </form>
endif;
```

### Consequences
- ✅ Scales to 1000+ site registrations
- ✅ No manual data entry
- ✅ Self-service onboarding
- ⚠️ Must monitor token usage
- ⚠️ Token column must be VARCHAR(128)

---

## ADR-014: COALESCE Pattern for Partial Updates

**Status**: ✅ ACTIVE
**Date**: October 2024

### Context
Need PATCH-style updates where only provided fields are updated.

### Decision
Use **PostgreSQL COALESCE** for all UPDATE queries.

### Implementation
```sql
-- Traditional UPDATE (overwrites with NULL)
UPDATE sites
SET site_name = $1,
    site_url = $2,
    max_links = $3
WHERE id = $4;
-- Problem: If $1 is null, site_name becomes NULL

-- COALESCE pattern (only updates provided fields)
UPDATE sites
SET site_name = COALESCE($1, site_name),
    site_url = COALESCE($2, site_url),
    max_links = COALESCE($3, max_links)
WHERE id = $4;
-- If $1 is null, site_name stays unchanged
```

### JavaScript Usage
```javascript
const updateSite = async (id, updates) => {
  await query(
    `UPDATE sites
     SET site_name = COALESCE($1, site_name),
         site_url = COALESCE($2, site_url),
         max_links = COALESCE($3, max_links)
     WHERE id = $4`,
    [
      updates.site_name || null,
      updates.site_url || null,
      updates.max_links || null,
      id
    ]
  );
};

// Example usage
await updateSite(123, { max_links: 20 });
// Only max_links updated, other fields unchanged
```

### Benefits
- ✅ True partial updates (REST PATCH semantics)
- ✅ No need to fetch-then-merge
- ✅ Single database query
- ✅ Atomic operation

### Consequences
- All UPDATE queries must use COALESCE
- Controllers pass `null` for undefined fields
- Cannot intentionally set field to NULL (use separate query)

---

## ADR-015: Pagination Limits (5000 Max)

**Status**: ✅ ACTIVE
**Date**: January 2025

### Context
Users with 5000+ placements hit default pagination limit (100).

### Decision
Increase **MAX_LIMIT from 100 to 5000** to support high-volume operations.

### Configuration
```javascript
// backend/config/constants.js
PAGINATION: {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,     // Default for light loads
  MAX_LIMIT: 5000        // Maximum allowed (bulk operations)
}
```

### Frontend Usage
```javascript
// CRITICAL: Must explicitly request high limit
PlacementsAPI.getAll({ limit: 5000 })

// WRONG: Gets only 20 records
PlacementsAPI.getAll()
```

### Batch Operation Limits
```javascript
// placement.controller.js
MAX_SITES_PER_BATCH: 1000      // Was 100
MAX_LINKS_PER_BATCH: 5000      // Was 500
MAX_ARTICLES_PER_BATCH: 1000   // Was 100
```

### Safety Limits
```javascript
// placement.service.js
DEFAULT_MAX_RESULTS: 10000  // Prevents unbounded queries
```

### Common Bug
```javascript
// ❌ WRONG: Missing limit parameter
fetch('/api/placements')
// Returns only 20 records (default)

// ✅ CORRECT: Explicit limit
fetch('/api/placements?limit=5000')
// Returns up to 5000 records
```

### Frontend Functions Requiring Limits
1. `updateTabCounts()` - Must include `?limit=5000`
2. `loadActivePlacements()` - Must include `?limit=5000`
3. Dashboard stats - Must include `{ limit: 5000 }`

### Consequences
- ✅ Supports high-volume users
- ✅ Bulk operations work
- ⚠️ Frontend must explicitly request high limits
- ⚠️ Large result sets consume memory

---

## ADR-016: Winston Logging Strategy

**Status**: ✅ ACTIVE
**Date**: October 2024

### Context
Need structured logging for debugging and monitoring.

### Decision
Use **Winston** with daily log rotation and multiple log levels.

### Configuration
```javascript
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'backend/logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new DailyRotateFile({
      filename: 'backend/logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});
```

### Log Levels
```javascript
logger.error('Critical error', { userId, error: error.message });
logger.warn('Warning condition', { context });
logger.info('Application started on port 3003');
logger.debug('Query executed', { query, duration: 152 });
```

### Rotation Policy
- **Error logs**: Keep 14 days
- **Combined logs**: Keep 30 days
- **Max file size**: 20MB
- **Compression**: Automatic gzip

### Monitoring Queries
```javascript
// Slow query detection
const duration = Date.now() - start;
if (duration > 1000) {
  logger.warn('Slow query detected', {
    query: text,
    duration,
    rows: result.rowCount
  });
}
```

### Consequences
- ✅ Structured JSON logs (easy parsing)
- ✅ Automatic cleanup (disk space management)
- ⚠️ Must rotate manually if disk fills
- ⚠️ Sensitive data must be redacted

---

## ADR-017: Context-Aware Validation for Site Parameters

**Status**: ✅ ACTIVE
**Date**: November 2025 (v2.5.1)

### Context
Bulk update endpoint for site parameters needs different validation rules:
- `dr` (Domain Rating) and `da` (Domain Authority) are ratings: 0-100
- `ref_domains`, `rd_main`, `norm` are counts: 0 to unlimited

### Previous Behavior
```javascript
// All parameters limited to 0-100 (INCORRECT)
body('updates.*.value').isInt({ min: 0, max: 100 })
```

**Problem**: Cannot update ref_domains=5000 because max: 100 validation fails.

### Decision
Implement **context-aware validation** in controller rather than express-validator middleware.

### Implementation
```javascript
// admin.routes.js

// Basic validation (all parameters): min 0, no max limit
body('updates.*.value').isInt({ min: 0 }).withMessage('Value must be a non-negative integer')

// Context-aware validation in route handler
async (req, res) => {
  const { parameter, updates } = req.body;

  // DR/DA: validate 0-100 range
  if (parameter === 'dr' || parameter === 'da') {
    const invalidValues = updates.filter(u => u.value > 100);
    if (invalidValues.length > 0) {
      return res.status(400).json({
        error: `${parameter.toUpperCase()} values must be between 0 and 100. Found invalid values for: ${invalidValues.map(u => u.domain).join(', ')}`
      });
    }
  }

  // ref_domains, rd_main, norm: no upper limit
  // ... proceed with update
}
```

### Rationale
**Why context-aware validation**:
- ✅ Single endpoint for all parameters
- ✅ Different validation rules per parameter type
- ✅ Express-validator can't access `parameter` field during validation
- ✅ Clear error messages with domain names

**Why not separate endpoints**:
- Code duplication across 5 endpoints
- Frontend complexity (5 different API calls)
- Same core logic with different validation

### Allowed Parameters
```javascript
const allowedParams = ['dr', 'da', 'ref_domains', 'rd_main', 'norm'];

// Validation rules:
// dr        → 0-100 (Ahrefs Domain Rating)
// da        → 0-100 (MOZ Domain Authority)
// ref_domains → 0-∞ (referring domains count)
// rd_main   → 0-∞ (domains linking to homepage)
// norm      → 0-∞ (norm links count)
```

### Migration Required
```bash
# Add new columns to sites table
node database/run_da_migration.js
node database/run_ref_domains_migration.js
```

### Consequences
- ✅ Flexible validation per parameter type
- ✅ Single unified endpoint
- ✅ Clear error reporting
- ⚠️ Validation logic in two places (middleware + controller)
- ⚠️ Must update allowed params list when adding new parameters

---

## ADR-018: GEO Parameter System

**Status**: ✅ ACTIVE
**Date**: November 2025

### Context
Need to add geographic targeting capability to sites for filtering placements by country.

### Decision
Extend the existing `sites` table with a `geo` column and implement client-side filtering on placements page.

### Rationale
**Why extend sites table**:
- ✅ Follows LEVER framework - Leverage existing patterns
- ✅ No new table required
- ✅ Single-column addition, minimal migration
- ✅ Reuses existing bulk update infrastructure

**Why client-side filtering**:
- ✅ Sites data already loaded in memory
- ✅ No additional API calls
- ✅ Instant response on filter change
- ✅ Pattern matches existing whitelist/blacklist filters

**Why VARCHAR(10) for GEO**:
- ✅ ISO country codes are 2-3 characters
- ✅ Room for future expansion (regions, multi-geo)
- ✅ Default 'EN' for backward compatibility
- ✅ String type allows flexible geo codes (EN, PL, RU, DE, US-CA)

### Implementation

**Database Migration**:
```sql
ALTER TABLE sites ADD COLUMN IF NOT EXISTS geo VARCHAR(10) DEFAULT 'EN';
```

**Service Layer** (site.service.js):
```javascript
// Add to SELECT queries
'SELECT id, ..., geo FROM sites WHERE ...'

// Add to allowed params whitelist
const allowedParams = ['dr', 'da', ..., 'geo'];

// String handling in bulk update
if (parameter === 'geo') {
  value = value.toUpperCase();
}
```

**Frontend Filter** (placements.html):
```javascript
// State variable
let selectedGeo = '';

// Filter chain addition
if (selectedGeo) {
  sitesToShow = sitesToShow.filter(site => (site.geo || 'EN') === selectedGeo);
}

// Dynamic dropdown population
function updateGeoFilterOptions() {
  const uniqueGeos = [...new Set(sites.map(site => site.geo || 'EN'))];
  uniqueGeos.sort();
  // Rebuild dropdown options
}
```

### Files Modified
1. `database/migrate_add_geo.sql` - Migration script
2. `database/run_geo_migration.js` - Migration runner
3. `backend/services/site.service.js` - Add geo to queries, whitelist
4. `backend/build/sites.html` - Display GEO column
5. `backend/build/placements.html` - GEO filter dropdown
6. `backend/build/placements-manager.html` - Display GEO in tables
7. `backend/build/js/placements-manager.js` - Render GEO values
8. `backend/build/admin-site-params.html` - Bulk GEO update
9. `backend/services/export.service.js` - Export GEO field
10. `backend/services/placement.service.js` - Include GEO in queries

### Consequences
- ✅ Zero new tables, zero new endpoints
- ✅ Reuses existing bulk update pattern
- ✅ Client-side filtering is fast and responsive
- ✅ Default 'EN' prevents NULL handling issues
- ⚠️ GEO values must be managed manually (no predefined list)
- ⚠️ Case sensitivity resolved by uppercase conversion

---

## ADR-019: Optimization Principles Documentation

**Status**: ✅ ACTIVE
**Date**: November 2025

### Context
Need to document code optimization principles and extended thinking framework for consistent development practices.

### Decision
Create **OPTIMIZATION_PRINCIPLES.md** as a standalone document and reference it from CLAUDE.md.

### Rationale
- ✅ Separates concerns - CLAUDE.md for dev commands, OPTIMIZATION for methodology
- ✅ LEVER framework provides clear decision criteria
- ✅ Scoring system makes extend-vs-create decisions objective
- ✅ Three-pass approach ensures thorough analysis

### Key Principles

**LEVER Framework**:
- **L**everage existing patterns
- **E**xtend before creating
- **V**erify through reactivity
- **E**liminate duplication
- **R**educe complexity

**Success Metrics**:
| Metric | Target |
|--------|--------|
| Code reduction | >50% |
| Pattern reuse | >70% |
| New files | <3 per feature |
| New tables | 0 |

### Consequences
- ✅ Consistent decision-making across team
- ✅ Measurable optimization targets
- ✅ Clear anti-patterns documented
- ⚠️ Requires discipline to follow checklist

---

## ADR-020: Admin-Only Public Site Control

**Status**: ✅ ACTIVE
**Date**: November 2025 (v2.5.4)

### Context
Regular users could set `is_public = true` on their sites, making them visible to all users. This created a marketplace quality control issue and potential for abuse.

### Decision
**Restrict `is_public = true` to admin-only** through both API validation and UI controls.

### Rationale
**Why admin-only**:
- ✅ Quality control - admin can verify sites meet standards
- ✅ Prevents spam/low-quality sites in marketplace
- ✅ Business model protection - admin controls site visibility
- ✅ Audit trail via admin action logging

**Why not automated approval**:
- Manual review ensures quality
- Admin can check site metrics (DR, DA, traffic)
- Human judgment for edge cases

### Implementation

**Backend - site.controller.js**:
```javascript
// createSite() - force is_public = false for non-admin
const createSite = async (req, res) => {
  let { is_public, ...siteData } = req.body;

  // Only admin can create public sites
  if (req.user.role !== 'admin') {
    is_public = false;
  }

  const site = await siteService.createSite(req.user.id, { ...siteData, is_public });
  // ...
};

// updateSite() - strip is_public for non-admin
const updateSite = async (req, res) => {
  let updates = { ...req.body };

  // Non-admin cannot change public status
  if (req.user.role !== 'admin') {
    delete updates.is_public;
  }

  const site = await siteService.updateSite(id, updates);
  // ...
};
```

**Backend - admin.routes.js**:
```javascript
// New admin-only endpoints
router.get('/sites', async (req, res) => {
  const sites = await adminService.getAllSites(filters);
  // Returns ALL sites from ALL users with owner info
});

router.put('/sites/:id/public-status', async (req, res) => {
  const { is_public } = req.body;
  await adminService.setSitePublicStatus(siteId, is_public, req.user.id);
  // Logs admin action
});
```

**Backend - admin.service.js**:
```javascript
const setSitePublicStatus = async (siteId, isPublic, adminId) => {
  // Verify site exists
  const site = await query('SELECT * FROM sites WHERE id = $1', [siteId]);
  if (!site.rows[0]) throw new Error('Site not found');

  // Update public status
  await query('UPDATE sites SET is_public = $1 WHERE id = $2', [isPublic, siteId]);

  // Audit logging
  logger.info('Admin changed site public status', {
    adminId,
    siteId,
    newStatus: isPublic,
    previousStatus: site.rows[0].is_public
  });

  return updatedSite;
};

const getAllSites = async (filters) => {
  // Join with users to show owner info
  return await query(`
    SELECT s.*, u.username as owner_username
    FROM sites s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE ...
  `);
};
```

**Frontend - sites.html**:
```html
<!-- Hide controls for non-admin -->
<% if (userRole !== 'admin') { %>
  <style>
    .public-checkbox, .bulk-public-buttons { display: none !important; }
  </style>
<% } %>

<!-- Read-only badge for non-admin -->
<td class="public-status">
  <% if (userRole === 'admin') { %>
    <input type="checkbox" class="public-toggle" data-site-id="<%= site.id %>">
  <% } else { %>
    <span class="badge <%= site.is_public ? 'bg-success' : 'bg-secondary' %>">
      <%= site.is_public ? 'Публичный' : 'Приватный' %>
    </span>
  <% } %>
</td>
```

### API Endpoints

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/sites` | POST | Auth | Create site (is_public forced to false for non-admin) |
| `/api/sites/:id` | PUT | Auth | Update site (is_public ignored for non-admin) |
| `/api/admin/sites` | GET | Admin | List all sites with owner info |
| `/api/admin/sites/:id/public-status` | PUT | Admin | Set site public status |

### Security Measures
1. **Server-side validation** - API ignores is_public from non-admin
2. **Frontend hiding** - UI controls hidden for non-admin
3. **Audit logging** - All admin actions logged with timestamps
4. **No escalation path** - Users cannot request public status via API

### Migration
No database migration required - uses existing `is_public` column.

### Consequences
- ✅ Full control over marketplace quality
- ✅ Prevents abuse of public sites
- ✅ Audit trail for admin actions
- ⚠️ Users must contact admin to make sites public
- ⚠️ Admin workload increases with more sites

---

## ADR-021: Frontend Shared Utilities Architecture

**Status**: ✅ ACTIVE
**Date**: December 2025
**Decision Makers**: Development Team

### Context
Frontend codebase had significant code duplication:
- Badge configurations duplicated 8+ times across files
- Utility functions (`formatDate`, `isAdmin`, `escapeHtml`) defined in multiple places
- Two parallel API client implementations (`core/api.js` vs `api.js`)
- ~2000 lines of dead code in unused `core/` and `modules/` folders
- No centralized pattern for common UI elements

### Decision
Implement **modular shared utilities architecture** with strict single-source-of-truth for each function.

### Rationale
**Problems Solved**:
- ✅ **DRY Violation**: Same badge HTML defined 8+ times
- ✅ **Inconsistent Behavior**: `formatDate()` had different implementations
- ✅ **Dead Code**: 11 unused files (~2000 lines)
- ✅ **Maintenance Burden**: Changes required editing multiple files

**New Architecture**:
```
backend/build/js/
├── security.js       # escapeHtml(), showAlert() - FIRST to load
├── auth.js           # getToken(), isAdmin(), isAuthenticated()
├── badge-utils.js    # All badge/status/color utilities
├── api.js            # ProjectsAPI, SitesAPI, BillingAPI, PlacementsAPI
├── purchase-modal.js # Shared purchase modal logic
└── [page].js         # Page-specific code (uses above)
```

### Implementation

**Script Loading Order** (CRITICAL):
```html
<!-- 1. Security (XSS protection) -->
<script src="/js/security.js"></script>

<!-- 2. Auth (token management) -->
<script src="/js/auth.js"></script>

<!-- 3. Shared utilities -->
<script src="/js/badge-utils.js"></script>
<script src="/js/api.js"></script>

<!-- 4. Page-specific -->
<script src="/js/placements-manager.js"></script>
```

**badge-utils.js Exports** (~280 lines):
```javascript
// Status badges
window.getPlacementStatusBadge(status)   // Returns HTML badge
window.getPlacementTypeBadge(type)       // 'link' | 'article'
window.getSiteTypeBadge(siteType)        // 'wordpress' | 'static_php'
window.getTransactionTypeBadge(type)     // deposit, purchase, renewal...
window.getUserRoleBadge(role)            // admin, user

// Color utilities
window.getAmountColorClass(amount)       // text-success/danger/muted
window.getBalanceColorClass(balance)
window.formatExpiryWithColor(expiresAt)  // Returns { text, class, daysLeft }
window.getDrColorClass(dr)               // SEO metric colors
window.getDaColorClass(da)
window.getTfColorClass(tf)
window.getCfColorClass(cf)

// Date formatting
window.formatDate(dateString)            // DD.MM.YYYY
window.formatDateTime(dateString)        // DD.MM.YYYY HH:MM

// Tier utilities
window.getDiscountTierName(discount)     // 0→'Стандарт', 10→'Bronze'...
window.getTierStatusHtml(isActive, isAchieved)

// Placement helpers (added December 2025)
window.getPlacementDisplayUrl(placement) // Article post URL or site URL
window.calculateExpiryInfo(expiresAt)    // Returns { daysLeft, class, text }
window.getAutoRenewalToggleHtml(placement) // Toggle HTML or '—'

// Table helpers
window.getEmptyTableRow(colspan, message)
window.getErrorTableRow(colspan, message)
```

**Deleted Dead Code**:
```
DELETED: backend/build/js/core/
  - api.js      (~217 lines) - Duplicate APIClient class
  - app.js      (~50 lines)  - Never used
  - utils.js    (~80 lines)  - Never used

DELETED: backend/build/js/modules/
  - articles.js, bulk-links.js, export.js, placements.js,
    projects.js, queue.js, sites.js, wordpress.js
  - (~1600 lines total) - None included in any HTML file

DELETED: backend/build/js/my-placements.js (December 2025)
  - (~872 lines) - Never included in any HTML file
  - Fully duplicated placements-manager.js + purchase-modal.js logic
```

### Function Location Reference

| Function | Source File | Line |
|----------|-------------|------|
| `escapeHtml()` | security.js | 7 |
| `showAlert()` | security.js | 105 |
| `getToken()` | auth.js | 19 |
| `isAdmin()` | auth.js | 40 |
| `isAuthenticated()` | auth.js | 25 |
| `apiCall()` | api.js | 18 |
| `showNotification()` | api.js | 6 |
| `formatDate()` | badge-utils.js | 205 |
| `formatDateTime()` | badge-utils.js | 215 |
| `getPlacementStatusBadge()` | badge-utils.js | 23 |
| `getPlacementTypeBadge()` | badge-utils.js | 36 |
| All other badges... | badge-utils.js | - |

### Migration Guide

**Before** (duplicate in each file):
```javascript
// placements-manager.js
function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('ru-RU', {...});
}

// admin-dashboard.js
function formatDate(dateString) {  // DUPLICATE!
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('ru-RU', {...});
}
```

**After** (single source):
```javascript
// placements-manager.js - Uses shared function
// formatDate() is provided by badge-utils.js (loaded first)
const dateStr = formatDate(placement.created_at);

// admin-dashboard.js - Uses shared function with time
// formatDateTime() is provided by badge-utils.js (loaded first)
const dateStr = formatDateTime(purchase.purchased_at);
```

### Verification Commands
```bash
# Check for duplicate function definitions
grep -r "function formatDate(" backend/build/js/
# Should show ONLY badge-utils.js

grep -r "function isAdmin(" backend/build/js/
# Should show ONLY auth.js

grep -r "function escapeHtml(" backend/build/js/
# Should show ONLY security.js
```

### Consequences
- ✅ **~2900 lines removed** from codebase (including my-placements.js)
- ✅ **Single source of truth** for all utilities
- ✅ **Consistent behavior** across all pages
- ✅ **Easier maintenance** - change once, applies everywhere
- ✅ **Smaller bundle** - no duplicate code loaded
- ✅ **~76 lines reduced** in placements-manager.js via shared utilities
- ⚠️ **Script order dependency** - must load in correct order
- ⚠️ **Global namespace** - functions attached to window object

### Related ADRs
- ADR-005: Modular Frontend (Vanilla JS) - Establishes vanilla JS approach
- ADR-007: Parameterized Queries Only - Security patterns extend to frontend

---

## ADR-022: ESLint + Prettier Code Quality

**Status**: ✅ ACTIVE
**Date**: December 2025
**Decision Makers**: Development Team

### Context
Need automated code quality tools to:
- Catch bugs early (unused variables, async/await issues)
- Enforce consistent code formatting
- Maintain code style across team members
- Reduce code review friction on style issues

### Decision
Implement **ESLint 9** (flat config) + **Prettier** integration for JavaScript linting and formatting.

### Configuration

**ESLint Config** (`eslint.config.js`):
```javascript
const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'backend/build/**', 'coverage/**'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'require-await': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['warn', 'smart'],
      'prettier/prettier': 'warn'
    }
  }
];
```

**Prettier Config** (`.prettierrc`):
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "none",
  "printWidth": 100
}
```

### Rules Rationale

| Rule | Level | Why |
|------|-------|-----|
| `no-unused-vars` | warn | Dead code detection, `_` prefix to ignore intentionally |
| `require-await` | warn | Catches async functions missing await (common bug) |
| `no-console` | warn | Reminds to remove debug logs, allows warn/error/info |
| `prefer-const` | warn | Encourages immutability |
| `no-var` | **error** | Block-scoped let/const always preferred |
| `eqeqeq` | warn | Type-safe comparisons (allows == null) |
| `prettier/prettier` | warn | Consistent formatting |

### NPM Scripts

```json
{
  "lint": "eslint backend/ tests/ --ignore-pattern 'backend/build/**'",
  "lint:fix": "eslint backend/ tests/ --ignore-pattern 'backend/build/**' --fix",
  "format": "prettier --write \"backend/**/*.js\" \"tests/**/*.js\"",
  "format:check": "prettier --check \"backend/**/*.js\" \"tests/**/*.js\""
}
```

### Usage Workflow

```bash
# Check for issues
npm run lint

# Auto-fix formatting and some code issues
npm run lint:fix

# Format all files
npm run format
```

### Rejected Alternatives

| Tool | Why Rejected |
|------|--------------|
| **TypeScript** | Too late to migrate (20+ services, 15K+ lines), high effort/low ROI |
| **Husky** (pre-commit hooks) | Conflicts with auto-commit system (`npm run dev` auto-commits) |
| **Vitest** | Jest already works with 520+ tests |
| **ESLint 8** (legacy config) | ESLint 9 flat config is current standard |

### Consequences
- ✅ **Catches bugs early**: Unused variables, async without await
- ✅ **Consistent style**: Prettier handles formatting automatically
- ✅ **2100+ warnings identified**: Mostly formatting (auto-fixable)
- ✅ **Real bugs found**: Unused `publishPlacement` variable, `placementService` import
- ⚠️ **Not enforced on commit**: Use `npm run lint` manually before PR

### Files Created/Modified
- `eslint.config.js` - ESLint 9 flat config (NEW)
- `.prettierrc` - Prettier settings (NEW)
- `.prettierignore` - Ignored paths (NEW)
- `package.json` - Added scripts and devDependencies

### Linting Results (Initial Run)
```
Total: 2158 problems (1 error, 2157 warnings)
- ~2000 Prettier formatting (auto-fix with lint:fix)
- ~50 unused variables (review and fix)
- ~100 require-await (verify intent)
```

---

## Summary of Active ADRs

| ADR | Title | Impact | Status |
|-----|-------|--------|--------|
| 001 | No ORM - Direct SQL | High | ✅ Active |
| 002 | JWT Auth No DB Lookup | High | ✅ Active |
| 003 | Redis Cache Graceful Degradation | Medium | ✅ Active |
| 004 | Transaction-Wrapped Operations | Critical | ✅ Active |
| 005 | Modular Vanilla JS Frontend | Medium | ✅ Active |
| 006 | 5-Tier Rate Limiting | Medium | ✅ Active |
| 007 | Parameterized Queries Only | Critical | ✅ Active |
| 008 | Extended Fields JSONB | High | ✅ Active |
| 009 | Remove Anchor Uniqueness | Low | ✅ Active |
| 010 | Bull Queue Workers Optional | Medium | ✅ Active |
| 011 | Static PHP Sites Support | Medium | ✅ Active |
| 012 | Billing System Architecture | High | ✅ Active |
| 013 | Bulk Registration Tokens | Medium | ✅ Active |
| 014 | COALESCE Partial Updates | Low | ✅ Active |
| 015 | Pagination 5000 Max | Low | ✅ Active |
| 016 | Winston Logging Strategy | Low | ✅ Active |
| 017 | Context-Aware Validation | Medium | ✅ Active |
| 018 | GEO Parameter System | Medium | ✅ Active |
| 019 | Optimization Principles Doc | Low | ✅ Active |
| 020 | Admin-Only Public Site Control | High | ✅ Active |
| 021 | Frontend Shared Utilities | High | ✅ Active |
| 022 | ESLint + Prettier Code Quality | Medium | ✅ Active |
| 023 | URL Masking for Premium Sites | High | ✅ Active |
| 024 | 6-Month Cooldown for Site Limits | Medium | ✅ Active |

---

## ADR-023: URL Masking for Premium Sites

**Status**: ✅ ACTIVE
**Date**: December 2025
**Decision Makers**: Development Team

### Context
High-value sites with strong SEO metrics (DR/DA) need protection from casual users copying URLs without commitment. Need incentive for users to reach Gold tier.

### Decision
Implement **URL masking** for premium sites:
- **Threshold**: DR >= 20 OR DA >= 30
- **Exceptions**: Admin users and Gold+ tier (20% discount, $3000+ spent) see all URLs

### Masking Algorithm
```javascript
function maskUrl(url, dr, da, userDiscount, isAdmin) {
    // Exceptions - see full URL
    if (isAdmin || userDiscount >= 20) return url;

    // Only mask premium sites
    if (dr < 20 && da < 30) return url;

    // Remove protocol and www
    let cleanUrl = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    cleanUrl = cleanUrl.split('/')[0];

    const parts = cleanUrl.split('.');
    const domain = parts.pop();
    const name = parts.join('.');

    // Masking based on name length
    if (name.length <= 3) {
        return name.slice(0, 1) + '***' + name.slice(-1) + '.' + domain;
    } else if (name.length <= 6) {
        return name.slice(0, 2) + '***' + name.slice(-2) + '.' + domain;
    }
    return name.slice(0, 4) + '***' + name.slice(-2) + '.' + domain;
}
```

### Examples
| Original | DR/DA | Masked |
|----------|-------|--------|
| `elearning-reviews.org` | DR=50 | `elear***ws.org` |
| `litlong.org` | DA=35 | `lit***ng.org` |
| `abc.com` | DR=25 | `a***c.com` |
| `example.com` | DR=5 | `example.com` (no masking) |

### Implementation
- **Location**: `backend/build/placements.html` lines 507-541
- **Data source**: User discount loaded from `/api/billing/balance`
- **Admin check**: Via `isAdmin()` function from auth.js

### Consequences
- ✅ **Incentivizes Gold tier**: Users must spend $3000+ to see all URLs
- ✅ **Protects premium sites**: Casual browsing won't reveal valuable domains
- ✅ **Admin exception**: Operations team can always see full URLs
- ⚠️ **UX friction**: New users see masked URLs (by design)

### Related ADRs
- ADR-012: Billing System Architecture (discount tiers)
- ADR-020: Admin-Only Public Site Control

---

## ADR-024: 6-Month Cooldown for Site Limits

**Status**: ✅ ACTIVE
**Date**: December 2025
**Decision Makers**: Development Team

### Context
Site owners could manipulate `max_links` / `max_articles` frequently to game the system or avoid commitments after links expire. Need to prevent limit abuse.

### Decision
Implement **6-month cooldown** for non-admin users changing site limits:
- Track when limits were last changed via `limits_changed_at` column
- Only enforce cooldown for non-admin users
- Show remaining cooldown time in UI

### Implementation

**Database Migration**:
```sql
ALTER TABLE sites ADD COLUMN limits_changed_at TIMESTAMP DEFAULT NULL;
```

**Backend Logic** (site.service.js):
```javascript
// In updateSite() function:
if (userRole !== 'admin') {
    if (site.limits_changed_at) {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        if (new Date(site.limits_changed_at) > sixMonthsAgo) {
            throw new Error('Вы можете изменять лимиты Links/Articles раз в 6 месяцев...');
        }
    }

    // Track change
    if (actuallyChanged) {
        updateFields.push('limits_changed_at = CURRENT_TIMESTAMP');
    }
}
```

**Frontend UI** (sites.html):
- Yellow warning alert when cooldown is active
- Readonly input fields for max_links/max_articles during cooldown
- Shows remaining cooldown time (e.g., "Осталось: 5 месяцев и 23 дня")

### Exceptions
| User Role | Cooldown Enforced |
|-----------|-------------------|
| Admin | ❌ No - can change anytime |
| Regular User | ✅ Yes - once per 6 months |

### Files Modified
- `database/migrate_limits_cooldown.sql` - Schema migration
- `backend/services/site.service.js` - Cooldown check logic
- `backend/controllers/site.controller.js` - Pass user role to service
- `backend/build/sites.html` - UI warning and readonly state

### Consequences
- ✅ **Prevents abuse**: Users can't constantly adjust limits
- ✅ **Admin flexibility**: Admins can adjust when needed
- ✅ **Transparent**: UI shows remaining cooldown time
- ⚠️ **User friction**: Legitimate limit changes blocked for 6 months

### Related ADRs
- ADR-020: Admin-Only Public Site Control (admin exceptions pattern)

---

---

## ADR-025: Notification System API Consistency

**Status**: Accepted
**Date**: December 2025
**Context**: Notification badge and "Mark all as read" button were not working correctly

### Decision

Standardized notification API endpoints and HTTP methods across frontend and backend:

**Correct API Pattern**:
```
PATCH /api/notifications/mark-all-read
```

### Problem Statement

Multiple inconsistencies caused the "Mark all as read" button to fail:
1. **HTTP Method Mismatch**: Frontend used `POST`, backend expected `PATCH`
2. **URL Mismatch**: navbar.js used `/api/notifications/read-all` instead of `/mark-all-read`
3. **Invalid SQL**: Backend had `RETURNING COUNT(*)` in UPDATE (not valid in PostgreSQL)

### Fixes Applied

**1. sidebar.js** (line 775):
```javascript
// Before:
method: 'POST'
// After:
method: 'PATCH'
```

**2. navbar.js** (line 469):
```javascript
// Before:
'/api/notifications/read-all'
// After:
'/api/notifications/mark-all-read'
```

**3. notification.routes.js** (line 149-156):
```sql
-- Before:
UPDATE notifications SET read = true WHERE ... RETURNING COUNT(*) as count
-- After:
UPDATE notifications SET read = true WHERE ...
-- Use result.rowCount instead
```

### Bootstrap Dropdown Configuration

Added `data-bs-auto-close="outside"` to notification dropdown button:
- Prevents dropdown from closing when clicking inside (e.g., text selection)
- Only closes on click outside or on the bell icon
- Enables proper text selection in notifications

### Files Modified
- `backend/build/js/sidebar.js` - HTTP method fix, dropdown config
- `backend/build/js/navbar.js` - URL fix
- `backend/routes/notification.routes.js` - SQL fix, added cache error handling

### Testing

Puppeteer tests verify:
```
✅ Badge hidden after mark read
✅ Header text updated to "Все прочитано"
✅ Dropdown stays open during text selection
```

Test files: `tests/visual/test-notifications.js`, `tests/visual/test-notifications-debug.js`

### Consequences
- ✅ "Mark all as read" now works correctly
- ✅ Badge counter updates immediately
- ✅ Text selection works in notifications
- ✅ Automated tests prevent regression

---

## ADR-026: Local Credentials Management

**Status**: Accepted
**Date**: December 2025
**Context**: Need to access credentials without committing them to GitHub

### Decision

All sensitive credentials stored in `.credentials.local` file, never committed to version control.

### Implementation

**File**: `.credentials.local` (in project root)
- Contains all passwords, tokens, API keys
- Added to `.gitignore`
- Read by Claude Code when needed

**Protected by .gitignore**:
```
.env
.credentials.local
*.log
backend/logs/
```

### Security Verification

Before any git push:
```bash
git diff --cached | grep -i "password\|secret\|token\|AVNS_"
```

### Consequences
- ✅ Credentials never pushed to GitHub
- ✅ Single source of truth for local access
- ✅ Easy to update credentials in one place
- ⚠️ Must manually keep `.credentials.local` updated

---

## ADR-027: Puppeteer Visual Testing Strategy

**Status**: Accepted
**Date**: December 2025
**Context**: Need automated verification of UI changes

### Decision

Use Puppeteer for automated visual testing of all UI components.

### When to Use

**ALWAYS use Puppeteer for**:
- CSS/styling changes
- Notification system changes
- Modal/dropdown behavior
- User-reported UI bugs
- Before finalizing frontend changes

### Test Structure

```
tests/visual/
├── test-notifications.js       # Full test suite
├── test-notifications-debug.js # With API logging
├── test-time.js               # Timestamp verification
└── screenshots/               # Output images
```

### Running Tests

```bash
node tests/visual/test-notifications.js
```

### Test Output

```
📊 TEST SUMMARY:
═══════════════════════════════════════════
   Badge hidden after mark read: ✅ YES
   Header text updated: ✅ YES
   Dropdown stays open on text select: ✅ YES
═══════════════════════════════════════════
```

### Consequences
- ✅ Automated UI regression detection
- ✅ Screenshots for visual verification
- ✅ Network logging for debugging
- ⚠️ Requires server running on port 3003

---

## ADR-028: Complete Field Pass-Through in Controller-Service Layer

**Status**: ✅ ACTIVE
**Date**: December 2025
**Context**: Link edit functionality broke because `html_context` field was not being passed through the stack

### Problem Statement

When adding fields to database tables, all layers must be updated:
1. **Frontend** - Form fields collect data
2. **Controller** - Extract from `req.body`
3. **Service** - Include in SQL query
4. **Database** - Column must exist

Missing ANY layer causes silent failures (data not saved but no error).

### Decision

**All optional fields must be explicitly extracted and passed through every layer**, even if they use `COALESCE` for partial updates.

### Implementation Pattern

**Controller Pattern** (always extract all editable fields):
```javascript
const updateProjectLink = async (req, res) => {
  const { id: projectId, linkId } = req.params;
  const userId = req.user.id;

  // CRITICAL: Extract ALL fields that can be edited
  const { url, anchor_text, usage_limit, html_context } = req.body;

  const link = await projectService.updateProjectLink(projectId, linkId, userId, {
    url,
    anchor_text,
    usage_limit,
    html_context  // Must be included even if optional
  });

  res.json(link);
};
```

**Service Pattern** (use COALESCE for all fields):
```javascript
const updateProjectLink = async (projectId, linkId, userId, linkData) => {
  const { url, anchor_text, usage_limit, html_context } = linkData;

  const result = await query(
    `UPDATE project_links
     SET url = COALESCE($1, url),
         anchor_text = COALESCE($2, anchor_text),
         usage_limit = COALESCE($3, usage_limit),
         html_context = COALESCE($4, html_context),  -- Include ALL fields
         updated_at = NOW()
     WHERE id = $5 AND project_id = $6
     RETURNING *`,
    [url, anchor_text, usage_limit, html_context, linkId, projectId]
  );

  return result.rows[0];
};
```

### Checklist for Adding New Fields

When adding a new field to an entity:

1. ☐ **Database**: Add column via migration
2. ☐ **Service (CREATE)**: Include in INSERT query
3. ☐ **Service (UPDATE)**: Include in UPDATE query with COALESCE
4. ☐ **Controller (CREATE)**: Extract from `req.body`
5. ☐ **Controller (UPDATE)**: Extract from `req.body`
6. ☐ **Frontend**: Add form field
7. ☐ **API Docs**: Update API_REFERENCE.md

### Bug Fixed

**Issue**: Link save not working after editing
**Root Cause**: `html_context` was:
- ✅ Saved in database
- ✅ Displayed in frontend form
- ❌ NOT extracted in controller
- ❌ NOT included in service UPDATE

**Fix**:
- `backend/controllers/project.controller.js` line 252: Added `html_context` extraction
- `backend/services/project.service.js` lines 253-264: Added `html_context` to UPDATE query

### Consequences
- ✅ All fields properly saved on edit
- ✅ COALESCE pattern allows partial updates
- ✅ `updated_at` automatically set on changes
- ⚠️ Must remember to update ALL layers when adding fields

### Testing

```bash
# Run visual test to verify
node tests/visual/test-link-edit.js
```

---

## ADR-029: Database Timestamp Columns (updated_at)

**Status**: ✅ ACTIVE
**Date**: December 2025
**Context**: Many tables lacked `updated_at` tracking

### Decision

All mutable tables must have `updated_at TIMESTAMP` column for audit trail.

### Tables Updated

| Table | Fallback Column | Migration |
|-------|-----------------|-----------|
| `placements` | `published_at` | migrate_add_updated_at.sql |
| `project_links` | `created_at` | migrate_add_updated_at.sql |
| `project_articles` | `created_at` | migrate_add_updated_at.sql |
| `registration_tokens` | `created_at` | migrate_add_updated_at.sql |

### Migration Pattern

```javascript
// Check if column exists before adding
const checkResult = await pool.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = $1 AND column_name = 'updated_at'
`, [tableName]);

if (checkResult.rows.length === 0) {
  // Add column with default
  await pool.query(`
    ALTER TABLE ${tableName}
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  // Backfill existing records
  await pool.query(`
    UPDATE ${tableName}
    SET updated_at = COALESCE(${fallbackColumn}, NOW())
    WHERE updated_at IS NULL
  `);
}
```

### Running Migration

```bash
# With SSL for DigitalOcean
NODE_TLS_REJECT_UNAUTHORIZED=0 node database/run_updated_at_migration.js
```

### Service Pattern

Always set `updated_at = NOW()` in UPDATE queries:
```sql
UPDATE table_name
SET field = $1,
    updated_at = NOW()
WHERE id = $2
```

### Consequences
- ✅ All modifications tracked with timestamp
- ✅ Enables change auditing
- ✅ Supports "last modified" display in UI
- ⚠️ Requires migration on existing databases

---

## Decision Review Process

ADRs should be reviewed when:
- 🔄 Major version bump (v3.0.0)
- 🔄 Performance issues arise
- 🔄 Security vulnerabilities discovered
- 🔄 Technology landscape changes (e.g., new PostgreSQL features)

**Last Review**: December 2025
**Next Review**: June 2026
