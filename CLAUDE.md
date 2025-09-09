# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WordPress Link Manager - A link and content placement system for WordPress sites with SEO metrics. Successfully migrated from monolithic (single-file, 2113 lines) to modular architecture (32 files) with 99.7% performance improvement.

**Production:** https://shark-app-9kv6u.ondigitalocean.app

## Essential Commands

```bash
# Development
npm install                      # Install dependencies
PORT=3002 node backend/server.js # Run legacy server on port 3002
PORT=3003 node backend/server-new.js # Run new modular server on port 3003
npm run dev                      # Auto-restart on changes

# Testing
npm test                         # Run all Jest tests
npm run test:compatibility       # Test legacy vs new architecture compatibility
npm run test:placements         # Test placement functionality
npm run test:auth              # Test authentication
npm run test:wordpress         # Test WordPress integration

# Architecture Migration
npm run start:legacy           # Force legacy architecture
npm run start:new             # Start new modular architecture
npm run start:canary          # Start with 10% canary deployment
npm run migrate:test          # Test both architectures side-by-side
npm run metrics:compare       # Compare performance metrics
npm run metrics:dashboard     # Open monitoring dashboard
npm run migrate:rollback      # Emergency rollback to legacy

# Port conflicts
kill -9 $(lsof -t -i:3002)      # Kill process using port 3002

# API Testing
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
  
curl -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/placements | jq

# Deployment (CRITICAL: force add index.html before pushing)
git add -f backend/build/index.html
git commit -m "message" && git push origin main

# WordPress Plugin
cd wordpress-plugin && zip -r link-manager-widget.zip link-manager-widget.php assets/ *.md
```

## Architecture Evolution

### Current State: Modular Architecture (v2.0.0+)
Migration from monolithic to modular architecture completed successfully:

```
backend/
├── app.js                  # Express application setup
├── server-new.js           # Entry point for modular architecture (PRODUCTION)
├── server.js               # Legacy monolithic server (deprecated, kept for rollback)
├── server.legacy.js        # Backup of original server.js
├── config/
│   ├── database.js         # Database connection and initialization
│   ├── logger.js           # Winston logger configuration
│   ├── queue.js            # Redis/Valkey Queue configuration
│   └── constants.js        # Application constants
├── middleware/
│   ├── auth.js             # JWT authentication (optimized - no DB queries)
│   ├── errorHandler.js     # Global error handling
│   └── rateLimiter.js      # Rate limiting configuration
├── models/
│   ├── user.model.js       # User data model
│   ├── project.model.js    # Project data model
│   ├── site.model.js       # Site data model
│   └── placement.model.js  # Placement data model
├── services/
│   ├── auth.service.js     # Authentication business logic
│   ├── project.service.js  # Project business logic
│   ├── site.service.js     # Site business logic
│   ├── placement.service.js # Placement business logic
│   └── wordpress.service.js # WordPress integration
├── controllers/
│   ├── auth.controller.js  # Auth endpoints
│   ├── project.controller.js # Project endpoints
│   ├── site.controller.js  # Site endpoints
│   ├── placement.controller.js # Placement endpoints
│   └── wordpress.controller.js # WordPress endpoints
├── workers/
│   ├── index.js            # Worker manager
│   ├── placement.worker.js # Placement queue worker
│   ├── wordpress.worker.js # WordPress queue worker
│   └── batch.worker.js     # Batch operations worker
├── routes/
│   ├── index.js            # Route aggregator
│   ├── legacy.js           # Legacy route handler
│   ├── queue.routes.js     # Queue management endpoints
│   ├── debug.routes.js     # Debug and diagnostics endpoints
│   ├── auth.routes.js      # Auth routes
│   ├── project.routes.js   # Project routes
│   ├── site.routes.js      # Site routes
│   ├── placement.routes.js # Placement routes
│   └── wordpress.routes.js # WordPress routes
├── scripts/
│   └── rollback.sh         # Emergency rollback script
├── build/
│   └── index.html          # Complete UI (~3000 lines) - FORCE ADD to git
└── ca-certificate.crt      # SSL cert for PostgreSQL

wordpress-plugin/
└── link-manager-widget.php # WordPress integration plugin
```

