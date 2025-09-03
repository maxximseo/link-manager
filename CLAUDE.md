# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordPress Link Manager - A link and content placement system for WordPress sites with SEO metrics. Uses a single-file vanilla JavaScript frontend with Node.js/PostgreSQL backend.

**Production URL:** https://shark-app-9kv6u.ondigitalocean.app

## Essential Commands

```bash
# Development
cd backend
npm install
PORT=3002 node server.js        # Run locally
npm run dev                      # With auto-restart

# Handle port conflicts
lsof -i :3002                    # Check what's using port 3002
kill -9 $(lsof -t -i:3002)      # Kill process on port 3002

# Testing API
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Get auth token for testing
TOKEN=$(curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' -s | jq -r '.token')

# Test placement creation
curl -X GET "http://localhost:3002/api/placements" \
  -H "Authorization: Bearer $TOKEN" | jq

# WordPress Plugin Build (current: v2.2.2)
cd backend/build/wordpress-plugin
zip -r link-manager-widget.zip link-manager-widget.php assets/ README.md INSTALL.md

# Database Connection (PostgreSQL)
# Host: db-postgresql-nyc3-90526-do-user-24010108-0.j.db.ondigitalocean.com:25060
# Database: defaultdb
# User: doadmin
# Password: [REDACTED - See DigitalOcean Dashboard]
# SSL: Required (ca-certificate.crt)
```

## Architecture

### Critical File Structure
```
backend/
├── server.js               # Main server (~1900 lines) - PRIMARY
├── build/
│   ├── index.html          # Complete UI (~2900 lines)
│   └── wordpress-plugin/   # WordPress integration
└── ca-certificate.crt      # SSL cert for PostgreSQL
```

### Database Schema (7 tables)
- `users` - Authentication
- `projects` - Main entities
- `sites` - WordPress sites with quotas (max_links, max_articles)
- `project_links` - Links per project
- `project_articles` - Articles with Quill HTML content
- `placements` - Content placement records (type: 'manual' or 'wordpress')
- `placement_content` - Junction table (avoids duplicates via unique constraints)

### API Design Patterns

#### Pagination (Backward Compatible)
```javascript
// Without params: Returns array (legacy)
GET /api/projects → [...]

// With params: Returns paginated object
GET /api/projects?page=1&limit=20 → {
  data: [...],
  pagination: {page, limit, total, pages, hasNext, hasPrev}
}
```

#### Rate Limiting Tiers
- Login: 5 attempts/15 min
- API: 100 req/min  
- Create: 10/min
- Placements: 20/min
- WordPress: 30/min

#### Query Optimization Pattern
```javascript
// Use CTEs for aggregations (70% reduction in DB calls)
WITH project_stats AS (
  SELECT project_id, COUNT(*) as count
  FROM placements GROUP BY project_id
)
SELECT p.*, ps.count FROM projects p
LEFT JOIN project_stats ps ON p.id = ps.project_id
```

## WordPress Integration Flow

### Article Publishing Logic
1. **Check if site has API key** → It's a WordPress site
2. **For WordPress sites:**
   - Call `/api/wordpress/publish-article` directly
   - This publishes to WordPress AND creates placement record
   - Article can only be published once (protection via placement_content)
3. **For non-WordPress sites:**
   - Create placement record only (tracking)

### Plugin Architecture (v2.2.2)
- **API Endpoint:** `/wp-json/link-manager/v1/create-article`
- **Verification:** Supports both `{site_url, api_key}` and `{api_key}` only
- **Category:** Uses WordPress default (removed category field)
- **Cache:** 5 minutes

### Common Issues  
1. **"Test Connection" fails:** Ensure API key matches between WordPress and database
2. **Articles not publishing:** Check plugin version is 2.2.2+
3. **"Placement created but failed to publish":** Fixed - was caused by dual placement attempts (see Recent Fixes)
4. **Port already in use:** Use `kill -9 $(lsof -t -i:3002)` to free port
5. **Authentication expired:** Token expires after 24h, re-login required

## Deployment Pipeline

### DigitalOcean App Platform
- **Trigger:** Push to `main` branch
- **Deploy Time:** 2-5 minutes
- **Config:** `app.yaml`
- **Build:** `npm install` then `node backend/server.js`
- **Environment:** Set in DO dashboard, not in code

