# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Documentation Index

### Core Documentation (Must Read)
- **[CLAUDE.md](CLAUDE.md)** - This file: Complete development guide
- **[ADR.md](ADR.md)** - Architecture Decision Records (20 major design decisions)
- **[README.md](README.md)** - Quick start guide and project overview
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete API endpoint reference (60+ routes)

### Operational Documentation
- **[RUNBOOK.md](RUNBOOK.md)** - Step-by-step procedures for common operations
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and all changes (v1.0.0 → v2.5.4)
- **[DECISIONS.md](DECISIONS.md)** - Quick technical patterns and gotchas

### Specialized Guides
- **[EXTENDED_FIELDS_GUIDE.md](EXTENDED_FIELDS_GUIDE.md)** - Extended fields system (JSONB)
- **[OPTIMIZATION_PRINCIPLES.md](OPTIMIZATION_PRINCIPLES.md)** - Code optimization framework (LEVER methodology)
- **[database/MIGRATION_INSTRUCTIONS.md](database/MIGRATION_INSTRUCTIONS.md)** - Database migration guide
- **[wordpress-plugin/CHANGELOG.md](wordpress-plugin/CHANGELOG.md)** - Plugin version history

### Documentation Hierarchy
```
┌─────────────────────────────────────────┐
│ CLAUDE.md - Start here                  │
│ ├─ Development commands                 │
│ ├─ Architecture overview                │
│ └─ Links to all other docs              │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ ADR.md - Architectural decisions        │
│ WHY things are built this way           │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ API_REFERENCE.md - API contracts        │
│ HOW to use the system                   │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ RUNBOOK.md - Operations                 │
│ WHAT to do when issues arise            │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ DECISIONS.md - Quick patterns           │
│ Daily development shortcuts             │
└─────────────────────────────────────────┘
```

**IMPORTANT**:
- Before architectural changes → Read [ADR.md](ADR.md)
- Before API changes → Read [API_REFERENCE.md](API_REFERENCE.md)
- Before deployment → Read [RUNBOOK.md](RUNBOOK.md)
- Quick coding questions → Read [DECISIONS.md](DECISIONS.md)

## Development Commands

### Running the Server
```bash
# Development with nodemon (auto-reload on file changes) - RECOMMENDED
npm run dev

# Development without nodemon
cd backend && PORT=3003 NODE_ENV=development node server-new.js

# Production
npm start
```

**Nodemon**: Installed globally and as devDependency. Watches all `.js`, `.mjs`, `.json` files and auto-restarts server on changes.

### Database Operations
```bash
# Run migrations
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/migrate_usage_limits.sql

# Or use the migration runner
node database/run_migration.js

# CRITICAL: If you get "column user_id does not exist" error, run this migration first:
node database/run_user_id_migration.js

# Initialize fresh database
psql -d linkmanager -f database/init.sql
psql -d linkmanager -f database/seed.sql
```

### Port Management
```bash
# Kill process on port 3003/3005
lsof -ti:3003 | xargs kill -9
lsof -ti:3005 | xargs kill -9
```

### Testing API Endpoints
```bash
# Login and get token
TOKEN=$(curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# Use authenticated endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:3003/api/projects
```

### Development Scripts

**Auto-restart with kill on port change** (recommended for development):
```bash
npm run dev:auto
```
This script:
1. Kills any existing process on port 3003
2. Starts server with nodemon in watch mode
3. Auto-restarts on file changes
4. Ideal for rapid development iteration

**Manual server control**:
```bash
# Start development server
npm run dev

# Start production server
npm start

# Kill process manually
lsof -ti:3003 | xargs kill -9
```

**Quick testing scripts** (root directory):
```bash
# Test static PHP sites functionality
node test-static-sites.js

# Test critical billing features
node test-billing-critical.js

# Quick test script (custom tests)
./quick-test.sh
```

## Architecture Overview

### Request Flow
```
HTTP Request
    ↓
Routes (backend/routes/*.routes.js) - Define endpoints
    ↓
Controllers (backend/controllers/*.controller.js) - Extract params, validate
    ↓
Services (backend/services/*.service.js) - Business logic
    ↓
Database (config/database.js) - Direct query() calls with parameterized SQL
    ↓
PostgreSQL 17.6 on DigitalOcean
```

**Key Pattern**: This codebase does NOT use ORM models. Services call `query()` directly with parameterized SQL.

### Service Layer Pattern
All services use direct SQL queries via `const { query } = require('../config/database')`. There is NO ORM or model abstraction layer.

Example service pattern:
```javascript
const { query } = require('../config/database');

const getSomething = async (id, userId) => {
  const result = await query(
    'SELECT * FROM table WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0];
};
```

### Database Schema Critical Fields

**Sites Table** uses `api_key` NOT `wp_username`/`wp_password`:
- `api_key VARCHAR(100)` - API token from WordPress plugin
- Frontend must send `api_key` field, not credentials
- **Schema**: `name`, `url`, `api_key`, `max_links`, `used_links`, `max_articles`, `used_articles`
- **Do NOT use**: `status`, `notes` - these columns do not exist

**Placements Table** critical columns:
- `status VARCHAR(50) DEFAULT 'pending'` - Placement status (pending/placed/failed)
- `wordpress_post_id INTEGER` - WordPress post ID after publication
- Must be included in all CREATE TABLE and migrations

**Usage Tracking System** (added via migration):
- `project_links`: `usage_limit` (default 999), `usage_count`, `status`
- `project_articles`: `usage_limit` (default 1), `usage_count`, `status`
- Articles are single-use only (limit=1)
- Used articles (usage_count >= 1) cannot be deleted

**Extended Fields (v2.5.0+)** (added via migration):
- `project_links` JSONB columns:
  - `image_url` - Image URL for link display
  - `link_attributes` - JSON object with HTML attributes (class, style, rel, target, data-*)
  - `wrapper_config` - JSON object with wrapper element config (wrapper_tag, wrapper_class, wrapper_style)
  - `custom_data` - JSON object with any additional custom data
- All fields are OPTIONAL (nullable)
- No uniqueness constraint on `anchor_text` (removed January 2025)

### Route Parameter Conventions
**CRITICAL**: Route definitions use `:id` for project ID, NOT `:projectId`:
```javascript
// Correct route parameter access
router.delete('/:id/articles/:articleId', ...)

// In controller, use:
const projectId = req.params.id;  // NOT req.params.projectId
const articleId = req.params.articleId;
```

### Database Connection
- **Production**: PostgreSQL 17.6 on DigitalOcean with SSL (`rejectUnauthorized: false`)
- **Local**: Standard PostgreSQL connection
- Connection is initialized via `DATABASE_URL` or individual `DB_*` env vars
- Uses connection pooling (max 25 connections)

### Authentication
JWT-based authentication without database lookups in middleware:
- Token payload: `{ userId, username, role, iat, exp }`
- Expiry: 7 days
- Access via `req.user.id`, `req.user.username`, `req.user.role`

### Frontend Architecture (ADR-021)
Vanilla JavaScript with modular shared utilities architecture:

**Static files**: `backend/build/` (HTML, CSS, JS)

**Script Loading Order** (CRITICAL - must be in this order):
```html
<!-- 1. Security (XSS protection) - FIRST -->
<script src="/js/security.js"></script>    <!-- escapeHtml(), showAlert() -->

<!-- 2. Auth (token management) -->
<script src="/js/auth.js"></script>         <!-- getToken(), isAdmin() -->

<!-- 3. Shared utilities -->
<script src="/js/badge-utils.js"></script>  <!-- All badge/color functions -->
<script src="/js/api.js"></script>          <!-- ProjectsAPI, SitesAPI, etc. -->

<!-- 4. Page-specific -->
<script src="/js/placements-manager.js"></script>
```

