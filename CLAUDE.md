# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordPress Link Manager - A link and content placement system for WordPress sites with SEO metrics. Single-file architecture with vanilla JavaScript frontend and Node.js/PostgreSQL backend.

**Production URL:** https://shark-app-9kv6u.ondigitalocean.app

## Essential Commands

```bash
# Local Development
cd backend && PORT=3002 node server-simple.js    # Start server locally
npm run dev                                       # With nodemon auto-restart

# Test Authentication  
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Deploy to Production
git add -A && git commit -m "message" && git push origin main
# Auto-deploys to DigitalOcean in 2-5 minutes

# WordPress Plugin Build (v2.2.2)
cd backend/build/wordpress-plugin
zip -r link-manager-widget.zip link-manager-widget.php assets/ README.md
```

## Architecture

### File Structure
```
/                              # Root (package.json MUST be here for DigitalOcean)
├── package.json              # CRITICAL: Never delete from root
├── app.yaml                  # DigitalOcean deployment config  
└── backend/
    ├── server-simple.js      # Main server (~1700 lines) - SINGLE FILE
    ├── build/
    │   └── index.html        # Complete UI (~2800 lines) - SINGLE FILE
    ├── ca-certificate.crt    # SSL certificate for PostgreSQL
    └── .env                  # Local environment variables only
```

### Database Schema (PostgreSQL - 7 tables)
- `users` - Authentication and user management
- `projects` - Main entities for organizing links/articles
- `sites` - WordPress sites with quotas (max_links, max_articles)
- `project_links` - Links associated with projects
- `project_articles` - Articles with Quill HTML content
- `placements` - Records of where content is placed
- `placement_content` - Junction table (prevents duplicate placements)

### API Design Patterns

#### Pagination (Backward Compatible)
```javascript
GET /api/projects           → [...]  // Legacy: returns array
GET /api/projects?page=1    → {data: [...], pagination: {...}}
```

#### Rate Limiting Tiers
- Login: 5 attempts/15 min
- API: 100 req/min
- Create: 10/min
- Placements: 20/min
- WordPress: 30/min

#### Query Optimization
Uses CTEs for aggregations - 70% reduction in database calls:
```sql
WITH project_stats AS (
  SELECT project_id, COUNT(*) as count FROM placements GROUP BY project_id
)
SELECT p.*, ps.count FROM projects p
LEFT JOIN project_stats ps ON p.id = ps.project_id
```

## Deployment on DigitalOcean

### Critical Requirements

1. **package.json in root** - DigitalOcean requirement, never move to backend/
2. **Environment Variables** - Must be set in DigitalOcean App Settings:
   - `DB_HOST` = db-postgresql-nyc3-90526-do-user-24010108-0.j.db.ondigitalocean.com
   - `DB_PORT` = 25060
   - `DB_NAME` = defaultdb
   - `DB_USER` = doadmin
   - `DB_PASSWORD` = [your password]
   - `NODE_ENV` = production
   - `PORT` = 3000

3. **DATABASE_URL Parsing** - Server automatically parses DATABASE_URL when provided
4. **SSL Configuration** - Production uses `{ rejectUnauthorized: false }` for DigitalOcean

### Deployment Pipeline
- **Trigger:** Push to main branch
- **Deploy Time:** 2-5 minutes
- **Auto-deploy:** Enabled via app.yaml
- **Monitoring:** https://cloud.digitalocean.com/apps

### Common Deployment Issues
1. **Missing environment variables** → Add in DigitalOcean App Settings
2. **Database connection timeout** → Check IP whitelist in database settings
3. **404 errors** → Wait for deployment to complete (check Runtime Logs)

## Code Optimization Principles (LEVER)

**L**everage existing patterns  
**E**xtend before creating  
**V**erify through reactivity  
**E**liminate duplication  
**R**educe complexity

### Rules
1. **Never create new files** - Extend server-simple.js or index.html
2. **Target >50% code reduction** when refactoring
3. **Use existing database tables** - Add columns, don't create tables
4. **Reuse existing API endpoints** - Add fields, don't create endpoints
5. **Single query over multiple** - Use JOINs and CTEs

### Anti-Patterns to Avoid
- Creating similar endpoints when one exists
- Multiple database round-trips
- New files for similar functionality
- Duplicate state management logic

## WordPress Integration

### Plugin Details (v2.2.2)
- **Location:** backend/build/wordpress-plugin/
- **API Endpoint:** `/wp-json/link-manager/v1/create-article`
- **Authentication:** API key stored in sites table
- **Cache:** 5 minutes for performance

### Common Issues
1. **Test Connection fails** → Verify API key matches database
2. **Articles not publishing** → Check plugin version is 2.2.2+
3. **Database SSL errors** → Ensure ca-certificate.crt exists

## Development Tips

### Local Testing with Production Database
1. Add your IP to DigitalOcean database trusted sources
2. Use .env file with production credentials
3. Run with `PORT=3002 node backend/server-simple.js`

### Database Connection Debugging
```javascript
// Check environment variables
console.log('Environment check:', {
  DATABASE_URL: process.env.DATABASE_URL ? 'provided' : 'missing',
  DB_HOST: process.env.DB_HOST || 'missing',
  NODE_ENV: process.env.NODE_ENV
});
```

### Frontend Development
- All UI in single index.html file
- Vanilla JavaScript (no React/Vue)
- Quill editor for rich text
- State managed via global variables

## Non-Obvious Implementation Details

### Frontend State Management
- Quill instances: `window.quillEditor_[projectId]`
- Must destroy old Quill instances before creating new
- Modal handling via event delegation

### Backend Patterns  
- Pool connections: 25 max
- Transactions use explicit ROLLBACK
- Winston logger for production (replaces console.log)
- JWT auto-generated if not provided

### Database Gotchas
- Placement uniqueness enforced via constraints
- Quota tracking auto-updated via triggers
- defaultdb is the production database name
- SSL required with ca-certificate.crt