### Performance Optimizations
- **Auth Middleware**: JWT data used directly without DB queries (99.7% performance improvement)
- **Redis Queue System**: Async processing for mass operations (100+ sites)
- **Bcrypt Warmup**: Reduces cold start latency
- **Database Pool Warmup**: Improves initial query performance
- **Adaptive Bcrypt Rounds**: 8 rounds in dev, 10 in production

### Emergency Rollback
```bash
# Rollback to monolithic architecture if needed
git checkout v2.0.0-modular~1 backend/
PORT=3002 node backend/server.js
```

## Redis Queue System (v2.1.0+)

### Architecture
- **Redis/Valkey Backend**: DigitalOcean managed Valkey cluster
- **Queue Workers**: 3 specialized workers (placement, wordpress, batch)
- **Graceful Degradation**: System works without Redis (legacy mode)
- **Circuit Breaker**: Auto-fallback on Redis failures

### Queue Configuration
```javascript
// Production Valkey Connection
REDIS_HOST=link-manager-valkey-do-user-24010108-0.d.db.ondigitalocean.com
REDIS_PORT=25061
REDIS_USER=default
REDIS_PASSWORD=your-valkey-password
REDIS_DB=0

// Queue Settings
maxRetriesPerRequest: 10
connectTimeout: 30000ms
commandTimeout: 15000ms
```

### Queue Types & Priorities
1. **placement** - HIGH priority (10) - Individual placement operations  
2. **wordpress** - NORMAL priority (5) - WordPress publishing
3. **batch** - LOW priority (1) - Bulk operations (10+ sites)

### Queue Endpoints
```bash
# Health check
GET /api/queue/health

# Job status
GET /api/queue/status

# Debug Redis connection  
GET /api/debug/redis-test
GET /api/debug/env-check
```

### Batch Processing Logic
- **< 10 sites**: Synchronous processing (immediate)
- **10+ sites**: Asynchronous queue processing
- **Retry Policy**: 3 attempts with exponential backoff
- **Job Limits**: 100 completed, 50 failed jobs retained

## Database Schema (7 tables)
- `users` - Authentication
- `projects` - Main entities  
- `sites` - WordPress sites with quotas (max_links, max_articles)
- `project_links` - Links per project
- `project_articles` - Articles with Quill HTML content
- `placements` - Content placement records (type: 'manual' or 'wordpress')
- `placement_content` - Junction table (avoids duplicates via unique constraints)

## API Design Patterns

### Pagination (Backward Compatible)
```javascript
// Without params: Returns array (legacy)
GET /api/projects → [...]

// With params: Returns paginated object
GET /api/projects?page=1&limit=20 → {
  data: [...],
  pagination: {page, limit, total, pages, hasNext, hasPrev}
}
```

### Rate Limiting Tiers
- Login: 5 attempts/15 min
- API: 100 req/min
- Create: 10/min
- Placements: 20/min
- WordPress: 30/min

### Query Optimization Pattern
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

### Content Placement Logic
1. **Links**: Always create placement record only (WordPress plugin fetches via API)
2. **Articles**: 
   - If site has API key → Publish to WordPress via REST API
   - If no API key → Create placement record only

### Plugin Architecture
- **API Endpoint:** `/wp-json/link-manager/v1/create-article`
- **Content Fetch:** `/api/wordpress/get-content/:api_key`
- **Display:** Via widgets or shortcodes `[lm_links]`
- **Cache:** 1 hour default

## Critical Implementation Details

### Frontend State Management (index.html)
- All state in vanilla JavaScript global variables
- Sites stored in `window.allSites` for placement modal
- Quill editor instances stored as `window.quillEditor_[projectId]`
- Multiple placements per site handled via `placement_ids[]` array
- **CRITICAL:** WordPress publishing must return early (line 2587) to prevent dual placement

### Placement Statistics
- Must SUM counts for sites with multiple placements (lines 1066-1068)
- Use `parseInt()` when summing to avoid string concatenation
- Store all `placement_ids` for bulk deletion support

### Export Functionality
- Export ALL placement URLs (not unique)
- For articles: Export full URL with slug (site_url + '/' + slug)
- For links: Export site URL where link is placed

### Backend Patterns
- Pool connections: 25 max
- Transactions with explicit ROLLBACK in catch blocks
- Winston logger replaces console.log in production
- JWT auto-generated with crypto.randomBytes(32) if not provided