**Key Frontend Files**:
| File | Purpose | Exports |
|------|---------|---------|
| `security.js` | XSS protection | `escapeHtml()`, `showAlert()` |
| `auth.js` | Auth & tokens | `getToken()`, `isAdmin()`, `isAuthenticated()` |
| `badge-utils.js` | UI utilities | `getPlacementStatusBadge()`, `formatDate()`, etc. |
| `api.js` | API client | `ProjectsAPI`, `SitesAPI`, `BillingAPI`, `PlacementsAPI` |
| `navbar.js` | Navigation | `initNavbar()`, notifications |
| `purchase-modal.js` | Purchase UI | Modal handlers |

**Badge Utils Functions** (badge-utils.js):
```javascript
// Status badges
getPlacementStatusBadge(status)   // 'placed' → green badge
getPlacementTypeBadge(type)       // 'link' | 'article'
getSiteTypeBadge(siteType)        // 'wordpress' | 'static_php'
getTransactionTypeBadge(type)     // deposit, purchase, renewal...
getUserRoleBadge(role)            // admin, user

// Color utilities
getAmountColorClass(amount)       // text-success/danger/muted
formatExpiryWithColor(expiresAt)  // Returns { text, class, daysLeft }
getDrColorClass(dr)               // SEO metric colors

// Date formatting
formatDate(dateString)            // DD.MM.YYYY
formatDateTime(dateString)        // DD.MM.YYYY HH:MM

// Tier utilities
getDiscountTierName(discount)     // 0→'Стандарт', 10→'Bronze'...
```

**Pages**: Individual HTML files (dashboard.html, sites.html, placements-manager.html, etc.)

Bootstrap 5.3.0 for UI with custom styles in `backend/build/css/styles.css`.

## Important Patterns & Conventions

### Database Transactions (CRITICAL)
**Always use transactions** for multi-step database operations to ensure data consistency:

```javascript
const { pool } = require('../config/database');

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Multiple operations
  await client.query('INSERT INTO table1...');
  await client.query('UPDATE table2...');

  await client.query('COMMIT');
  return result;
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

**When to use transactions:**
- Creating placements (insert placement + placement_content + update usage_count)
- Deleting placements (delete placement + decrement usage_count + update quotas)
- Any operation that modifies multiple related tables
- Operations where partial failure would leave database in inconsistent state

**Row-level locking** with `FOR UPDATE` to prevent race conditions:
```sql
SELECT * FROM placements WHERE id = $1 FOR UPDATE OF p
```

### Partial Updates with COALESCE
All UPDATE queries should use COALESCE for partial updates:
```sql
UPDATE table
SET field1 = COALESCE($1, field1),
    field2 = COALESCE($2, field2)
WHERE id = $3
```

### Modal Windows
Modals must support both `.active` and `.show` classes:
```css
.modal.active,
.modal.show {
    display: flex;
}
```

### API Response Format
```javascript
// Success
res.json({ data: result });

// Error
res.status(400).json({ error: 'Error message' });
```

### Service Error Handling
Services throw errors, controllers catch and return HTTP responses:
```javascript
// Service
throw new Error('Not found');

// Controller
try {
  await service.doSomething();
} catch (error) {
  logger.error('Operation failed:', error);
  res.status(500).json({ error: 'Failed to do something' });
}
```

## Critical Business Logic

### Usage Tracking
- **Links**: Configurable limit (default 999), can be used multiple times until limit reached
- **Articles**: Fixed limit of 1, single-use only
- **Deletion protection**: Used articles (usage_count >= 1) cannot be deleted
- **Visual indicators**: Progress bars with color coding (green < 70%, yellow < 90%, red >= 90%, gray = exhausted)

### Article Duplication
Articles can be duplicated to reuse content with a new usage count:
```javascript
// Creates new article with same title/content but fresh usage_count=0
POST /api/projects/:id/articles/:articleId/duplicate
```

### Allow Duplicate Anchor Texts (Updated January 2025)

**BREAKING CHANGE**: The UNIQUE constraint on `project_links.anchor_text` has been REMOVED.

**Previous Behavior** (Before January 2025):
- Each anchor text could only be used ONCE per project
- Attempting to create duplicate anchor caused database error
- `UNIQUE (project_id, anchor_text)` constraint enforced uniqueness

**Current Behavior** (January 2025+):
- Same anchor text can be used MULTIPLE times in same project
- No uniqueness validation on anchor text
- Allows flexibility for common anchors (e.g., "click here", "read more")

**Migration Required**:
```bash
node database/run_remove_anchor_constraint.js
```

**SQL executed**:
```sql
ALTER TABLE project_links
  DROP CONSTRAINT IF EXISTS project_links_project_id_anchor_text_key;
```

**Impact on Existing Code**:
- ✅ No API changes required - endpoints work identically
- ✅ Frontend forms work without modification
- ✅ Validation logic removed from `project.service.js`
- ⚠️ Old error handling for "duplicate anchor" no longer needed

**Use Cases Enabled**:
1. Multiple links with same anchor to different URLs
2. A/B testing same anchor with different destinations
3. Common anchors like "Learn More", "Buy Now" across multiple links
4. Seasonal campaigns reusing same anchor text

**Example** (now allowed):
```javascript
// Link 1
POST /api/projects/123/links
{ "anchor_text": "Buy Now", "url": "https://shop1.com" }

// Link 2 - SAME anchor, different URL
POST /api/projects/123/links
{ "anchor_text": "Buy Now", "url": "https://shop2.com" }

// Both succeed - no duplicate error
```

**Database Schema Before/After**:
```sql
-- BEFORE (constraint exists)
CREATE TABLE project_links (
  ...
  UNIQUE (project_id, anchor_text)  -- This prevented duplicates
);

