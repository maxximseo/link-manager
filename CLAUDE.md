# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Frontend Architecture
Vanilla JavaScript with modular structure:
- **Static files**: `backend/build/` (HTML, CSS, JS)
- **API client**: `backend/build/js/api.js` - SitesAPI, ProjectsAPI classes
- **Auth**: `backend/build/js/auth.js` - Token management, login/logout
- **Pages**: Individual HTML files (dashboard.html, projects.html, sites.html, project-detail.html)

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

### WordPress Plugin Integration (v2.2.2)
- Plugin generates API token (not username/password)
- Token must be added to site record via `api_key` field
- **Plugin structure**:
  - `wordpress-plugin/link-manager-widget.php` - Main plugin file
  - `wordpress-plugin/assets/styles.css` - Frontend styles for links and articles
- **Download**: Available as ZIP at `backend/build/link-manager-widget.zip`
- **Security**: CSRF-protected settings form with WordPress nonce verification
- **Repository**: https://github.com/maxximseo/link-manager (unified repo, no separate plugin repo)

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
- Dashboard: `backend/build/dashboard.html`
- Projects list: `backend/build/projects.html`
- Project detail (links/articles management): `backend/build/project-detail.html`
- Sites: `backend/build/sites.html`
- Placements: `backend/build/placements.html`

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

Optional:
- `BCRYPT_ROUNDS` - 8 for dev, 10 for prod

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
- Auto-deploy to DigitalOcean on push
- Always commit with message ending in:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

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