### Database Gotchas
- Placement uniqueness: Can't place same content twice on same site
- Multiple placements per site allowed (different content)
- `placed_at` column (not `placement_date`)
- SSL required: Certificate in ca-certificate.crt

## Deployment Pipeline

### DigitalOcean App Platform
1. **IMPORTANT:** backend/build is gitignored - use `git add -f backend/build/index.html`
2. Push to `main` branch triggers auto-deploy
3. Deploy time: 2-5 minutes
4. Monitor: https://cloud.digitalocean.com/apps

### Production Environment Variables
Required in DigitalOcean dashboard:
- `NODE_ENV=production`
- `PORT=3000` (DO uses 3000, local uses 3002)
- `JWT_SECRET` (32+ chars)
- `DATABASE_URL` (managed by DO)
- `CORS_ORIGINS='*'`

### Canary Deployment Variables
- `USE_NEW_ARCHITECTURE=true` - Force new architecture
- `FORCE_LEGACY=true` - Force legacy (overrides all)
- `CANARY_PERCENTAGE=10` - Route 10% to new architecture
- `ENABLE_METRICS_COMPARISON=true` - Track both architectures
- `ENABLE_AUTO_ROLLBACK=true` - Auto-rollback on failures

## Code Optimization Principles (LEVER)

The LEVER Framework:
- **L**everage existing patterns
- **E**xtend before creating
- **V**erify through reactivity
- **E**liminate duplication
- **R**educe complexity

### Before Adding Features
1. **Can existing tables handle it?** Add columns, not tables
2. **Can existing endpoints handle it?** Add fields, not endpoints
3. **Can existing UI handle it?** Use conditional rendering

### Anti-Patterns to Avoid
- Creating new files when existing ones can be extended
- N+1 queries (use CTEs/JOINs)
- Multiple round-trips (batch operations)
- New tables for similar data

## Troubleshooting

### Common Error Solutions

#### "Placement created but failed to publish articles"
- **Cause:** Dual placement attempt in frontend
- **Solution:** Fixed with early return after WordPress publishing (line 2587)

#### Port 3002 already in use
```bash
lsof -i :3002                    # Find process
kill -9 $(lsof -t -i:3002)      # Kill it
PORT=3002 node backend/server.js # Restart
```

#### Redis/Valkey Connection Issues
```bash
# Test Redis connection
curl http://localhost:3003/api/debug/redis-test

# Check environment variables
curl http://localhost:3003/api/debug/env-check

# Common fixes:
# 1. Add local IP to Valkey trusted sources
# 2. Increase retries: maxRetriesPerRequest: 10
# 3. Increase timeouts: connectTimeout: 30000
```

#### Placement statistics showing wrong counts
- **Cause:** Overwriting instead of summing for multiple placements
- **Solution:** Use `+=` and `parseInt()` when aggregating (lines 1066-1068)

#### Export to TXT missing content
- **Cause:** Only exporting unique site URLs
- **Solution:** Export all placement URLs, including full article paths

## Recent Critical Updates

### Architecture Migration (Sept 2025)
- **Modular Refactoring:** Split 2113-line server.js into 32 modular files
- **Redis Queue System:** Added async processing for mass operations (100+ sites)
- **Safe Migration:** Canary deployment with metrics comparison
- **Auto-Rollback:** Health checks trigger automatic rollback on failures
- **Monitoring Dashboard:** Real-time metrics visualization
- **Compatibility Tests:** Ensure identical behavior between architectures

### Redis Queue Implementation (Sept 2025)
- **Valkey Cluster:** DigitalOcean managed Redis-compatible database
- **3 Queue Workers:** Specialized for placement, wordpress, and batch operations
- **Graceful Degradation:** System works without Redis (falls back to legacy mode)
- **Circuit Breaker:** Auto-detects Redis failures and routes to legacy processing
- **Batch Processing:** 10+ sites trigger async queue processing
- **Performance:** 99.7% improvement in auth middleware, queue processing for scale

### Sept 2025 Fixes
- **Placement Statistics:** Fixed summing for multiple placements per site
- **Export:** Changed to export ALL placement URLs including full article paths
- **WordPress Publishing:** Added early return to prevent dual placement attempts
- **Notifications:** Fixed missing success messages for link-only placements
- **Redis Configuration:** Optimized timeouts and retry policies for Valkey compatibility