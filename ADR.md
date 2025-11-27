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

**Module structure**:
```
backend/build/js/
├── core/
│   ├── api.js         # Centralized API client
│   ├── utils.js       # Shared utilities
│   └── app.js         # Initialization
├── components/
│   ├── notifications.js
│   ├── modals.js
│   └── pagination.js
└── modules/
    ├── projects.js    # Page-specific logic
    ├── sites.js
    └── placements.js
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

## ADR-006: 5-Tier Rate Limiting Strategy

**Status**: ✅ ACTIVE
**Date**: October 2024

### Context
Need DDoS protection without blocking legitimate users.

### Decision
Implement **5 different rate limit tiers** based on operation sensitivity.

### Configuration
```javascript
LOGIN:     5 requests / 15 minutes  // Brute force protection
API:       100 requests / minute    // General API
CREATE:    10 requests / minute     // Resource creation
PLACEMENT: 20 requests / minute     // Placement operations
WORDPRESS: 30 requests / minute     // Plugin endpoints
FINANCIAL: 50 requests / minute     // Billing operations (bulk support)
```

### Rationale
**Why different tiers**:
- Login: Most critical (credential stuffing attacks)
- Create: Prevent spam resource creation
- Financial: Higher limit for bulk purchases
- WordPress: External plugin calls (higher volume)

### Implementation
```javascript
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts'
});

router.post('/login', loginLimiter, authController.login);
```

### Consequences
- ✅ Prevents abuse without frustrating users
- ✅ Different limits for different risk levels
- ⚠️ Must communicate limits in API docs

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

---

## Decision Review Process

ADRs should be reviewed when:
- 🔄 Major version bump (v3.0.0)
- 🔄 Performance issues arise
- 🔄 Security vulnerabilities discovered
- 🔄 Technology landscape changes (e.g., new PostgreSQL features)

**Last Review**: November 2025
**Next Review**: April 2026
