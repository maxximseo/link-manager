# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Server
```bash
# Development (with hot reload)
cd backend && PORT=3003 NODE_ENV=development node server-new.js

# Or with nodemon
npm run dev

# Production
npm start
```

### Database Operations
```bash
# Run migrations
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/migrate_usage_limits.sql

# Or use the migration runner
node database/run_migration.js

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

### WordPress Plugin Integration
- Plugin generates API token (not username/password)
- Token must be added to site record via `api_key` field
- Plugin file: `wordpress-plugin/link-manager-widget.php`

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
- Auth: `backend/services/auth.service.js`

### Frontend Pages
- Dashboard: `backend/build/dashboard.html`
- Projects list: `backend/build/projects.html`
- Project detail (links/articles management): `backend/build/project-detail.html`
- Sites: `backend/build/sites.html`

### Database
- Schema: `database/init.sql`
- Seed data: `database/seed.sql`
- Usage limits migration: `database/migrate_usage_limits.sql`

## Environment Variables

Required:
- `DATABASE_URL` - Full PostgreSQL connection string
- `JWT_SECRET` - Min 32 characters
- `NODE_ENV` - development/production
- `PORT` - Server port (default 3003)

Optional:
- `REDIS_URL` - For queue workers (graceful fallback if absent)
- `BCRYPT_ROUNDS` - 8 for dev, 10 for prod

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

### Server Won't Start
1. Check if port is in use: `lsof -ti:3003`
2. Check database connectivity via logs
3. Verify .env file exists with DATABASE_URL

### Database Errors
1. Check connection in logs: "Successfully parsed DATABASE_URL"
2. For DigitalOcean: Ensure SSL config present (`rejectUnauthorized: false`)
3. Verify tables exist: Run `database/init.sql` if needed

### Frontend Not Loading
1. Static files served from `backend/build/`
2. Check browser console for 404s
3. Verify Bootstrap CDN accessible

### API Token Issues
1. Check token in localStorage: `localStorage.getItem('token')`
2. Decode JWT: https://jwt.io
3. Verify token not expired (7-day expiry)