-- AFTER (constraint removed)
CREATE TABLE project_links (
  ...
  -- No anchor_text uniqueness constraint
  -- Only PRIMARY KEY on id remains
);
```

### WordPress Plugin Integration (v2.4.5)
**Current Version**: 2.4.5 (January 2025)

- Plugin generates API token (not username/password)
- Token must be added to site record via `api_key` field
- **Plugin structure**:
  - `wordpress-plugin/link-manager-widget.php` - Main plugin file (v2.4.5)
  - `wordpress-plugin/assets/styles.css` - Frontend styles for links and articles
  - `wordpress-plugin/CHANGELOG.md` - Version history
- **Download**: Available as ZIP at `backend/build/link-manager-widget.zip`
- **Security**: CSRF-protected settings form with WordPress nonce verification
- **Repository**: https://github.com/maxximseo/link-manager (unified repo, no separate plugin repo)

**Version History**:
- **v2.4.5** (Jan 2025): Extended fields support (image_url, link_attributes, wrapper_config, custom_data), multiple templates
- **v2.4.4** (Jan 2025): Display available content statistics in admin
- **v2.4.3** (Dec 2024): Remove "Number of links" field from widget
- **v2.4.2** (Dec 2024): Fix browser autofill issue in registration form
- **v2.4.1** (Dec 2024): Improve registration form UX
- **v2.4.0** (Nov 2025): Bulk registration support with tokens
- **v2.2.2** (Oct 2024): Initial stable release

**Features in v2.4.5**:
- Template system: default, with_image, card, custom
- JSONB extended fields rendering
- Dynamic link attribute injection
- Wrapper element configuration
- Custom HTML support with XSS protection
- Shortcode parameters: template, limit, home_only

**API Response Format:**
WordPress service `publishArticle()` returns:
```javascript
{
  success: true,
  post_id: 123,  // CRITICAL: Use post_id not wordpress_id
  url: 'https://...'
}
```
This `post_id` is saved to `placements.wordpress_post_id` column.

### WordPress Plugin Development
When updating the plugin:
1. Edit `wordpress-plugin/link-manager-widget.php`
2. Update version in both header comment and `LMW_VERSION` constant
3. Add/edit styles in `wordpress-plugin/assets/styles.css`
4. Copy to build: `cp -r wordpress-plugin/* backend/build/wordpress-plugin/`
5. Create ZIP: `cd /path/to/project && zip -r backend/build/link-manager-widget.zip wordpress-plugin/ -x "*.DS_Store"`
6. Test plugin on WordPress site before committing

**Security requirements**:
- All forms must use `wp_nonce_field()` and `wp_verify_nonce()`
- Sanitize all user inputs: `sanitize_text_field()`, `esc_url_raw()`, `esc_attr()`
- Escape all outputs: `esc_html()`, `esc_url()`, `wp_kses_post()`

### Static PHP Sites Integration

**Two site types supported:**
1. **wordpress** - Full-featured WordPress sites with article support
2. **static_php** - Static HTML/PHP sites (links only, no articles)

**API Key Authentication:**
Both site types now use API key authentication (domain-based is legacy):
- API key is auto-generated if not provided: `api_${crypto.randomBytes(12).toString('hex')}`
- Static sites use same `/api/wordpress/get-content?api_key=XXX` endpoint as WordPress

**Widget Files (static-widget/):**
- `link-manager-widget.php` - **PRIMARY**: API key-based widget (recommended)
- `static-code.php` - **LEGACY**: Domain-based widget (backward compatibility only)

**Primary Widget Installation:**
```php
// 1. Copy your API key from site settings in dashboard
// 2. Edit link-manager-widget.php, line 15:
define('LM_API_KEY', 'your_api_key_here');

// 3. Upload to server and include in your HTML/PHP:
<?php include 'link-manager-widget.php'; ?>
```

**Widget Features:**
- 5-minute file-based caching
- XSS protection (URL and HTML escaping)
- SSL compatibility (verify_peer=false for older PHP)
- Silent failure (no error display to users)

**Site Type Constraints:**
- `static_php`: max_articles forced to 0 (links only)
- `wordpress`: supports both links and articles
- API key required for both types

**Content Retrieval Endpoints:**
- **Recommended**: `/api/wordpress/get-content?api_key=XXX` (works for both types)
- **Legacy**: `/api/static/get-content-by-domain?domain=example.com` (backward compatibility)

### Automatic Article Publication
When a placement is created with articles, they are **automatically published** to WordPress:
- `placement.service.js` imports `wordpressService.publishArticle()`
- After placement creation, each article is published synchronously
- On success: `placement.status = 'placed'`, `wordpress_post_id` is stored
- On failure: `placement.status = 'failed'`, error is logged
- Publication happens in `createPlacement()` function after site quota updates

### Placements UI Logic
The placements creation interface (`placements.html`) uses a streamlined 3-step flow:

**Step 1 - Project Selection**: Auto-selects first project on page load

**Step 2 - Content Type Selection**: Radio buttons for Links OR Articles (auto-selects Links)

**Step 3 - Site Selection with Round-Robin Assignment**:
- Sites table shows color-coded availability:
  - 🟢 **Green (table-success)**: Site available - no placements for this project yet
  - 🔴 **Red (table-danger)**: Already purchased - site has link OR article for this project (cannot buy again)
- When user checks a site, dropdown appears with available content
- **Auto-assignment**: First available content is auto-selected using round-robin
- **Round-robin cycling**: Each subsequent site gets next content item (cycles back to start if needed)
- **Usage counters**: Dropdown shows `(0/1)` for articles, `(0/999)` for links
- User can manually change auto-selected content via dropdown
- `nextContentIndex` variable tracks round-robin position, resets on project/type change

**Placement Restrictions** (enforced in `placement.service.js`):
- **NEW LOGIC**: Only ONE placement (link OR article) allowed per site per project
- If site already has ANY placement for the project, it's marked red and disabled
- Cannot purchase the same site twice for the same project
- Site quota limits checked: `used_links < max_links`, `used_articles < max_articles`

## File Locations Reference

### Backend Core
- Entry point: `backend/server-new.js`
- Express app: `backend/app.js`
- Database config: `backend/config/database.js`
- Logger: `backend/config/logger.js` (Winston)

### Key Controllers
- Auth: `backend/controllers/auth.controller.js`
- Projects: `backend/controllers/project.controller.js`
- Sites: `backend/controllers/site.controller.js`

### Key Services
- Project: `backend/services/project.service.js`
- Site: `backend/services/site.service.js`
- Placement: `backend/services/placement.service.js`
- WordPress: `backend/services/wordpress.service.js`
- Auth: `backend/services/auth.service.js`
- Cache: `backend/services/cache.service.js` (Redis wrapper with graceful degradation)

### Frontend Pages
- Dashboard (merged with projects list): `backend/build/dashboard.html` - Title: "Мои Проекты"
- Project detail (links/articles management): `backend/build/project-detail.html`
- Sites: `backend/build/sites.html`
- Placements (purchase): `backend/build/placements.html`
- Placements manager (view/manage): `backend/build/placements-manager.html`
- Balance: `backend/build/balance.html`

**Note**: `projects.html` was merged into `dashboard.html` (January 2025). Navigation menu shows "Мои Проекты" → dashboard.html.

### Database
- Schema: `database/init.sql`
- Seed data: `database/seed.sql`
- Migrations:
  - `database/migrate_usage_limits.sql` - Usage tracking system
  - `database/migrate_add_wordpress_post_id.sql` - Add status and wordpress_post_id to placements
  - `database/migrate_add_user_id_to_placements.sql` - Add user_id column to placements (REQUIRED for billing system)
  - `database/migrate_add_billing_system.sql` - Full billing system with transactions, discounts, renewals
- Migration runners:
  - `database/run_migration.js` - General purpose migration runner
  - `database/run_user_id_migration.js` - Adds user_id to placements table
  - `database/run_billing_migration.js` - Installs full billing system
- See `database/MIGRATION_INSTRUCTIONS.md` for detailed migration instructions

## Performance & Caching System

### Redis Cache (cache.service.js)
**Status**: Active with 10-19x performance improvement

Cached endpoints with TTL:
- **WordPress API** (`/api/wordpress/get-content/:api_key`): 5 minutes
  - Cache key: `wp:content:{api_key}`
  - 152ms → 8ms (19x faster)
- **Placements API** (`/api/placements`): 2 minutes
  - Cache key: `placements:user:{userId}:p{page}:l{limit}`
  - 173ms → 9ms (19x faster)

**Cache Invalidation**: Automatic on placement create/delete
- Clears: `placements:user:*`, `projects:user:*`, `wp:content:*`

### Bull Queue Workers
**Status**: 3 workers active (placement, wordpress, batch)

Queue processing pattern:
```javascript
const queueService = require('../config/queue');
const queue = queueService.createQueue('placement');

// Add job
await queue.add('batch-placement', {
  userId,
  project_id,
  site_ids: [1, 2, 3],
  link_ids: [10],
  article_ids: [5]
});

// Worker processes in background (workers/placement.worker.js)
```

**Workers Location**: `backend/workers/`
- `placement.worker.js` - Batch placement processing
- `wordpress.worker.js` - Article publishing
- `batch.worker.js` - Export operations

**Queue Management**:
```bash
# Check Redis queues
redis-cli keys 'bull:*'

# Monitor queue status
curl http://localhost:3003/api/queue/status
```

### Database Performance Indexes
**15 active indexes** for optimal JOIN performance:
- `placement_content(link_id, article_id)` - WordPress API queries
- `placements(site_id, project_id, status)` - Dashboard queries
- `sites(api_key, created_at)` - Plugin authentication
- **Result**: 0 slow queries (was 4 queries >1000ms)

**Critical**: Always use indexed columns in WHERE clauses:
```sql
-- Good (uses index)
WHERE s.api_key = $1

-- Bad (table scan)
WHERE s.site_name LIKE '%keyword%'
```

## Environment Variables

Required:
- `DATABASE_URL` - Full PostgreSQL connection string
- `JWT_SECRET` - Min 32 characters
- `NODE_ENV` - development/production
- `PORT` - Server port (default 3003)

Redis Configuration (optional, graceful degradation):
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_DB` - Redis database number (default: 0)
- `REDIS_PASSWORD` - Redis password (if required)
- `REDIS_USER` - Redis username (DigitalOcean uses 'default')

Security Configuration (recommended for production):
- `CORS_ORIGINS` - Comma-separated list of allowed origins (e.g., `https://yourdomain.com,https://api.yourdomain.com`)
  - If not set, defaults to `*` (all origins allowed)
  - Recommended to set in production for security

Optional:
- `BCRYPT_ROUNDS` - 8 for dev, 10 for prod

## Pagination Limits (Updated January 2025)

**CRITICAL**: System-wide pagination limits increased to support high-volume operations (5000+ placements).

### Configuration Files

**backend/config/constants.js**:
```javascript
PAGINATION: {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,      // Default for API responses (keeps light load)
  MAX_LIMIT: 5000         // Maximum allowed limit (increased from 100)
}
```

**backend/utils/validators.js**:
- `validatePagination()` default `maxLimit`: 5000 (was 100)
- All controllers use this validator for consistent limits

### Controller Limits

All controllers updated to support `maxLimit: 5000`:
- `backend/controllers/placement.controller.js` - Line 16
- `backend/controllers/project.controller.js` - Line 16
- `backend/controllers/site.controller.js` - Line 15

**Batch Operation Limits** (placement.controller.js):
- `MAX_SITES_PER_BATCH: 1000` (was 100)
- `MAX_LINKS_PER_BATCH: 5000` (was 500)
- `MAX_ARTICLES_PER_BATCH: 1000` (was 100)

### Service Safety Limits

**backend/services/placement.service.js**:
- `DEFAULT_MAX_RESULTS: 10000` - Prevents unbounded queries (was 1000)
- Applied when no pagination parameters provided

### Frontend API Calls

**CRITICAL**: Frontend must explicitly request high limits to fetch all data:

```javascript
// backend/build/dashboard.html (line 154)
PlacementsAPI.getAll({ limit: 5000 })

// backend/build/js/placements-manager.js (line 96, 428)
fetch('/api/placements?status=placed&limit=5000')
fetch('/api/placements?limit=5000')  // For updateTabCounts()
```

**Common Bug**: Forgetting `limit` parameter causes default limit of 20, resulting in incomplete data display.

### Frontend Functions Requiring Explicit Limits

1. **updateTabCounts()** - Must include `?limit=5000` to count all placements
2. **loadActivePlacements()** - Must include `?limit=5000` to display all
3. **Dashboard stats** - Must include `{ limit: 5000 }` in API call

**Example of Missing Limit Bug**:
```javascript
// WRONG - gets only 20 records
fetch('/api/placements')

// CORRECT - gets up to 5000 records
fetch('/api/placements?limit=5000')
```

### Debugging Pagination Issues

**Symptom**: Frontend displays 20 items then resets or shows wrong count

**Root Cause**: API call missing `limit` parameter, receiving default 20 records

**Fix**: Add `?limit=5000` or `{ limit: 5000 }` to all frontend API calls that need full data

**Check console logs**:
```javascript
console.log('API response:', result);
console.log('Array length:', placements.length);
// If shows 20 when expecting more, check if limit param was sent
```

## Recent Critical Fixes (2025-01)

### Transaction Implementation
All multi-step database operations now use transactions:
- **createPlacement**: Wrapped in BEGIN/COMMIT/ROLLBACK (15+ operations)
- **deletePlacement**: Uses SELECT FOR UPDATE to prevent race conditions
- All operations atomic - either all succeed or all rollback

### Type Safety Improvements
- Fixed parseInt() usage for PostgreSQL COUNT() results
- COUNT() returns string "0" not number 0 - always use parseInt()
- Consistent type handling across placement.service.js

### Redis Performance
- Replaced `redis.keys()` with `redis.scan()` cursor-based iteration
- Prevents blocking Redis server in production
- Implemented in cache.service.js:delPattern()

### Schema Corrections
- Added `status` and `wordpress_post_id` columns to placements table
- Removed non-existent `status`/`notes` from sites controller
- WordPress service now returns `post_id` (not wordpress_id)

### WordPress Article Publication Bugs (Fixed November 2025)
**Commit**: 46a11ea

**Bug 1 - wordpress.controller.js:61**: Using wrong field name
```javascript
// Before (WRONG):
if (result.success && result.wordpress_id) {
  await wordpressService.updatePlacementWithPostId(site_id, article_id, result.wordpress_id);
}

// After (FIXED):
if (result.success && result.post_id) {
  await wordpressService.updatePlacementWithPostId(site_id, article_id, result.post_id);
}
```
**Impact**: WordPress post IDs weren't being saved, leaving placements stuck in "pending" status.

**Bug 2 - billing.service.js:526**: Wrong parameter order
```javascript
// Before (WRONG):
const result = await wordpressService.publishArticle(
  placement.api_key,
  content.title,
  content.content,
  placement.site_url
);

// After (FIXED):
const result = await wordpressService.publishArticle(
  placement.site_url,
  placement.api_key,
  {
    title: content.title,
    content: content.content,
    slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }
);
```
**Impact**: Article publication would crash due to mismatched parameters.

**Bug 3 - database/init.sql:28**: Missing site_type in base schema
- Added `site_type VARCHAR(20) DEFAULT 'wordpress'` to CREATE TABLE statement
- **Impact**: Fresh database installations would fail when creating static sites

### HTML/JavaScript Synchronization Bug (Fixed November 2025)
**Commit**: beb7afb

**Root Cause**: Incomplete refactoring when removing non-existent database fields (status, notes) from sites.html.

**The Problem**:
1. Removed HTML form fields for `status` and `notes` (correct - these columns don't exist in database)
2. Forgot to remove JavaScript code that referenced these deleted fields (error - caused "Add Site" button to break)

**Files Fixed**: `backend/build/sites.html`
```javascript
// REMOVED from showCreateModal() (line 325):
document.getElementById('siteStatus').value = 'active';

// REMOVED from editSite() (lines 344-345):
document.getElementById('siteStatus').value = site.status || 'active';
document.getElementById('notes').value = site.notes || '';

// REMOVED from saveSite() (lines 370-371):
status: document.getElementById('siteStatus').value,
notes: document.getElementById('notes').value
```

**Lesson Learned**: When removing HTML form fields, ALWAYS check for JavaScript references:
1. Search for `getElementById('fieldName')` across entire file
2. Check modal initialization functions (showCreateModal, showEditModal)
3. Check form submission functions (saveSite, updateSite, etc.)
4. Verify no orphaned references to deleted fields in data objects

**Impact**: "Add Site" button was completely broken - JavaScript threw errors when trying to access non-existent DOM elements, halting all execution.

### Migration Required
If upgrading existing database, run migrations in this order:

```bash
# 1. Add user_id to placements (REQUIRED for billing system)
node database/run_user_id_migration.js

# 2. Add WordPress post_id and status columns
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/migrate_add_wordpress_post_id.sql

# 3. Install full billing system (optional, if using billing features)
node database/run_billing_migration.js
```

See `database/MIGRATION_INSTRUCTIONS.md` for detailed instructions and troubleshooting.

## Git Workflow

Repository: https://github.com/maxximseo/link-manager.git
- Branch: `main`
- **Auto-commit on file changes**: Nodemon automatically commits and pushes changes when files are modified
- Auto-deploy to DigitalOcean on push
- Always commit with message ending in:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

### Automatic Git Commits

The development server (`npm run dev`) has auto-commit functionality built-in:

1. **On file changes**: Nodemon detects file modifications and triggers auto-commit
2. **Commit message format**: `Auto-commit: Development changes at YYYY-MM-DD HH:MM:SS`
3. **Auto-push**: Changes are automatically pushed to GitHub after commit
4. **Status messages**:
   - `✅ Changes committed and pushed successfully!` - Changes uploaded
   - `✨ No changes to commit` - Working tree clean

**Manual commits** (when needed):
```bash
git add -A
git commit -m "Your message here

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```

**IMPORTANT**: Auto-commit is for development convenience. For production/feature releases, use manual commits with descriptive messages.

## Common Debugging

### Type Coercion Issues
**CRITICAL**: PostgreSQL `COUNT()` returns string `"0"` not number `0`:
```javascript
// Wrong - will always fail
if (count === 0) { ... }

// Correct - convert to number first
if (parseInt(count) === 0) { ... }
```
**Always use parseInt()** for COUNT results throughout codebase. Fixed in `placement.service.js:131-132`.

### Redis Production Patterns
**NEVER use `redis.keys(pattern)` in production** - it blocks entire Redis server:
```javascript
// Wrong - blocks Redis
const keys = await redis.keys(pattern);

// Correct - use SCAN with cursor
let cursor = '0';
do {
  const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
  cursor = result[0];
  const keys = result[1];
  // Process keys
} while (cursor !== '0');
```
Implemented in `cache.service.js:delPattern()`.

### Database Schema Mismatch Errors
**Error**: `column "user_id" of relation "placements" does not exist`

**Cause**: Production database was created from an older version of init.sql that didn't include user_id in placements table.

**Solution**:
1. Run the user_id migration: `node database/run_user_id_migration.js`
2. Or manually execute: `ALTER TABLE placements ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`
3. See `database/MIGRATION_INSTRUCTIONS.md` for detailed instructions

**Prevention**: Always run all migrations when deploying to new environments. Check `database/` folder for all `migrate_*.sql` files.

### Server Won't Start
1. Check if port is in use: `lsof -ti:3003`
2. Check database connectivity via logs
3. Verify .env file exists with DATABASE_URL
4. Check Redis connection (optional): `redis-cli ping` should return `PONG`

### Redis/Queue Issues
1. **Redis not available** warning: System uses graceful degradation, caching disabled but app works
2. **Bull Queue workers not starting**: Check `redisAvailable` in logs, workers initialize after Redis test
3. **Cache not working**: Verify Redis running: `brew services start redis`
4. **Clear cache manually**: `redis-cli FLUSHDB`

### Performance Issues
1. **Slow queries** (>1000ms): Check if indexes exist in database
2. **Cache not hitting**: Check TTL expiry, verify cache keys in Redis: `redis-cli keys '*'`
3. **High memory usage**: Check Redis memory: `redis-cli info memory`

### Database Errors
1. Check connection in logs: "Successfully parsed DATABASE_URL"
2. For DigitalOcean: Ensure SSL config present (`rejectUnauthorized: false`)
3. Verify tables exist: Run `database/init.sql` if needed
4. **Slow queries**: Run `EXPLAIN ANALYZE` on problematic queries

### Frontend Not Loading
1. Static files served from `backend/build/`
2. Check browser console for 404s
3. Verify Bootstrap CDN accessible

### API Token Issues
1. Check token in localStorage: `localStorage.getItem('token')`
2. Decode JWT: https://jwt.io
3. Verify token not expired (7-day expiry)

### WordPress Plugin Integration Issues
1. **Links not showing**: Check cache in plugin (5 min TTL), verify API key in sites table
2. **API returns empty**: Verify placements exist with `placement_content` records
3. **403 errors**: Check API key matches between plugin and database
4. **Article not publishing**: Check `placements.status` - should be 'placed' not 'pending'
   - Articles auto-publish during placement creation
   - Check logs for publication errors
   - Verify WordPress site URL and API key are correct
   - Check `wordpress_post_id` column is populated

### Database Column Existence
Before updating, verify columns exist in schema:
```sql
-- Check table columns
\d sites
\d projects
\d placements
```
Common issue: Trying to update non-existent columns like `status` or `notes` in `sites` table causes UPDATE failures. Always check [database/init.sql](database/init.sql) for actual schema.

### Frontend Form Buttons Not Working
**Symptom**: "Add Site", "Save", or other form buttons do nothing when clicked.

**Common Causes**:
1. **Orphaned JavaScript references to deleted HTML fields**
   - Check browser console for errors like: `Cannot read property 'value' of null`
   - Search entire HTML file for `getElementById('deletedFieldName')`
   - Look in modal initialization functions (showCreateModal, showEditModal)
   - Look in form submission functions (saveSite, createProject, etc.)

2. **Missing form field IDs**
   - Verify all `document.getElementById()` calls match actual HTML `id=""` attributes
   - Check that modal HTML includes all fields referenced in JavaScript

3. **JavaScript syntax errors**
   - Open browser DevTools Console tab
   - Look for red error messages that stop script execution
   - Common: missing commas in object literals, unclosed parentheses

**Debugging Steps**:
```javascript
// Add console.log() at function start to verify it's called:
function saveSite() {
  console.log('saveSite called');

  // Log each field access:
  const name = document.getElementById('siteName').value;
  console.log('Site name:', name);

  // Continue debugging...
}
```

**Prevention**: When removing HTML fields, use multi-step approach:
1. Find all JavaScript references: `grep -r "getElementById('fieldName')" file.html`
2. Remove JavaScript references first
3. Then remove HTML elements
4. Test in browser before committing

## Static PHP Sites (NEW - November 2025)

Static PHP sites are a new site type that doesn't require WordPress integration.

### Key Features
- **No API key required** - Uses domain-based authentication
- **Links only** - Cannot publish articles (max_articles automatically set to 0)
- **Simple widget** - Direct HTTP endpoint, no WordPress plugin needed
- **Domain normalization** - Matches by clean domain (no protocol/www/path)

### Creating Static PHP Site
```bash
curl -X POST http://localhost:3003/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"site_url":"https://example.com","site_type":"static_php","max_links":20}'

# Response: api_key will be null, max_articles will be 0
```

### Widget Integration
Place this PHP code on static site:
```php
<?php
$domain = $_SERVER['HTTP_HOST'];
$api_url = "https://your-api.com/api/static/get-content-by-domain?domain=" . urlencode($domain);
$response = file_get_contents($api_url);
$data = json_decode($response, true);

foreach ($data['links'] as $link) {
    echo '<a href="' . htmlspecialchars($link['url']) . '">'
       . htmlspecialchars($link['anchor_text']) . '</a>';
}
?>
```

### Static Widget Endpoint
```
GET /api/static/get-content-by-domain?domain=example.com

Response:
{
  "links": [
    {"url": "https://...", "anchor_text": "Link Text"}
  ],
  "articles": []  // Always empty for static sites
}
```

### Domain Normalization
- `https://www.example.com/path` → `example.com`
- `http://example.com` → `example.com`
- Allows widget to work on any subdomain/protocol

### Critical Migration
**REQUIRED**: Make api_key nullable:
```bash
node database/run_nullable_migration.js
```

Without this migration, static site creation will fail with:
```
null value in column "api_key" violates not-null constraint
```

## Billing System API (NEW - November 2025)

Placement creation moved to billing system. Old `/api/placements` endpoint is DEPRECATED.

### New Endpoint Format
```javascript
POST /api/billing/purchase
{
  "projectId": 123,        // Single ID (not project_id)
  "siteId": 456,          // Single ID (not site_ids array)
  "type": "link",         // "link" or "article"
  "contentIds": [789],    // Array with exactly 1 ID
  "scheduledDate": "2025-01-15T10:00:00Z",  // Optional
  "autoRenewal": false    // Optional
}

Response:
{
  "success": true,
  "data": {
    "placement": {...},
    "newBalance": 95.50,
    "newDiscount": 0.05,
    "newTier": "Bronze"
  }
}
```

### Old Endpoint (DEPRECATED)
```
POST /api/placements
→ Returns 410 Gone with migration instructions
```

### Validation Rules
1. **Static PHP sites CANNOT purchase articles**
   - Returns 400 with error details
   - Check `billing.service.js:207-210`

2. **One placement per site per project**
   - Cannot purchase same site twice for same project
   - Enforced in billing.service.js

3. **Site quota limits**
   - `used_links < max_links`
   - `used_articles < max_articles`

### Error Response Format
```javascript
{
  "error": "Failed to purchase placement",
  "details": "Site \"example.com\" is a static PHP site and does not support article placements"
}
```

Use `details` field for specific error information.

## Testing

### Run Test Suite
```bash
node test-static-sites.js
```

### Test Coverage
1. ✅ Create static PHP site via API
2. ✅ Validate site_type restrictions
3. ✅ Create placement with link on static site
4. ✅ Block article placement on static site  
5. ✅ Test widget endpoint for static site
6. ✅ Update site type WordPress → Static

All 6 tests should pass when system is properly configured.

### Test Requirements
- Server running on port 3003
- Database with migrations applied (including nullable api_key)
- Admin user: username='admin', password='admin123'

## Recent Critical Updates (November 2025)

### 1. API Key Made Nullable
**Issue**: Static PHP sites don't need API keys
**Fix**: `ALTER TABLE sites ALTER COLUMN api_key DROP NOT NULL`
**Migration**: `node database/run_nullable_migration.js`

### 2. Site Types Added
**New column**: `site_type VARCHAR(20) DEFAULT 'wordpress'`
**Values**: 'wordpress' | 'static_php'
**Migration**: `node database/run_site_types_migration.js`

### 3. Billing API Refactor
**Old**: `POST /api/placements` (DEPRECATED)
**New**: `POST /api/billing/purchase`
**Breaking change**: Request format completely different

### 4. Site Type Validation
**Controller**: `backend/controllers/site.controller.js`
- Lines 56, 70-72, 109, 120-122: site_type extraction and validation
**Service**: `backend/services/site.service.js`
- Lines 92-107: Static site logic (force api_key=null, max_articles=0)

### 5. Static Widget Endpoint
**Route**: `GET /api/static/get-content-by-domain`
**Service**: `backend/services/site.service.js:getSiteByDomain()`
- Domain normalization for matching
- Returns links only (no articles)

### 6. Static Widget Output Format (Updated November 2025)
**Files**: `static-widget/static.php` and `backend/build/static.php`

**Output format changed** from wrapped HTML to clean links:
```php
// Old format (removed):
<div class="link-manager-widget">
  <ul class="link-manager-links">
    <li><a href="..." rel="nofollow">Text</a></li>
  </ul>
</div>

// New format (current):
<a href="URL" target="_blank">Anchor Text</a><br>
<a href="URL" target="_blank">Anchor Text</a><br>
```

**Key changes**:
- Removed div/ul/li wrappers for cleaner SEO
- Removed rel="nofollow" attribute
- Uses <br> as link separator
- Maintains XSS protection (lm_esc_url, lm_esc_html)

**Important**: Both widget files must stay synchronized:
- Primary: `static-widget/static.php` (users download this)
- Build: `backend/build/static.php` (served via UI download button)

## Debugging Static PHP Sites

### Error: `api_key constraint violation`
**Cause**: Database has NOT NULL on api_key
**Fix**: Run `node database/run_nullable_migration.js`

### Error: `Site type must be wordpress or static_php`
**Cause**: Invalid site_type value or missing validation
**Fix**: Only send 'wordpress' or 'static_php'

### Error: `static PHP site does not support article placements`
**Cause**: Trying to purchase article on static site
**Fix**: This is expected - use type='link' instead

### Error: `This endpoint is deprecated`  
**Cause**: Using old `/api/placements` endpoint
**Fix**: Use `/api/billing/purchase` with new format

### Widget Returns Empty
**For static sites**:
1. Check domain normalization matches
2. Verify site exists with site_type='static_php'
3. Check placement_content has link records
4. Cache TTL is 5 minutes - wait or clear

**For WordPress sites**:
1. Check api_key exists in sites table
2. Verify placements have placement_content records
3. Check WordPress plugin is active

## Migration Order (Critical)

Run migrations in this exact order for new environments:

```bash
# 1. Core schema
psql -d linkmanager -f database/init.sql

# 2. Add user_id to placements (REQUIRED)
node database/run_user_id_migration.js

# 3. Add site_type column
node database/run_site_types_migration.js

# 4. Make api_key nullable (REQUIRED for static sites)
node database/run_nullable_migration.js

# 5. Add WordPress post_id and status
psql -d linkmanager -f database/migrate_add_wordpress_post_id.sql

# 6. Install billing system (optional)
node database/run_billing_migration.js

# 7. Add registration tokens table (optional, for bulk registration)
node database/run_registration_tokens_migration.js

# 8. Remove anchor_text uniqueness constraint (REQUIRED for v2.5.0+)
node database/run_remove_anchor_constraint.js

# 9. Add extended fields to project_links (REQUIRED for v2.5.0+)
node database/run_extended_fields_migration.js

# 10. Seed data
psql -d linkmanager -f database/seed.sql
```

**DO NOT SKIP** migrations #2, #3, #4, #8, or #9 - system will not work without them.

**Optional migrations**: #6 (billing), #7 (bulk registration)

**New in v2.5.0**: Migrations #8 and #9 add support for duplicate anchor texts and extended JSONB fields.

## Bulk WordPress Site Registration (NEW - November 2025)

System for mass-registering WordPress sites using registration tokens instead of manual one-by-one entry.

### Architecture

**Flow**:
1. Admin generates registration token in dashboard (Sites page)
2. Token distributed to multiple WordPress installations via plugin
3. WordPress sites self-register using token
4. Sites automatically added to system with unique API keys

### Database Schema

**Table**: `registration_tokens` (created via `database/migrate_add_registration_tokens.sql`)
```sql
CREATE TABLE registration_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(128) UNIQUE NOT NULL,  -- Format: 'reg_' + 64 hex chars
    label VARCHAR(255),                   -- Human-readable label
    max_uses INTEGER DEFAULT 0,           -- 0 = unlimited
    current_uses INTEGER DEFAULT 0,       -- Increments on each use
    expires_at TIMESTAMP,                 -- Optional expiry date
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**CRITICAL**: Token column must be VARCHAR(128) or larger to accommodate `'reg_' + crypto.randomBytes(32).toString('hex')` (68 characters total).

### Backend Implementation

**Service Methods** (`backend/services/site.service.js`):
- `generateRegistrationToken(userId, options)` - Creates secure token
- `validateRegistrationToken(token)` - Validates token (expiry, usage limits)
- `incrementTokenUsage(token)` - Increments usage counter
- `getSiteByUrlForUser(siteUrl, userId)` - Checks for duplicates
- `getUserTokens(userId)` - Retrieves all user tokens

**Controller Endpoints** (`backend/controllers/site.controller.js`):
- `POST /api/sites/generate-token` - Generate new token (requires auth)
- `POST /api/sites/register-from-wordpress` - Self-registration (NO auth, token IS the auth)
- `GET /api/sites/tokens` - List all user tokens (requires auth)

**Routes** (`backend/routes/site.routes.js`):
```javascript
// NO auth - token-based registration (BEFORE auth middleware)
router.post('/register-from-wordpress', registerLimiter, siteController.registerFromWordPress);

// Apply auth middleware
router.use(authMiddleware);

// Auth required routes
router.post('/generate-token', generalLimiter, siteController.generateToken);
router.get('/tokens', generalLimiter, siteController.getTokens);
```

**Rate Limiting**:
- Token generation: 100 requests/minute
- WordPress registration: 5 requests/minute (prevent abuse)

### Frontend Implementation

**UI Location**: `backend/build/sites.html` (bottom of page, after sites list)

**Token Generation Form**:
- Label input (e.g., "January 2025")
- Max uses (0 = unlimited)
- Expiry days (default 30)
- Generate button → displays token with copy button

**JavaScript Functions**:
```javascript
generateRegistrationToken()  // Calls POST /api/sites/generate-token
copyToken()                   // Copies token to clipboard
hideToken()                   // Hides token display, resets form
```

### WordPress Plugin Integration

**Plugin Version**: 2.4.0 (updated in `wordpress-plugin/link-manager-widget.php`)

**Registration Form** (auto-shows when no API key exists):
```php
// In admin settings page
if (empty($api_key)):
  // Show registration form with token input
  <input name="registration_token" placeholder="reg_..." required />
  <button name="register_site">Register This Site</button>
endif;
```

**Registration Method** (`register_site_with_token()`):
```php
private function register_site_with_token($registration_token) {
  // Auto-generate API key
  $api_key = 'api_' . substr(md5(site_url() . time()), 0, 24);

  // Call backend endpoint
  wp_remote_post($this->api_endpoint . '/sites/register-from-wordpress', [
    'body' => json_encode([
      'registration_token' => $registration_token,
      'site_url' => site_url(),
      'api_key' => $api_key
    ])
  ]);

  // Save API key on success
  update_option('lmw_api_key', $api_key);
}
```

### Security Features

1. **Token Format**: `reg_` prefix + 64 random hex characters (128 total length)
2. **Token Validation**: Checks expiry date and usage limits before registration
3. **Rate Limiting**: Maximum 5 WordPress registrations per minute
4. **CSRF Protection**: WordPress nonce verification on registration form
5. **Duplicate Prevention**: Checks for existing site_url before registration
6. **API Key Generation**: Secure random generation using MD5 hash

### Migration Required

**Run migration** before using this feature:
```bash
node database/run_registration_tokens_migration.js
```

**Migration creates**:
- `registration_tokens` table
- Indexes on `token` and `user_id` columns
- Proper foreign key constraints

**CRITICAL FIX**: If you get "value too long for type character varying(64)" error:
```sql
ALTER TABLE registration_tokens ALTER COLUMN token TYPE VARCHAR(128);
```

### Common Issues

**Error: "Failed to generate registration token"**
- Check server logs for actual database error
- Most common: token column too small (must be VARCHAR(128))
- Solution: Run `ALTER TABLE registration_tokens ALTER COLUMN token TYPE VARCHAR(128);`

**Error: "Invalid, expired, or exhausted registration token"**
- Token has expired (check `expires_at`)
- Token has reached max usage limit (check `current_uses` vs `max_uses`)
- Token doesn't exist in database

**Error: "Site already registered"**
- Duplicate `site_url` for the same user
- Returns 409 Conflict with existing site_id

### Usage Example

**Admin Workflow**:
1. Go to Sites page → scroll to bottom
2. Enter label: "Batch January 2025"
3. Set max uses: 10 (or 0 for unlimited)
4. Set expiry: 30 days
5. Click "Создать" (Create)
6. Copy generated token (starts with `reg_`)

**WordPress Site Owner Workflow**:
1. Install Link Manager Widget Pro plugin
2. Go to Settings → Link Manager Widget
3. See registration form (if no API key)
4. Paste token from admin
5. Click "Register This Site"
6. API key auto-saved, site registered

### Plugin Update Process

When adding features to bulk registration:
1. Edit `wordpress-plugin/link-manager-widget.php`
2. Update version in header comment AND `LMW_VERSION` constant
3. Update `wordpress-plugin/CHANGELOG.md`
4. Copy to build: `cp -r wordpress-plugin/* backend/build/wordpress-plugin/`
5. Create ZIP: `zip -r backend/build/link-manager-widget.zip wordpress-plugin/ -x "*.DS_Store"`
6. Test on WordPress site before deployment

## Extended Fields System (v2.5.0+)

**Status**: Active since January 2025

The Extended Fields System allows passing ANY custom data to WordPress sites without modifying plugin code.

### New JSONB Columns in project_links Table

Added via `database/migrate_extended_fields.sql`:

1. **image_url** (JSONB) - URL for link images
2. **link_attributes** (JSONB) - Custom HTML attributes (class, style, rel, target, data-*)
3. **wrapper_config** (JSONB) - Wrapper element configuration (tag, class, style)
4. **custom_data** (JSONB) - Any additional custom data

### Migration

```bash
node database/run_extended_fields_migration.js
```

**SQL Schema**:
```sql
ALTER TABLE project_links
  ADD COLUMN IF NOT EXISTS image_url JSONB,
  ADD COLUMN IF NOT EXISTS link_attributes JSONB,
  ADD COLUMN IF NOT EXISTS wrapper_config JSONB,
  ADD COLUMN IF NOT EXISTS custom_data JSONB;
```

### API Usage

**Creating link with extended fields**:
```javascript
POST /api/projects/:id/links
{
  "anchor_text": "Download Game",
  "url": "https://example.com",
  "image_url": "https://example.com/icon.png",
  "link_attributes": {
    "class": "btn btn-primary",
    "style": "color: red; font-weight: bold;",
    "rel": "nofollow",
    "target": "_blank"
  },
  "wrapper_config": {
    "wrapper_tag": "div",
    "wrapper_class": "special-offer highlighted",
    "wrapper_style": "border: 2px solid gold; padding: 15px;"
  },
  "custom_data": {
    "description": "Best service for your business",
    "category": "premium"
  }
}
```

### WordPress Plugin Templates

WordPress plugin (v2.4.5+) supports multiple display templates via shortcode:

**Default Template** (existing behavior):
```
[lm_links]
```
Outputs: `html_context` or simple anchor

**With Image Template**:
```
[lm_links template="with_image"]
```
Outputs:
```html
<div class="lmw-link-with-image">
  <img src="IMAGE_URL" alt="ANCHOR" class="lmw-link-image" />
  <a href="URL">ANCHOR</a>
</div>
```

**Card Template**:
```
[lm_links template="card"]
```
Outputs:
```html
<div class="lmw-link-card">
  <div class="lmw-card-image"><img src="IMAGE_URL" /></div>
  <div class="lmw-card-content">
    <h4 class="lmw-card-title"><a href="URL">ANCHOR</a></h4>
    <p class="lmw-card-description">CUSTOM_DATA.description</p>
  </div>
</div>
```

**Custom Template**:
```
[lm_links template="custom"]
```
Outputs: Raw HTML from `custom_data.html` field (XSS-protected via `wp_kses_post()`)

**Additional Shortcode Parameters**:
```
[lm_links template="card" limit="3" home_only="false"]
```
- `template`: default|with_image|card|custom
- `limit`: Maximum links to display (default: all)
- `home_only`: true|false (default: true, only show on homepage)

### Link Attributes Rendering

When `link_attributes` is provided, plugin automatically applies to `<a>` tag:

**Example**:
```json
{
  "link_attributes": {
    "class": "btn btn-primary custom-link",
    "style": "color: blue;",
    "data-category": "featured"
  }
}
```

**Renders as**:
```html
<a href="URL" class="btn btn-primary custom-link" style="color: blue;" data-category="featured">Text</a>
```

### Wrapper Configuration

When `wrapper_config` is provided, link is wrapped in custom element:

**Example**:
```json
{
  "wrapper_config": {
    "wrapper_tag": "div",
    "wrapper_class": "featured-box premium",
    "wrapper_style": "background: #f0f0f0; padding: 20px;"
  }
}
```

**Renders as**:
```html
<div class="featured-box premium" style="background: #f0f0f0; padding: 20px;">
  <a href="URL">Text</a>
</div>
```

### Frontend CSS Styling

Add to WordPress theme's `style.css`:

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
  border-radius: 5px;
}

/* Card template */
.lmw-link-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  margin: 15px 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
  font-size: 18px;
}

