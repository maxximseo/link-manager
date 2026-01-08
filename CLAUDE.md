# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📚 Documentation Index

### Core Documentation (Must Read)
| Document | Purpose | When to Read |
|----------|---------|--------------|
| **[CLAUDE.md](CLAUDE.md)** | Development guide | Start here |
| **[ADR.md](ADR.md)** | 40 architectural decisions | Before making changes |
| **[README.md](README.md)** | Quick start guide | First time setup |
| **[API_REFERENCE.md](API_REFERENCE.md)** | 60+ API endpoints | API development |

### Operational Documentation
| Document | Purpose | When to Read |
|----------|---------|--------------|
| **[RUNBOOK.md](RUNBOOK.md)** | Step-by-step procedures | Operations/deployment |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history (v1.0.0 → v2.8.3) | Before releases |
| **[DECISIONS.md](DECISIONS.md)** | Quick patterns & gotchas | Daily coding |

### Specialized Guides
- **[EXTENDED_FIELDS_GUIDE.md](EXTENDED_FIELDS_GUIDE.md)** - JSONB extended fields system
- **[OPTIMIZATION_PRINCIPLES.md](OPTIMIZATION_PRINCIPLES.md)** - LEVER methodology
- **[database/MIGRATION_INSTRUCTIONS.md](database/MIGRATION_INSTRUCTIONS.md)** - Migration guide
- **[wordpress-plugin/CHANGELOG.md](wordpress-plugin/CHANGELOG.md)** - Plugin history

### Documentation Hierarchy
```
CLAUDE.md ──→ Development commands, architecture overview
    ↓
ADR.md ──→ WHY things are built this way (40 decisions)
    ↓
API_REFERENCE.md ──→ HOW to use the API (60+ routes)
    ↓
RUNBOOK.md ──→ WHAT to do for operations
    ↓
DECISIONS.md ──→ Quick patterns for daily work
```

---

## Development Commands

### ⚠️ CRITICAL: Build vs Dev Rules for Claude

**IMPORTANT: Auto-restart server after backend changes**

When you make changes to backend files, you MUST restart the server:
```bash
lsof -ti:3003 | xargs kill -9 2>/dev/null
npm run dev > /dev/null 2>&1 &
sleep 3 && echo "✅ Server restarted"
```

**When to restart:**
- ✅ Changes to `backend/services/*.js`, `backend/controllers/*.js`, `backend/routes/*.js`
- ✅ Changes to `backend/config/*.js` or database schemas
- ❌ NO restart for `backend/build/*.html` or `backend/build/js/*.js`

**Use `npm run build`** to check compilation:
```bash
npm run build  # Check for errors before completing task
```

### Server Commands
```bash
npm run dev        # Development with nodemon (USER RUNS THIS)
npm run dev:auto   # Auto-restart with port kill
npm start          # Production
```

### Database Operations
```bash
# Standard migration pattern (recommended)
node database/test-<feature>-migration.js

# Run specific migration
node database/run_migration.js

# Initialize fresh database
psql -d linkmanager -f database/init.sql
psql -d linkmanager -f database/seed.sql
```

### Port Management
```bash
lsof -ti:3003 | xargs kill -9  # Kill port 3003
lsof -ti:3005 | xargs kill -9  # Kill port 3005
```

### Testing API
```bash
TOKEN=$(curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:3003/api/projects
```

### Code Quality
```bash
npm run lint       # Check for errors
npm run lint:fix   # Auto-fix issues
npm run format     # Auto-format files
```

### WordPress Plugin Development

**Current Version**: 2.7.6 (January 2026)

**Source files**: `wordpress-plugin/`
**Build output**: `backend/build/link-manager-widget.zip`

#### Building Plugin ZIP (CRITICAL!)

**⚠️ ALWAYS use the build script - NEVER manually zip!**

```bash
# CORRECT way - use build script
./build-plugin-zip.sh

# Or manually with correct structure:
mkdir -p link-manager-widget
cp -r wordpress-plugin/* link-manager-widget/
zip -r backend/build/link-manager-widget.zip link-manager-widget/
rm -rf link-manager-widget
```

**❌ WRONG (causes plugin to disappear after update):**
```bash
# NEVER DO THIS - creates wrong folder structure!
zip -r backend/build/link-manager-widget.zip wordpress-plugin/
```

**Why this matters**: WordPress extracts ZIP to folder matching the archive's root folder name. If ZIP contains `wordpress-plugin/`, WordPress extracts to `wp-content/plugins/wordpress-plugin/` but expects files in `wp-content/plugins/link-manager-widget/`. Plugin "disappears" because WordPress can't find it.

#### Version Update Checklist

