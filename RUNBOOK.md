# Runbook - Operational Procedures

This document contains step-by-step procedures for common operational tasks in the Link Manager system.

**Last Updated**: November 2025
**Maintainer**: Development Team

---

## Table of Contents

1. [Server Operations](#server-operations)
2. [Database Operations](#database-operations)
3. [Deployment Procedures](#deployment-procedures)
4. [Troubleshooting](#troubleshooting)
5. [Backup & Recovery](#backup--recovery)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Security Incidents](#security-incidents)

---

## Server Operations

### Start Development Server

```bash
# Option 1: With auto-reload (recommended)
npm run dev

# Option 2: With auto-kill port
npm run dev:auto

# Option 3: Manual start
cd backend && PORT=3003 NODE_ENV=development node server-new.js
```

**Expected Output**:
```
🚀 New architecture server running on port 3003
📊 Environment: development
🔧 Architecture: Modular with Redis Queue support
```

**Verification**:
```bash
curl http://localhost:3003/health
# Should return: {"status":"ok","timestamp":"...","architecture":"modular","queue":true}
```

---

### Stop Server

```bash
# Option 1: Graceful shutdown (Ctrl+C in terminal)
# Waits 30 seconds for connections to close

# Option 2: Kill process on port
lsof -ti:3003 | xargs kill -9
lsof -ti:3005 | xargs kill -9  # If using legacy server
```

**Verification**:
```bash
lsof -ti:3003
# Should return nothing if server stopped
```

---

### Restart Production Server

```bash
# 1. Check current status
pm2 list

# 2. Restart with zero downtime
pm2 reload link-manager

# 3. Check logs
pm2 logs link-manager --lines 50

# 4. Monitor status
pm2 monit
```

**Rollback if issues**:
```bash
git log --oneline -5  # Find last good commit
git reset --hard <commit-hash>
pm2 reload link-manager
```

---

## Database Operations

### Run All Migrations (New Environment)

```bash
# 1. Core schema
psql -d linkmanager -f database/init.sql

# 2. Required migrations
node database/run_user_id_migration.js
node database/run_site_types_migration.js
node database/run_nullable_migration.js
node database/run_remove_anchor_unique.js
node database/run_extended_fields_migration.js

# 3. Site parameters migrations
node database/run_da_migration.js
node database/run_ref_domains_migration.js
node database/run_tf_cf_keywords_traffic_migration.js
node database/run_geo_migration.js

# 4. Optional migrations
node database/run_billing_migration.js
node database/run_registration_tokens_migration.js

# 5. Seed data
psql -d linkmanager -f database/seed.sql
```

**Verification**:
```bash
psql -d linkmanager -c "\dt"  # List tables (should show 8+ tables)
psql -d linkmanager -c "SELECT COUNT(*) FROM users;"  # Should have admin user
```

---

### Check Database Connection

```bash
# From server environment
source .env
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();"

# Test connection from Node
node -e "const {pool} = require('./backend/config/database'); pool.query('SELECT NOW()').then(r => console.log(r.rows[0])).catch(console.error);"
```

**Expected**: PostgreSQL version info displayed

---

### Create Database Backup

```bash
# Manual backup
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -F c \
  -b \
  -v \
  -f "backup_$(date +%Y%m%d_%H%M%S).dump"

# Backup specific tables
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -t users -t projects -t sites -t placements \
  > "backup_critical_$(date +%Y%m%d).sql"
```

**Automated backups** (add to crontab):
```bash
0 2 * * * /path/to/backup-script.sh  # Daily at 2 AM
```

---

### Restore Database Backup

```bash
# Full restore
PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -v \
  backup_20250123_020000.dump

# Restore specific table
PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -t placements \
  backup_20250123_020000.dump
```

**⚠️ Warning**: This will overwrite existing data!

---

### Add GEO Column to Sites (v2.5.3+)

**Purpose**: Add geographic targeting to sites for country-based filtering.

```bash
# Run migration
node database/run_geo_migration.js
```

**Expected output**:
```
Starting GEO migration...
Executing migration...
✅ Migration completed successfully!
Column details: [ { column_name: 'geo', data_type: 'character varying', column_default: "'EN'::character varying" } ]
Total sites in database: 1234
Sample sites with GEO: [ { site_url: 'example.com', geo: 'EN' }, ... ]
```

**Verification**:
```bash
# Check column exists
psql -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'geo';"

# Check sample data
psql -c "SELECT site_url, geo FROM sites LIMIT 5;"
```

**Bulk update GEO values**:
Navigate to Admin → Site Params → Select "GEO" parameter → Paste data:
```
example.com PL
another-site.de DE
russian-site.ru RU
```

---

### Clear Cache (Redis)

```bash
# Option 1: Clear all cache
redis-cli FLUSHDB

# Option 2: Clear specific keys
redis-cli --scan --pattern 'wp:*' | xargs redis-cli DEL
redis-cli --scan --pattern 'placements:*' | xargs redis-cli DEL

# Option 3: Clear via API (requires admin auth)
curl -X POST http://localhost:3003/api/admin/clear-cache \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Verification**:
```bash
redis-cli DBSIZE  # Should return 0 or lower number
```

---

## Deployment Procedures

### Deploy to Production (DigitalOcean)

```bash
# 1. Run tests locally
npm test

# 2. Commit changes
git add .
git commit -m "Description of changes"

# 3. Push to main (triggers auto-deploy)
git push origin main

# 4. Monitor deployment
doctl apps list
doctl apps logs <app-id> --type=deploy --follow

# 5. Verify deployment
curl https://shark-app-9kv6u.ondigitalocean.app/health
```

**Expected**: `{"status":"ok",...}`

---

### Rollback Deployment

```bash
# 1. Find last good commit
git log --oneline -10

# 2. Revert to previous commit
git revert <bad-commit-hash>
git push origin main

# OR reset to specific commit (⚠️ destructive)
git reset --hard <good-commit-hash>
git push origin main --force
```

---

### Update Environment Variables

```bash
# DigitalOcean App Platform
doctl apps update <app-id> --env-file=.env.production

# Verify changes
doctl apps get <app-id> --format json | jq '.spec.envs'

# Restart app
doctl apps restart <app-id>
```

---

## Troubleshooting

### Server Won't Start

**Symptoms**: Server crashes immediately or port already in use

**Diagnosis**:
```bash
# Check if port is occupied
lsof -ti:3003

# Check environment variables
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL ? 'DB configured' : 'DB missing');"

# Check database connectivity
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;"
```

**Solutions**:
1. Kill process on port: `lsof -ti:3003 | xargs kill -9`
2. Verify `.env` file exists and has all required vars
3. Check database is accessible (firewall, credentials)
4. Review logs: `tail -f backend/logs/error-*.log`

---

### Database Connection Errors

**Symptoms**: `ECONNREFUSED`, `password authentication failed`

**Diagnosis**:
```bash
# Test connection
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\conninfo"

# Check SSL requirement
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SHOW ssl;"
```

**Solutions**:
1. Verify `DATABASE_URL` in `.env` is correct
2. Check DigitalOcean database firewall (allow app IP)
3. Confirm SSL config: `ssl: { rejectUnauthorized: false }`
4. Test connection pool: Increase `max: 25` if hitting limit

---

### Redis Not Available

**Symptoms**: `Redis connection failed`, cache warnings in logs

**Diagnosis**:
```bash
# Test Redis connection
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" PING
# Should return: PONG

# Check Redis from app
node -e "const Redis = require('ioredis'); const r = new Redis({host: process.env.REDIS_HOST, port: process.env.REDIS_PORT}); r.ping().then(console.log).catch(console.error);"
```

**Solutions**:
1. System uses graceful degradation - app still works without Redis
2. Check Redis credentials in `.env`
3. Verify Redis service is running: `redis-cli ping`
4. Review firewall rules for Redis port 25060

---

### WordPress Plugin Not Showing Content

**Symptoms**: Empty shortcode output, no links displayed

**Diagnosis**:
```bash
# Check API key
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3003/api/sites | jq '.data[] | {id, site_name, api_key}'

# Test WordPress endpoint
curl -s "http://localhost:3003/api/wordpress/get-content?api_key=XXX" | jq .
```

**Solutions**:
1. Verify API key matches between plugin and database
2. Check placements exist: `SELECT COUNT(*) FROM placements WHERE site_id = X;`
3. Check placement_content: `SELECT COUNT(*) FROM placement_content WHERE placement_id IN (...);`
4. Clear cache: `redis-cli DEL "wp:content:XXX"`
5. Check plugin version: Should be v2.4.5+ for extended fields

---

### Slow Queries (>1000ms)

**Symptoms**: API timeouts, slow page loads

**Diagnosis**:
```bash
# Check slow query logs
grep "Slow query detected" backend/logs/combined-*.log | tail -20

# Enable PostgreSQL slow query log
psql -d linkmanager -c "ALTER SYSTEM SET log_min_duration_statement = 1000;"
psql -d linkmanager -c "SELECT pg_reload_conf();"

# Analyze specific query
psql -d linkmanager -c "EXPLAIN ANALYZE SELECT ..."
```

**Solutions**:
1. Check if indexes exist: `\di` in psql
2. Run missing index migrations
3. Increase `max` in connection pool (currently 25)
4. Add query-specific index if needed
5. Review [ADR-003](ADR.md#adr-003-redis-cache-with-graceful-degradation) for caching strategy

---

## Backup & Recovery

### Automated Backup Schedule

**Daily backups** (configured in DigitalOcean):
- **Time**: 02:00 UTC
- **Retention**: 7 days
- **Location**: DigitalOcean managed backups

**Manual backup before major changes**:
```bash
./scripts/backup-before-deploy.sh
```

---

### Recovery Scenarios

#### Scenario 1: Accidental Data Deletion

```bash
# 1. Stop writes (maintenance mode)
echo "MAINTENANCE_MODE=true" >> .env
pm2 reload link-manager

# 2. Restore from backup
PGPASSWORD="$DB_PASSWORD" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" backup.dump

# 3. Verify data
psql -d linkmanager -c "SELECT COUNT(*) FROM placements;"

# 4. Exit maintenance mode
sed -i '/MAINTENANCE_MODE/d' .env
pm2 reload link-manager
```

#### Scenario 2: Database Corruption

```bash
# 1. Create new database
createdb linkmanager_new

# 2. Restore from last good backup
pg_restore -d linkmanager_new backup_20250122.dump

# 3. Update DATABASE_URL to new database
# 4. Restart application
# 5. Verify functionality
# 6. Drop old database after confirmation
```

---

## Monitoring & Alerts

### Health Check Endpoints

```bash
# Application health
curl http://localhost:3003/health
# Returns: {"status":"ok","timestamp":"...","architecture":"modular","queue":true}

# Database health
curl http://localhost:3003/health/db
# Returns: {"status":"ok","latency":5}

# Redis health
curl http://localhost:3003/health/redis
# Returns: {"status":"ok","available":true}
```

**Setup monitoring** (UptimeRobot, Pingdom, etc.):
- URL: `https://shark-app-9kv6u.ondigitalocean.app/health`
- Interval: 5 minutes
- Alert: Email/SMS on 2 consecutive failures

---

### Log Monitoring

```bash
# Real-time error monitoring
tail -f backend/logs/error-*.log

# Real-time all logs
tail -f backend/logs/combined-*.log

# Search for specific errors
grep -r "Database query error" backend/logs/

# Count errors by type
grep "error" backend/logs/error-*.log | cut -d':' -f4 | sort | uniq -c | sort -rn
```

---

### Performance Metrics

```bash
# Check Redis cache hit rate
redis-cli INFO stats | grep keyspace

# Check database connection pool
psql -d linkmanager -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'linkmanager';"

# Check slow queries
grep "Slow query" backend/logs/combined-*.log | wc -l

# API response times (from access logs)
awk '{print $10}' access.log | sort -n | tail -20
```

---

## Security Incidents

### Suspected Unauthorized Access

```bash
# 1. Review access logs
grep "401\|403" backend/logs/combined-*.log | tail -50

# 2. Check failed login attempts
grep "Auth middleware error" backend/logs/error-*.log | tail -20

# 3. List active sessions (JWT tokens are stateless, check recent activity)
psql -d linkmanager -c "SELECT user_id, COUNT(*) FROM transactions WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY user_id ORDER BY count DESC;"

# 4. Revoke access if needed (change JWT_SECRET forces all re-login)
# CRITICAL: This logs out ALL users
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
pm2 reload link-manager
```

---

### SQL Injection Attempt Detection

```bash
# Check for suspicious query patterns
grep -E "(DROP|DELETE|UNION|SELECT.*FROM.*WHERE)" backend/logs/combined-*.log | grep -v "Database query"

# Review all database queries
grep "Database query error" backend/logs/error-*.log
```

**Response**:
1. All queries should use parameterized format ($1, $2, etc.)
2. Review [ADR-007](ADR.md#adr-007-parameterized-queries-only) for SQL injection protection
3. If vulnerability found: Patch immediately + force password reset

---

### Managing Public Sites (Admin Only)

**Purpose**: Only admins can set `is_public = true` on sites. See [ADR-020](ADR.md#adr-020-admin-only-public-site-control).

**View all sites (admin panel)**:
```bash
# Via API
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3003/api/admin/sites?limit=100" | jq '.data[] | {id, site_url, is_public, owner_username}'
```

**Make site public**:
```bash
# Via API (admin only)
curl -X PUT "http://localhost:3003/api/admin/sites/123/public-status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_public": true}'
```

**Make site private**:
```bash
curl -X PUT "http://localhost:3003/api/admin/sites/123/public-status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_public": false}'
```

**Database direct check**:
```sql
-- List all public sites
SELECT id, site_url, user_id FROM sites WHERE is_public = true;

-- Emergency: Make all sites private
UPDATE sites SET is_public = false WHERE is_public = true;
```

**Security Notes**:
- Regular users CANNOT set is_public via API (server ignores the field)
- UI controls hidden for non-admin users
- All admin actions logged with timestamps

---

### Rate Limit Violations

```bash
# Check rate limit blocks
grep "Too many requests" backend/logs/combined-*.log | tail -20

# Identify offending IPs
grep "Too many requests" backend/logs/combined-*.log | awk '{print $1}' | sort | uniq -c | sort -rn
```

**Response**:
1. Review if legitimate user or attack
2. Add IP to firewall blacklist if attack
3. Adjust rate limits in `backend/config/constants.js` if needed

---

## Cron Jobs

### Auto-Renewal Job

**Schedule**: Daily at 00:00 UTC

```bash
# Manual run
node backend/cron/auto-renewal.cron.js

# Check logs
grep "auto-renewal" backend/logs/combined-*.log | tail -20

# Verify renewals
psql -d linkmanager -c "SELECT id, last_renewed_at, renewal_count FROM placements WHERE auto_renewal = true ORDER BY last_renewed_at DESC LIMIT 10;"
```

---

### Scheduled Placements Job

**Schedule**: Every 15 minutes

```bash
# Manual run
node backend/cron/scheduled-placements.cron.js

# Check pending scheduled placements
psql -d linkmanager -c "SELECT COUNT(*) FROM placements WHERE status = 'pending' AND scheduled_publish_date <= NOW();"
```

---

### Log Cleanup Job

**Schedule**: Daily at 03:00 UTC

```bash
# Manual run
node backend/cron/cleanup-logs.cron.js

# Check log sizes
du -sh backend/logs/*.log | sort -h
```

---

## Emergency Contacts

| Role | Name | Contact | Timezone |
|------|------|---------|----------|
| Lead Developer | TBD | email@example.com | UTC+3 |
| Database Admin | TBD | email@example.com | UTC+3 |
| DevOps | TBD | email@example.com | UTC+3 |
| DigitalOcean Support | - | https://cloud.digitalocean.com/support | 24/7 |

---

## Escalation Procedures

### Severity Levels

**P0 (Critical)** - System down, revenue impacted
- Response: Immediate (15 minutes)
- Escalation: Lead Developer → CTO
- Examples: Database offline, all API endpoints failing

**P1 (High)** - Major feature broken, affecting many users
- Response: 1 hour
- Escalation: On-call engineer → Lead Developer
- Examples: WordPress plugin not working, placements failing

**P2 (Medium)** - Minor feature broken, workaround available
- Response: Next business day
- Escalation: Assigned engineer
- Examples: Export failing, specific API slow

**P3 (Low)** - Cosmetic issue, no functionality impacted
- Response: Sprint planning
- Escalation: Backlog
- Examples: UI glitch, typo in error message

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-01-23 | Initial runbook creation | Development Team |
| 2025-11-25 | Added GEO migration procedure | Development Team |
| 2025-11-27 | Added admin-only public sites security procedure | Development Team |

---

**Review Schedule**: Quarterly (March, June, September, December)
**Next Review**: March 2026