.lmw-card-description {
  color: #666;
  font-size: 14px;
}
```

### Backward Compatibility

**CRITICAL**: All extended fields are OPTIONAL. Existing links without these fields continue to work with default template.

- Links without `image_url`: Image not displayed
- Links without `link_attributes`: Uses default `<a>` tag styling
- Links without `wrapper_config`: No wrapper element
- Links without `custom_data`: Template-specific fallbacks used

### Security

**XSS Protection**:
- `image_url`: Validated as URL, escaped via `esc_url()`
- `link_attributes`: Keys whitelisted, values escaped via `esc_attr()`
- `wrapper_config`: Tag whitelisted (div, span, section), attributes escaped
- `custom_data.html`: Sanitized via `wp_kses_post()` (allows safe HTML only)

**Allowed HTML tags in custom HTML**:
- Text: `<p>`, `<span>`, `<div>`, `<h1>`-`<h6>`
- Links: `<a>` (with href, class, style, target attributes)
- Formatting: `<strong>`, `<em>`, `<br>`, `<ul>`, `<ol>`, `<li>`
- NOT allowed: `<script>`, `<iframe>`, `<object>`, event handlers (onclick, etc.)

---

## 📐 Architecture Decision Records (ADR)

**See [ADR.md](ADR.md) for comprehensive documentation of all architectural decisions.**

### Quick Reference of Active ADRs

The following major architectural decisions govern this codebase:

1. **[ADR-001: No ORM - Direct SQL Queries](ADR.md#adr-001-no-orm---direct-sql-queries)**
   - Use parameterized SQL queries via `pg` driver, no ORM layer
   - Performance-first approach with full SQL control

2. **[ADR-002: JWT Authentication Without Database Lookups](ADR.md#adr-002-jwt-authentication-without-database-lookups)**
   - All user info embedded in JWT payload
   - 0ms auth overhead (no database queries in middleware)

3. **[ADR-003: Redis Cache with Graceful Degradation](ADR.md#adr-003-redis-cache-with-graceful-degradation)**
   - Optional Redis caching with automatic fallback
   - 10-19x performance boost when available

4. **[ADR-004: Transaction-Wrapped Multi-Step Operations](ADR.md#adr-004-transaction-wrapped-multi-step-operations)**
   - All multi-table operations wrapped in PostgreSQL transactions
   - Row-level locking to prevent race conditions

5. **[ADR-005: Modular Frontend (Vanilla JS)](ADR.md#adr-005-modular-frontend-vanilla-js)**
   - No framework overhead (React/Vue/Angular)
   - Modular architecture with centralized API client

6. **[ADR-006: 5-Tier Rate Limiting Strategy](ADR.md#adr-006-5-tier-rate-limiting-strategy)**
   - Different limits for different operation types
   - LOGIN (5/15min), API (100/min), CREATE (10/min), PLACEMENT (20/min), FINANCIAL (50/min)

7. **[ADR-007: Parameterized Queries Only](ADR.md#adr-007-parameterized-queries-only)** ⚠️ CRITICAL
   - NEVER concatenate user input into SQL
   - Complete SQL injection protection

8. **[ADR-008: Extended Fields System (JSONB)](ADR.md#adr-008-extended-fields-system-jsonb)**
   - 4 JSONB columns for unlimited extensibility
   - No schema migrations for new metadata fields

9. **[ADR-009: Remove Anchor Text Uniqueness Constraint](ADR.md#adr-009-remove-anchor-text-uniqueness-constraint)**
   - Allow duplicate anchor texts in same project
   - Enables A/B testing and common CTAs

10. **[ADR-010: Bull Queue Workers (Optional)](ADR.md#adr-010-bull-queue-workers-optional)**
    - Background processing for heavy operations
    - Graceful degradation without Redis

11. **[ADR-011: Static PHP Sites Support](ADR.md#adr-011-static-php-sites-support)**
    - Two site types: wordpress and static_php
    - Domain-based authentication for static sites

12. **[ADR-012: Billing System Architecture](ADR.md#adr-012-billing-system-architecture)**
    - Transaction-based prepaid billing
    - 5-tier discount system based on total_spent

13. **[ADR-013: Bulk Registration via Tokens](ADR.md#adr-013-bulk-registration-via-tokens)**
    - Token-based self-service site registration
    - Scales to 1000+ WordPress installations

14. **[ADR-014: COALESCE Pattern for Partial Updates](ADR.md#adr-014-coalesce-pattern-for-partial-updates)**
    - All UPDATE queries use COALESCE for partial updates
    - True REST PATCH semantics

15. **[ADR-015: Pagination Limits (5000 Max)](ADR.md#adr-015-pagination-limits-5000-max)**
    - MAX_LIMIT increased from 100 to 5000
    - Supports high-volume bulk operations

16. **[ADR-016: Winston Logging Strategy](ADR.md#adr-016-winston-logging-strategy)**
    - Structured JSON logging with daily rotation
    - Error logs: 14 days, Combined: 30 days

17. **[ADR-017: Context-Aware Validation for Site Parameters](ADR.md#adr-017-context-aware-validation-for-site-parameters)**
    - DR/DA: validation 0-100 (ratings)
    - ref_domains, rd_main, norm: validation min 0, no max limit (counts)

18. **[ADR-018: GEO Parameter System](ADR.md#adr-018-geo-parameter-system)**
    - Geographic targeting via `geo` column
    - Client-side filtering on placements page

19. **[ADR-019: Optimization Principles Documentation](ADR.md#adr-019-optimization-principles-documentation)**
    - LEVER framework for code optimization
    - Measurable targets: >50% code reduction, >70% pattern reuse

20. **[ADR-020: Admin-Only Public Site Control](ADR.md#adr-020-admin-only-public-site-control)** ⚠️ SECURITY
    - Only admin can set `is_public = true` on sites
    - API validation + UI controls to prevent non-admin access

### When to Consult ADR

**Before making these changes, read relevant ADRs**:
- ✅ Adding new database tables or columns → ADR-001, ADR-004, ADR-007
- ✅ Changing authentication logic → ADR-002
- ✅ Adding caching layer → ADR-003
- ✅ Modifying frontend architecture → ADR-005
- ✅ Adding new API endpoints → ADR-006, ADR-007
- ✅ Database schema changes → ADR-001, ADR-008, ADR-014
- ✅ Performance optimization → ADR-003, ADR-010, ADR-015
- ✅ Security improvements → ADR-007, ADR-011, ADR-020
- ✅ Site public status changes → ADR-020

**ADR Review Schedule**:
- **Last Review**: November 2025
- **Next Review**: April 2026
- **Trigger**: Major version bump, security issues, or performance problems

---

## Git Workflow

Repository: https://github.com/maxximseo/link-manager.git
- Branch: `main`
- **Auto-commit on file changes**: Nodemon automatically commits and pushes changes when files are modified
- Auto-deploy to DigitalOcean on push
- Always commit with message ending in:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

### Automatic Git Commits

The development server (`npm run dev`) has auto-commit functionality built-in:

1. **On file changes**: Nodemon detects file modifications and triggers auto-commit
2. **Commit message format**: `Auto-commit: Development changes at YYYY-MM-DD HH:MM:SS`
3. **Auto-push**: Changes are automatically pushed to GitHub after commit
4. **Status messages**:
   - `✅ Changes committed and pushed successfully!` - Changes uploaded
   - `✨ No changes to commit` - Working tree clean

**Manual commits** (when needed):
```bash
git add -A
git commit -m "Your message here

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```

**IMPORTANT**: Auto-commit is for development convenience. For production/feature releases, use manual commits with descriptive messages.