When releasing new plugin version:
1. Edit `wordpress-plugin/link-manager-widget.php`:
   - Update `Version:` in header comment (line 6)
   - Update `define('LMW_VERSION', '...')` constant (line 19)
2. Update `wordpress-plugin/CHANGELOG.md` with changes
3. Update `backend/controllers/plugin-updates.controller.js`:
   - Update `version` in `PLUGIN_INFO` object (line 9)
   - Update `upgrade_notice` message (line 53)
4. **Rebuild ZIP**: `./build-plugin-zip.sh`
5. Commit and push all changes

#### Auto-Update System

Plugin checks for updates via:
- `GET /api/plugin-updates/check` - Version comparison
- `GET /api/plugin-updates/info` - Plugin details popup
- `GET /api/plugin-updates/download` - ZIP download

WordPress caches update checks for 12 hours. To force check:
```sql
DELETE FROM wp_options WHERE option_name = '_transient_lmw_update_check';
DELETE FROM wp_options WHERE option_name = '_site_transient_update_plugins';
```

---

## Architecture Overview

> **Full details**: See [ADR.md](ADR.md) for 40 architectural decisions

### Request Flow
```
HTTP Request → Routes → Controllers → Services → Database (PostgreSQL)
```

### Key Patterns

| Pattern | Description | ADR Reference |
|---------|-------------|---------------|
| No ORM | Direct SQL queries via `pg` driver | [ADR-001](ADR.md#adr-001-no-orm---direct-sql-queries) |
| JWT Auth | No database lookup in middleware | [ADR-002](ADR.md#adr-002-jwt-authentication-without-database-lookups) |
| Redis Cache | Graceful degradation when unavailable | [ADR-003](ADR.md#adr-003-redis-cache-with-graceful-degradation) |
| Transactions | All multi-step ops wrapped | [ADR-004](ADR.md#adr-004-transaction-wrapped-multi-step-operations) |
| Vanilla JS | Modular frontend, no framework | [ADR-005](ADR.md#adr-005-modular-frontend-vanilla-js) |
| Rate Limiting | 5-tier strategy | [ADR-006](ADR.md#adr-006-comprehensive-rate-limiting-strategy) |

### Service Layer Pattern
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

**Sites Table**:
- `api_key` (NOT wp_username/wp_password)
- `site_type`: 'wordpress' | 'static_php'
- Do NOT use: `status`, `notes` (columns don't exist)

**Placements Table**:
- `status`: 'pending' | 'placed' | 'failed'
- `wordpress_post_id`: Post ID after publication

**Extended Fields (JSONB)** - See [ADR-008](ADR.md#adr-008-extended-fields-system-jsonb):
- `image_url`, `link_attributes`, `wrapper_config`, `custom_data`

### Route Parameter Convention
```javascript
// CRITICAL: Use :id not :projectId
router.delete('/:id/articles/:articleId', ...)
const projectId = req.params.id;  // NOT req.params.projectId
```

---

## File Locations Reference

### Backend Core
| File | Purpose |
|------|---------|
| `backend/server-new.js` | Entry point |
| `backend/app.js` | Express app |
| `backend/config/database.js` | Database config |
| `backend/config/logger.js` | Winston logger |

### Key Services
| Service | Purpose |
|---------|---------|
| `backend/services/project.service.js` | Project operations |
| `backend/services/site.service.js` | Site management |
| `backend/services/placement.service.js` | Placement logic |
| `backend/services/billing.service.js` | Billing & rentals |
| `backend/services/wordpress.service.js` | WP integration |
| `backend/services/cache.service.js` | Redis wrapper |

### Frontend Pages
| Page | Purpose |
|------|---------|
| `backend/build/dashboard.html` | Project list |
| `backend/build/project-detail.html` | Links/articles |
| `backend/build/sites.html` | Site management |
| `backend/build/placements.html` | Create placements |
| `backend/build/placements-manager.html` | View placements |
| `backend/build/balance.html` | Billing |

### Database
| File | Purpose |
|------|---------|
| `database/init.sql` | Schema |
| `database/seed.sql` | Test data |
| `database/run_*.js` | Migration runners |

---

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://...   # Full connection string
JWT_SECRET=<min 32 chars>       # JWT signing key
NODE_ENV=development|production
PORT=3003                       # Server port
```

### Redis (Optional - graceful degradation)
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<if required>
```

### Optional Services
```bash
# CryptoCloud Payments
CRYPTOCLOUD_API_KEY=eyJhbG...
CRYPTOCLOUD_SHOP_ID=<shop_id>
CRYPTOCLOUD_SECRET_KEY=<webhook_key>

# Email (Resend)
RESEND_API_KEY=re_xxx...
RESEND_FROM_EMAIL=noreply@serparium.com

# Sentry Error Tracking
SENTRY_DSN=https://...

# Security
ADMIN_IP_WHITELIST=91.84.98.55,127.0.0.1
BACKUP_ADMIN_KEY=<64-char hex>
```

---

## Migration Order (Critical)

Run in this exact order for new environments:
```bash
# Core schema
psql -d linkmanager -f database/init.sql

# Required migrations (DO NOT SKIP)
node database/run_user_id_migration.js          # 1. User ID
node database/run_site_types_migration.js       # 2. Site types
node database/run_nullable_migration.js         # 3. API key nullable
node database/run_remove_anchor_unique.js       # 4. Anchor duplicates
node database/run_extended_fields_migration.js  # 5. JSONB fields
node database/run_limits_cooldown_migration.js  # 6. 6-month cooldown
node database/run_slot_rentals_migration.js     # 7. Slot rentals

# WordPress post ID
psql -d linkmanager -f database/migrate_add_wordpress_post_id.sql

# Optional
node database/run_billing_migration.js          # Billing system
node database/run_registration_tokens_migration.js  # Bulk registration

# Seed data
psql -d linkmanager -f database/seed.sql
```

---

## Git Workflow

Repository: https://github.com/maxximseo/link-manager.git

**Auto-commit on file changes** (via nodemon):
- Format: `Auto-commit: Development changes at YYYY-MM-DD HH:MM:SS`
- Auto-push to GitHub after commit

**Manual commits**:
```bash
git add -A
git commit -m "Your message

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```

---

## 🔐 Local Credentials Management

**NEVER commit credentials!** Use `.credentials.local` (in `.gitignore`).

**Contains**:
- GitHub tokens
- Supabase PostgreSQL credentials
- Redis/Valkey credentials
- JWT secrets
- Admin login credentials

**When testing API**: Always read credentials from `.credentials.local` first.

**Verify before push**:
```bash
git diff --cached | grep -i "password\|secret\|token\|AVNS_"
```

---

## Quick Debugging

### Common Issues

| Issue | Solution |
|-------|----------|
| `column "user_id" does not exist` | Run `node database/run_user_id_migration.js` |
| API key constraint violation | Run `node database/run_nullable_migration.js` |
| Server won't start | Check port: `lsof -ti:3003`, check DATABASE_URL |
| Cache not working | Redis optional - verify: `redis-cli ping` |
| Frontend button not working | Check browser console for JS errors |

### Type Coercion
```javascript
// PostgreSQL COUNT() returns string "0" not number 0
// WRONG: if (count === 0)
// CORRECT:
if (parseInt(count) === 0) { ... }
```

### Visual Testing
```bash
node tests/visual/test-notifications.js  # Full test
```
Screenshots saved to `tests/visual/screenshots/`.

---

## 📐 Architecture Decision Records (ADR)

**See [ADR.md](ADR.md) for all 40 architectural decisions.**

### Quick Reference

| ADR | Topic | Impact |
|-----|-------|--------|
| ADR-001 | No ORM | All SQL direct via `query()` |
| ADR-002 | JWT Auth | No DB lookup in middleware |
| ADR-004 | Transactions | All multi-step ops wrapped |
| ADR-007 | SQL Injection | ⚠️ CRITICAL: Parameterized only |
| ADR-020 | Public Sites | ⚠️ SECURITY: Admin-only |
| ADR-023 | URL Masking | ⚠️ SECURITY: Premium sites |
| ADR-028 | Field Pass-Through | ⚠️ CRITICAL: All fields in SQL |
| ADR-034 | Build vs Dev | ⚠️ CRITICAL: Claude uses `npm run build` |

### When to Consult ADR

- Before adding database tables/columns → ADR-001, ADR-004, ADR-007
- Before changing auth logic → ADR-002
- Before API changes → ADR-006, ADR-007
- Before security changes → ADR-007, ADR-020, ADR-023
- Before controller/service changes → ADR-028

---

## Related Documents

For detailed information on specific topics:

| Topic | Document |
|-------|----------|
| API endpoints | [API_REFERENCE.md](API_REFERENCE.md) |
| Operations & deployment | [RUNBOOK.md](RUNBOOK.md) |
| Quick patterns | [DECISIONS.md](DECISIONS.md) |
| Extended fields | [EXTENDED_FIELDS_GUIDE.md](EXTENDED_FIELDS_GUIDE.md) |
| Code optimization | [OPTIMIZATION_PRINCIPLES.md](OPTIMIZATION_PRINCIPLES.md) |
| All architectural decisions | [ADR.md](ADR.md) |
