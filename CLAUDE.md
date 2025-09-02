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
PORT=3002 node server-simple.js        # Run locally
npm run dev                             # With auto-restart

# Testing API
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# WordPress Plugin Build (current: v2.2.2)
cd backend/build/wordpress-plugin
zip -r link-manager-widget.zip link-manager-widget.php assets/ README.md INSTALL.md

# Database Connection (PostgreSQL)
# Connection details are stored in environment variables
# See .env.example for required variables
```

## Architecture

### Critical File Structure
```
backend/
├── server-simple.js         # Main server (~1700 lines)
├── build/
│   ├── index.html          # Complete UI (~2800 lines)
│   └── wordpress-plugin/   # WordPress integration
└── ca-certificate.crt      # SSL cert for PostgreSQL
```


### Database Schema (7 tables)
- `users` - Authentication
- `projects` - Main entities
- `sites` - WordPress sites with quotas (max_links, max_articles)
- `project_links` - Links per project
- `project_articles` - Articles with Quill HTML content
- `placements` - Content placement records
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

## Deployment Pipeline

### DigitalOcean App Platform
- **Trigger:** Push to `main` branch
- **Deploy Time:** 2-5 minutes
- **Config:** `.do/app.yaml`
- **Build:** `npm start` (runs server-simple.js)
- **Environment:** Set in DO dashboard, not in code

### Production Checklist
1. Test locally with `NODE_ENV=development PORT=3002 node server-simple.js`
2. Commit changed files (server-simple.js and/or index.html)
3. Push to main
4. Monitor: https://cloud.digitalocean.com/apps

## WordPress Integration

### Plugin Architecture (v2.2.2)
- **API Endpoint:** `/wp-json/link-manager/v1/create-article`
- **Verification:** Supports both `{site_url, api_key}` and `{api_key}` only
- **Category:** Uses WordPress default (removed category field)
- **Cache:** 5 minutes

### Common Issues
1. **"Test Connection" fails:** Ensure API key matches between WordPress and database
2. **Articles not publishing:** Check plugin version is 2.2.2+
3. **Empty paragraphs:** `cleanHtml()` function in index.html removes them

## Code Optimization Principles (LEVER)

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

## Non-Obvious Implementation Details

### Frontend State Management
- All state in vanilla JavaScript global variables
- Quill editor instances stored as `window.quillEditor_[projectId]`
- Must destroy old Quill instances before creating new ones
- Modal click-outside handled via event delegation

### Backend Patterns
- Pool connections: 25 max (increased from 10)
- Transactions with explicit ROLLBACK in catch blocks
- Winston logger replaces console.log (logs to files in production)
- JWT auto-generated with crypto.randomBytes(32) if not provided

### Database Gotchas
- Placement uniqueness: Can't place same content twice on same site
- Quota tracking: `used_links`/`used_articles` auto-updated via triggers
- Cyrillic slugs: Full transliteration map in server-simple.js
- SSL required: Certificate in ca-certificate.crt

### Production Environment Variables
Required in DigitalOcean (not .env file):
- `NODE_ENV=production`
- `PORT=8080`  
- `JWT_SECRET` (32+ chars)
- `DATABASE_URL` (managed by DO)

## Debugging Production

```bash
# Check deployment status
curl https://shark-app-9kv6u.ondigitalocean.app/api/health

# Test WordPress verify endpoint
curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/wordpress/verify \
  -H "Content-Type: application/json" \
  -d '{"api_key":"api_af44aafbca44"}'

# View logs (in DO dashboard)
# Apps → wp-link-manager → Runtime Logs
```