### Production Checklist
1. Test locally with `NODE_ENV=development PORT=3002 node backend/server.js`
2. Commit all changes
3. Push to main
4. Monitor: https://cloud.digitalocean.com/apps

## Code Optimization Principles (LEVER)

The LEVER Framework (from optimization-principles.md):
- **L**everage existing patterns  
- **E**xtend before creating  
- **V**erify through reactivity  
- **E**liminate duplication  
- **R**educe complexity

### Before Adding Features
1. **Can existing tables handle it?** Add columns, not tables
2. **Can existing endpoints handle it?** Add fields, not endpoints  
3. **Can existing UI handle it?** Use conditional rendering

### Success Metrics
- Code reduction vs initial approach: >50%
- New files created: 0 (modify existing)
- New database tables: 0 (extend existing)

### Anti-Patterns to Avoid
- Creating new files when existing ones can be extended
- N+1 queries (use CTEs/JOINs)
- Multiple round-trips (batch operations)
- New tables for similar data
- The "Similar But Different" excuse (extend existing instead)

## Non-Obvious Implementation Details

### Frontend State Management
- All state in vanilla JavaScript global variables
- Sites stored in `window.allSites` for placement modal
- Quill editor instances stored as `window.quillEditor_[projectId]`
- Must destroy old Quill instances before creating new ones
- Modal click-outside handled via event delegation
- **CRITICAL:** WordPress publishing must return early to prevent dual placement attempts

### Backend Patterns
- Pool connections: 25 max (increased from 10)
- Transactions with explicit ROLLBACK in catch blocks
- Winston logger replaces console.log (logs to files in production)
- JWT auto-generated with crypto.randomBytes(32) if not provided

### Database Gotchas
- Placement uniqueness: Can't place same content twice on same site
- Quota tracking: `used_links`/`used_articles` auto-updated after placement operations
- Placements table has no `user_id` column (use JOIN with projects for user check)
- `placed_at` column (not `placement_date`)
- SSL required: Certificate in ca-certificate.crt (cannot be disabled)
- Connection pool: 25 connections max (optimized from default 10)

### Production Environment Variables
Required in DigitalOcean (not .env file):
- `NODE_ENV=production`
- `PORT=3000` (DO uses 3000, local uses 3002)
- `JWT_SECRET` (32+ chars)
- `DATABASE_URL` (managed by DO)
- `CORS_ORIGINS='*'`

## Debugging Production

```bash
# Check deployment status
curl https://shark-app-9kv6u.ondigitalocean.app/api/health

# Test WordPress verify endpoint
curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/wordpress/verify \
  -H "Content-Type: application/json" \
  -d '{"api_key":"api_af44aafbca44"}'

# View logs (in DO dashboard)
# Apps → linkmanager-app → Runtime Logs
```

## Troubleshooting

### Common Error Solutions

#### "Placement created but failed to publish articles"
- **Cause:** Dual placement attempt in frontend
- **Solution:** Fixed in index.html line 2587 with early return

#### Port 3002 already in use
```bash
lsof -i :3002                    # Find process
kill -9 $(lsof -t -i:3002)      # Kill it
PORT=3002 node backend/server.js # Restart
```

#### Authentication token expired
- Tokens expire after 24 hours
- Re-login required: `curl -X POST http://localhost:3002/api/auth/login`

#### Delete placement via API
```bash
# Get token
TOKEN=$(curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' -s | jq -r '.token')

# Find placements
curl -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/placements | jq

# Delete specific placement
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/placements/ID
```

## Recent Critical Fixes

### WordPress Publishing Control Flow (2025-09-03)
- Fixed dual placement attempt bug in `createPlacement` function (index.html lines 2510-2662)
- Added early `return` after WordPress publishing success (line 2587)
- Moved modal close and refresh logic inside appropriate blocks
- Prevents "Placement created but failed to publish" error

### Placement Details Loading
- Fixed `p.user_id` → `pr.user_id` in GET /api/placements (line 1477)
- Fixed `p.placement_date` → `p.placed_at` (lines 1479, 1710)
- Fixed null reference: `getElementById('placementProjectId')` → `getElementById('placementProject')`

### WordPress Publishing Flow
- Articles with API key sites now publish directly to WordPress
- Placement record created AFTER successful WordPress publish
- Prevents "already published" errors from blocking WordPress publishing
- Must exit function after WordPress publish to avoid duplicate placement attempts