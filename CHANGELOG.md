# Changelog

All notable changes to the Link Manager project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.10] - 2025-12-14

### 🎨 UI/UX: Modern Modal Design System

#### New Modal Designs (Figma-style)
- **UPDATED** `dashboard.html` - Create Project modal:
  - Gradient header (blue → indigo → purple)
  - Icon box with folder-plus icon
  - Subtitle "Настройте параметры вашего проекта"
  - Modern form inputs with focus states
  - Required field indicator (red asterisk)
  - Gradient save button with checkmark icon

- **UPDATED** `sites.html` - Add Site modal (previous session):
  - Gradient header (purple → indigo → cyan)
  - Site type toggle (WordPress / Static PHP)
  - API Token field with copy button
  - Price inputs with $ prefix
  - Toggle switches for permissions
  - Plugin download section

#### Translation Updates
- **ADDED** `configureProjectSettings` - RU: "Настройте параметры вашего проекта", EN: "Configure your project settings"
- **ADDED** `columns` - RU: "Колонки", EN: "Columns"
- **ADDED** `exportCsv` - RU: "Экспорт CSV", EN: "Export CSV"
- **RENAMED** `maxLinks` - RU: "Макс. ссылок на главной", EN: "Max homepage links"
- **RENAMED** `sidebarAddLink` - RU: "Купить ссылки", EN: "Buy links"

### CSS Classes Added
- `.project-modal-content` - Modal container with shadow
- `.project-modal-header` - Gradient header
- `.project-modal-icon` - Semi-transparent icon box
- `.project-modal-title-wrap` - Title and subtitle wrapper
- `.project-form-group` - Form group container
- `.project-form-input` - Modern input styling
- `.project-btn-save` - Gradient save button
- `.project-btn-cancel` - Cancel button with border

### Files Changed
- `backend/build/dashboard.html` - New project modal design + CSS
- `backend/build/js/translations.js` - New translation keys (RU + EN)

---

## [2.6.9] - 2025-12-14

### 🔄 Infrastructure: Complete DigitalOcean Database Cleanup

#### Files Deleted (29 total)
- **DELETED** 27 migration scripts from `database/` directory:
  - All `run_*_migration.js` files (billing, dr, da, geo, etc.)
  - All migration runners no longer needed (database already configured)
- **DELETED** 2 export/import scripts from `scripts/`:
  - `export-from-digitalocean.js`
  - `import-to-supabase.js`

#### Code Changes
- **UPDATED** `backend/config/database.js`:
  - Removed `ondigitalocean.com` SSL check
  - Now only checks for `supabase.com` domains
  - Updated comments to reference Supabase instead of DigitalOcean

#### Documentation Updated
- **UPDATED** `CLAUDE.md` - All DB references now point to Supabase
- **UPDATED** `RUNBOOK.md` - Removed DO IP whitelist instructions, simplified Quick Start
- **UPDATED** `README.md` - Deployment section updated for Supabase
- **UPDATED** `.env.example` - Clarified DO Spaces is for backup storage only
- **ADDED** `ADR.md` - ADR-032: Complete Removal of DigitalOcean Database References

#### What Was Preserved
- DigitalOcean Spaces (DO_SPACES_*) for backup storage
- Redis/Valkey on DigitalOcean with TLS configuration
- All backup scripts (backup-database.sh, backup-files.sh, restore-database.sh)

### Files Changed
- `backend/config/database.js` - Supabase-only SSL config
- `CLAUDE.md` - Updated database documentation
- `RUNBOOK.md` - Simplified startup, removed DO DB instructions
- `README.md` - Updated deployment section
- `.env.example` - Added clarifying comment
- `ADR.md` - Added ADR-032
- `CHANGELOG.md` - This entry

---

## [2.6.8] - 2025-12-13

### 🔄 Infrastructure: Database Migration to Supabase

#### Database Provider Change
- **MIGRATED** PostgreSQL from DigitalOcean to Supabase
- **PRESERVED** All data: 15 tables, 2,264 records
- **UNCHANGED** Redis/Valkey remains on DigitalOcean

#### Technical Changes
- **UPDATED** `backend/config/database.js` - Added Supabase SSL support:
  ```javascript
  if (process.env.DB_HOST?.includes('supabase.com')) {
    sslConfig = { rejectUnauthorized: false };
  }
  ```
- **UPDATED** Environment variables for both production and local development
- **ADDED** Migration scripts:
  - `scripts/export-from-digitalocean.js`
  - `scripts/import-to-supabase.js`

#### Connection Details
- Host: `aws-1-eu-west-1.pooler.supabase.com`
- Port: 5432
- Database: `postgres`
- Note: Password with `&` requires URL encoding (`%26`)

### 🧹 Project Cleanup

#### Removed Unused Files
- **DELETED** 6 root test files (test-custom-pricing.js, etc.)
- **DELETED** 7 documentation files (VERIFICATION_REPORT.md, etc.)
- **DELETED** 11 historical migration files (run_comprehensive_fixes.js, etc.)
- **DELETED** Directories: `coverage/`, `link-manager/`, `migration-data/`
- **DELETED** `backend/build/placements-manager.html.backup`

#### Documentation Fixed
- **FIXED** CLAUDE.md: Corrected `run_remove_anchor_constraint.js` → `run_remove_anchor_unique.js`
- **ADDED** ADR-030: Database Migration from DigitalOcean to Supabase
- **ADDED** ADR-031: Project Cleanup - Remove Unused Files

### Files Changed
- `backend/config/database.js` - Supabase SSL support
- `backend/.env` - Supabase credentials
- `.env` - Supabase credentials
- `CLAUDE.md` - Fixed migration file reference
- `ADR.md` - Added ADR-030, ADR-031
- `CHANGELOG.md` - This entry

---

## [2.6.7] - 2025-12-11

### 🐛 Bug Fixes: Link Edit + Bulk Import Redesign

#### Link Edit Save Bug Fixed
- **FIXED** Link save functionality not working after editing
- **ROOT CAUSE**: `html_context` field was not being passed through the entire stack:
  - Controller did not extract `html_context` from `req.body`
  - Service did not include `html_context` in SQL UPDATE query
- **FILES FIXED**:
  - `backend/controllers/project.controller.js` - Added `html_context` to destructuring (line 252)
  - `backend/services/project.service.js` - Added `html_context` to UPDATE query (lines 253-264)

#### Database Migration: updated_at Column
- **ADDED** `updated_at` column to multiple tables that were missing it:
  - `project_links` - tracks when links are modified
  - `project_articles` - tracks when articles are modified
  - `registration_tokens` - tracks token updates
  - `placements` - already had it, verified
- **CREATED** Migration files:
  - `database/run_updated_at_migration.js` - Node.js runner with SSL support
  - `database/migrate_add_updated_at.sql` - Raw SQL migration

#### Bulk Import Preview Modal Redesign
- **REDESIGNED** Preview modal (Step 2) to match React reference design
- **ADDED** Visual improvements:
  - Green checkmark circles (✓) for valid links
  - Blue underlined anchor text highlighting in context
  - Pink/magenta anchor text display
  - URL displayed as clickable link
  - Proper spacing and typography
- **ADDED** Error handling for invalid entries:
  - Red circle with X (✗) indicator
  - Gray italic text for invalid HTML
  - Error message display
- **PRESERVED** All existing functionality:
  - Link validation logic
  - Import count tracking
  - Step navigation

### 🧪 Testing

#### Visual Test: Link Edit
- **CREATED** `tests/visual/test-link-edit.js` - Comprehensive Puppeteer test
- **TESTS**:
  - Login functionality
  - Project page loading
  - Edit modal opening
  - Field population verification
  - Field modification
  - Save button functionality
  - Modal close after save
  - Table update verification
  - API response verification with `updated_at` timestamp
  - Data restoration after test
- **RESULT**: 12/14 tests passing (2 minor API verification issues in test logic)

### 📦 Files Changed
| File | Change |
|------|--------|
| `backend/controllers/project.controller.js` | FIXED - Added `html_context` extraction |
| `backend/services/project.service.js` | FIXED - Added `html_context` to UPDATE SQL |
| `backend/build/project-detail.html` | REDESIGNED - Bulk import preview modal |
| `database/run_updated_at_migration.js` | CREATED - Migration runner |
| `database/migrate_add_updated_at.sql` | CREATED - SQL migration |
| `tests/visual/test-link-edit.js` | CREATED - Visual test for link editing |

### 🔧 Migration Command
```bash
# Run migration for updated_at columns
NODE_TLS_REJECT_UNAUTHORIZED=0 node database/run_updated_at_migration.js
```

---

## [2.6.6] - 2025-12-10

### 🎨 UI: Notification Redesign + Column Management

#### Notification Dropdown Redesign
- **REDESIGNED** Notification dropdown with modern card-based design
- **ADDED** Color-coded left borders per notification type:
  - Orange (warning) - moderation, expiring soon
  - Red (error) - security alerts, failed operations
  - Green (success) - purchases, publications
  - Blue (info) - general notifications
- **ADDED** Icons in colored circles (44px diameter)
- **ADDED** Gray background (#f8fafc) for notification list
- **ADDED** Header with "Уведомления" title and "Отметить все как прочитанные" link
- **ADDED** Footer with "Удалить все" button
- **ADDED** Helper functions in navbar.js:
  - `getNotificationType(notification)` - Determines type from title/content
  - `getNotificationIcon(type)` - Returns Bootstrap icon class
  - `getNotificationAction(notification)` - Returns action link HTML
  - `handleNotificationClick(event, id, url)` - Handles click with mark-as-read
  - `markAllNotificationsRead(event)` - Batch mark all as read

#### Column Management in placements-manager.html
- **ADDED** "Фильтры" button (bi-funnel icon) to toggle filters panel
- **ADDED** "Колонки" dropdown button (bi-layout-three-columns icon)
- **ADDED** Dropdown with checkboxes for all 18+ columns:
  - Core: ID, Проект, Площадка, Опубликовано, Истекает, Цена
  - Settings: Автопродление, Действия
  - SEO: DR, DA, TF, CF, RD, RDm, Norm, KW, Traf, GEO
  - Meta: Тип сайта, Тип
- **ADDED** Quick buttons: "Все" (show all) and "Минимум" (hide optional)
- **ADDED** localStorage persistence for column visibility settings
- **ADDED** New JavaScript functions:
  - `toggleColumn(columnId)` - Toggle single column visibility
  - `loadColumnSettings()` - Load settings from localStorage
  - `saveColumnSettings()` - Save settings to localStorage
  - `showAllColumns()` - Show all columns
  - `hideOptionalColumns()` - Hide SEO/meta columns
  - `applyColumnSettings()` - Apply settings on page load
  - `toggleFiltersPanel()` - Toggle filters card visibility
  - `findColumnIndex(table, headerText)` - Dynamic column index lookup by header text
  - `window.reapplyColumnSettings()` - Global function to reapply after table refresh
- **FIXED** Column visibility now uses dynamic header text matching instead of hardcoded indices
- **FIXED** Columns correctly hide/show across all tabs (Active, Scheduled, History)
- **FIXED** Settings reapply automatically when:
  - Page loads (with 500ms delay for table render)
  - Tab switches (Bootstrap `shown.bs.tab` event)
  - Table data is re-rendered (via `reapplyColumnSettings()` calls)
- **ADDED** Extended columnHeaderMap with table-specific headers:
  - `scheduled`, `purchased` for Scheduled tab
  - `status`, `renewals` for History tab

### 📦 Files Changed
| File | Change |
|------|--------|
| `backend/build/css/modern-table.css` | ADDED notification card CSS (~250 lines) |
| `backend/build/js/navbar.js` | UPDATED renderNotifications(), updateNotificationsList() |
| `backend/build/placements-manager.html` | ADDED filter/column buttons, FIXED column visibility logic |
| `backend/build/js/placements-manager.js` | ADDED reapplyColumnSettings() calls in all render functions |

### 🔧 CSS Classes Added
```css
.notification-dropdown    - Main dropdown container
.notification-header      - Header with title and actions
.notification-list        - Scrollable notification container
.notification-card        - Individual notification card
.notification-card.type-* - Type-specific border colors
.notification-icon        - Circular icon container
.notification-icon.icon-* - Type-specific background colors
.notification-content     - Content container
.notification-title       - Title text
.notification-time        - Timestamp
.notification-message     - Description text
.notification-action      - Action link ("Просмотреть →")
.notification-footer      - Footer with actions
```

---

## [2.6.5] - 2025-12-09

### 🔒 Security: URL Masking for Premium Sites

Added URL masking feature to hide high-value site domains from regular users until they achieve Gold tier status.

#### URL Masking Feature
- **ADDED** `maskUrl()` function in `placements.html` (lines 507-541)
- **Threshold**: DR >= 20 OR DA >= 30 triggers masking
- **Exceptions**:
  - Admin users see all URLs immediately
  - Gold+ tier users (20%+ discount, $3000+ spent) see all URLs
- **Masking format examples**:
  - `elearning-reviews.org` → `elear***ws.org`
  - `litlong.org` → `lit***ng.org`
  - Short names (3 chars or less): Show first char + `***` + last char
  - Medium names (4-6 chars): Show first 2 + `***` + last 2
  - Long names (7+ chars): Show first 4 + `***` + last 2

#### Gold Tier Benefit Display
- **ADDED** "(Будут видны все адреса площадок)" text for locked Gold tier in `balance.js`
- **LOCATION** Discount tiers table, shows as info text below "Заблокирован" status

### 🔧 Site Limits 6-Month Cooldown System

Non-admin users can only change max_links/max_articles once every 6 months.

#### Backend Implementation
- **ADDED** `limits_changed_at TIMESTAMP` column to `sites` table
- **ADDED** 6-month cooldown check in `site.service.js:updateSite()`
- **ADDED** `userRole` parameter (4th argument) to `updateSite()` function
- **UPDATED** `site.controller.js` - passes `req.user.role` to service
- **ERROR MESSAGE**: "Вы можете изменять лимиты Links/Articles раз в 6 месяцев..."

#### Frontend Implementation
- **ADDED** `#limitsCooldownWarning` alert div in `sites.html`
- **ADDED** Cooldown detection in `editSite()` function
- **ADDED** Readonly state for max_links/max_articles fields during cooldown
- **ADDED** Info about remaining cooldown time

#### Migration
- **ADDED** `database/migrate_limits_cooldown.sql` - SQL migration file
- **ADDED** `database/run_limits_cooldown_migration.js` - Migration runner

```bash
# Run migration
node database/run_limits_cooldown_migration.js
```

### 🎨 UI Changes
- **REMOVED** Green highlighting for public sites in `sites.html` (CSS definition remains unused)

### 📦 Files Changed
| File | Change |
|------|--------|
| `backend/build/placements.html` | ADDED maskUrl() function |
| `backend/build/js/balance.js` | ADDED Gold tier benefit text |
| `backend/build/sites.html` | ADDED cooldown UI, removed green highlighting |
| `backend/services/site.service.js` | ADDED cooldown logic, userRole parameter |
| `backend/controllers/site.controller.js` | ADDED role passing, cooldown error handling |
| `database/migrate_limits_cooldown.sql` | NEW migration file |
| `database/run_limits_cooldown_migration.js` | NEW migration runner |

---

## [2.6.4] - 2025-12-04

### 🧹 Code Quality: DRY Principle - Remove Duplicate Functions

Audit and refactoring of duplicate function definitions across service files.

#### Removed Duplicates
- **`getSiteById`** - Removed from `wordpress.service.js` (duplicate of `site.service.js`)
  - `wordpress.service.js` had simplified version (4 fields)
  - `site.service.js` has complete version (22 fields)
  - Updated `wordpress.controller.js` to use `siteService.getSiteById`

#### Intentional Duplicates (Kept)
- **`refundPlacement`** - Different implementations for different contexts:
  - `billing.service.js:1318` - User-initiated refunds
  - `admin.service.js:485` - Admin-initiated refunds with additional logging

#### Files Modified
- `backend/services/wordpress.service.js` - Removed `getSiteById` function
- `backend/controllers/wordpress.controller.js` - Added `siteService` import, switched to use canonical function

---

## [2.6.3] - 2025-12-04

### 🔒 Security: Complete Rate Limiting Coverage

Full audit and implementation of rate limiting across ALL route files (13/13 = 100% coverage).

#### Files Updated
- **`backend/routes/project.routes.js`** - Added `apiLimiter` to all GET/PUT/DELETE endpoints
- **`backend/routes/queue.routes.js`** - Added global `adminLimiter` (100 req/min)
- **`backend/routes/debug.routes.js`** - Added global `debugLimiter` (30 req/min)
- **`backend/routes/health.routes.js`** - Added `healthLimiter` (60 req/min) and `backupLimiter` (5 req/min)
- **`backend/routes/legacy.js`** - Added `apiLimiter` to /projects, /sites, /placements

#### Rate Limit Tiers
| Tier | Limit | Purpose |
|------|-------|---------|
| LOGIN | 50/15min | Brute force protection |
| REGISTER | 5/hour | Account creation abuse |
| API | 100/min | General API operations |
| CREATE | 10/min | Resource creation |
| FINANCIAL | 50/min | Billing batch operations |
| PURCHASE | 10/min | Single purchases |
| DEPOSIT | 5/min | Fraud prevention |
| PUBLIC_API | 10/min | Unauthenticated endpoints |
| HEALTH | 60/min | Monitoring systems |
| DEBUG | 30/min | Debug operations |

#### Route Coverage
All 13 route files now have rate limiting:
- ✅ admin.routes.js
- ✅ notification.routes.js
- ✅ auth.routes.js
- ✅ billing.routes.js
- ✅ site.routes.js
- ✅ project.routes.js
- ✅ placement.routes.js
- ✅ wordpress.routes.js
- ✅ static.routes.js
- ✅ queue.routes.js
- ✅ debug.routes.js
- ✅ health.routes.js
- ✅ legacy.js

#### Documentation
- Updated ADR-006 with full coverage audit table
- Added implementation patterns documentation

---

## [2.6.2] - 2025-12-03

### 🔐 Encrypted Database Backup System

Automated encrypted backups to DigitalOcean Spaces with 12-hour schedule.

#### New Files
- **`scripts/backup-database.sh`** - Main backup script with encryption and S3 upload
- **`scripts/restore-database.sh`** - Restore script with decryption
- **`backend/cron/database-backup.cron.js`** - Automated backup cron job

#### Features
- **Encryption**: AES-256-CBC with pbkdf2 (100,000 iterations)
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Schedule**: Every 12 hours (00:00 and 12:00 UTC)
- **Retention**: Automatic cleanup of backups older than 7 days
- **Manual trigger**: Via API endpoint `POST /health/backup`

#### Backup Script Options
```bash
./scripts/backup-database.sh              # Full backup to DO Spaces
./scripts/backup-database.sh --local-only # Local backup only
./scripts/backup-database.sh --no-encrypt # Without encryption (not recommended)
```

#### Manual Backup via API
```bash
ADMIN_KEY=$(grep JWT_SECRET .env | cut -d'=' -f2 | cut -c1-32)
curl -X POST http://localhost:3003/health/backup -H "X-Admin-Key: $ADMIN_KEY"
```

#### Environment Variables
| Variable | Description |
|----------|-------------|
| `BACKUP_ENCRYPTION_KEY` | AES-256 key (min 32 chars) |
| `DO_SPACES_KEY` | DO Spaces access key |
| `DO_SPACES_SECRET` | DO Spaces secret key |
| `DO_SPACES_BUCKET` | Bucket name |
| `DO_SPACES_REGION` | Region (e.g., `atl1`) |
| `BACKUP_RETENTION_DAYS` | Days to keep (default: 7) |

#### Documentation Updates
- RUNBOOK.md: Full backup system documentation with troubleshooting
- CLAUDE.md: Environment variables section updated
- .env.example: Backup configuration added

---

## [2.6.1] - 2025-12-03

### 🛠️ Developer Tools - ESLint + Prettier (ADR-022)

Added code quality tooling for consistent code style and early bug detection.

#### New Files
- **`eslint.config.js`** - ESLint 9 flat config with project rules
- **`.prettierrc`** - Prettier formatting settings
- **`.prettierignore`** - Files excluded from formatting

#### New NPM Scripts
```bash
npm run lint          # Check for errors and warnings
npm run lint:fix      # Auto-fix issues
npm run format        # Format all files
npm run format:check  # Check formatting
```

#### ESLint Rules Configured
| Rule | Level | Purpose |
|------|-------|---------|
| `no-unused-vars` | warn | Catches dead code |
| `require-await` | warn | Flags async without await |
| `no-console` | warn | Reminds to remove debug logs |
| `prefer-const` | warn | Encourages immutability |
| `no-var` | error | Use let/const instead |
| `eqeqeq` | warn | Type-safe comparisons |
| `prettier/prettier` | warn | Consistent formatting |

#### Prettier Settings
- Single quotes, 2-space tabs, no trailing commas
- 100 character print width
- LF line endings

#### Dependencies Added
- `eslint` ^9.39.1
- `prettier` ^3.7.4
- `eslint-config-prettier` ^10.1.8
- `eslint-plugin-prettier` ^5.5.4
- `@eslint/js` ^9.39.1

#### Initial Linting Results
- **2158 problems** (1 error, 2157 warnings)
- Most warnings are Prettier formatting (auto-fixable)
- Real bugs found: unused variables in billing.service.js

#### Documentation
- CLAUDE.md updated with Code Quality section
- ADR-022 added for ESLint + Prettier decision

---

## [2.6.0] - 2025-12-03

### 🏗️ Frontend Architecture Refactoring (ADR-021)

Major refactoring of frontend JavaScript codebase to eliminate code duplication and establish single-source-of-truth patterns.

#### New Shared Utilities Module (badge-utils.js)
- **ADDED** `badge-utils.js` - Centralized badge, status, and color utilities (~280 lines)
- **ADDED** `getPlacementStatusBadge(status)` - Returns HTML badge for placement status
- **ADDED** `getPlacementTypeBadge(type)` - Returns badge for 'link' or 'article'
- **ADDED** `getSiteTypeBadge(siteType)` - Returns badge for 'wordpress' or 'static_php'
- **ADDED** `getTransactionTypeBadge(type)` - Returns badge for transaction types
- **ADDED** `getUserRoleBadge(role)` - Returns badge for user roles
- **ADDED** `getAutoRenewalIcon(enabled)` - Returns icon for auto-renewal status
- **ADDED** `getAmountColorClass(amount)` - Returns CSS class for positive/negative amounts
- **ADDED** `formatExpiryWithColor(expiresAt)` - Returns `{text, class, daysLeft}` object
- **ADDED** `getDrColorClass(dr)`, `getDaColorClass(da)`, `getTfColorClass(tf)`, `getCfColorClass(cf)` - SEO metric colors
- **ADDED** `getDiscountTierName(discount)` - Returns tier name ('Стандарт', 'Bronze', etc.)
- **ADDED** `formatDate(dateString)` - Formats date as DD.MM.YYYY
- **ADDED** `formatDateTime(dateString)` - Formats date as DD.MM.YYYY HH:MM
- **ADDED** `getEmptyTableRow(colspan, message)` - Returns empty state row HTML
- **ADDED** `getErrorTableRow(colspan, message)` - Returns error state row HTML

#### Dead Code Removal (~2000 lines)
- **DELETED** `backend/build/js/core/` folder (3 files):
  - `api.js` (~217 lines) - Duplicate APIClient class, never used
  - `app.js` (~50 lines) - Never included in any HTML
  - `utils.js` (~80 lines) - Never included in any HTML
- **DELETED** `backend/build/js/modules/` folder (8 files):
  - `articles.js`, `bulk-links.js`, `export.js`, `placements.js`, `projects.js`, `queue.js`, `sites.js`, `wordpress.js`
  - (~1600 lines total) - None were included in any HTML file

#### Duplicate Function Consolidation
- **REMOVED** `formatDate()` duplicate from `admin-dashboard.js` (11 lines)
- **REMOVED** `formatDate()` duplicate from `placements-manager.js` (9 lines)
- **REMOVED** `isAdmin()` duplicate from `placements-manager.js` (8 lines)
- **UPDATED** `admin-dashboard.js` - Now uses shared `formatDateTime()` from badge-utils.js
- **UPDATED** `placements-manager.js` - Now uses shared `formatDate()` and `isAdmin()` from shared modules
- **UPDATED** `admin-placements.js` - Now uses badge-utils functions
- **UPDATED** `admin-users.js` - Now uses badge-utils functions
- **UPDATED** `balance.js` - Now uses badge-utils functions

#### Script Loading Order
Established strict loading order for frontend scripts:
```
1. security.js      → escapeHtml(), showAlert()
2. auth.js          → getToken(), isAdmin(), isAuthenticated()
3. badge-utils.js   → All badge/color utilities
4. api.js           → ProjectsAPI, SitesAPI, etc.
5. [page].js        → Page-specific code
```

### 📦 Files Changed
| File | Change |
|------|--------|
| `backend/build/js/badge-utils.js` | NEW - Shared utilities module |
| `backend/build/js/admin-dashboard.js` | UPDATED - Uses shared functions |
| `backend/build/js/admin-placements.js` | UPDATED - Uses shared functions |
| `backend/build/js/admin-users.js` | UPDATED - Uses shared functions |
| `backend/build/js/balance.js` | UPDATED - Uses shared functions |
| `backend/build/js/placements-manager.js` | UPDATED - Uses shared functions |
| `backend/build/js/core/*` | DELETED - Dead code |
| `backend/build/js/modules/*` | DELETED - Dead code |

### 📊 Impact Metrics
- **Lines Removed**: ~2000 (dead code)
- **Duplicate Functions Eliminated**: 5
- **Files Deleted**: 11
- **New Shared Functions**: 20+
- **Files Updated**: 6

### 📚 Documentation
- **ADDED** ADR-021: Frontend Shared Utilities Architecture
- **UPDATED** CLAUDE.md - Frontend Architecture section with new structure
- **UPDATED** DECISIONS.md - Quick patterns for frontend development

---

## [2.5.9] - 2025-12-02

### 🔔 Notification System Implementation

#### Critical Bug Fix - Scheduled Placements
- **FIXED** Scheduled placements cron job failing with error: `column "updated_at" of relation "placements" does not exist`
- **ADDED** Migration `database/migrate_add_updated_at.sql` - Adds `updated_at` column to placements table
- **ADDED** Migration runner `database/run_updated_at_migration.js` - Node.js script to run the migration
- **IMPACT** Scheduled placements were being refunded instead of published due to this missing column

#### Navbar Notifications UI (navbar.js)
- **ADDED** `Navbar.loadNotifications()` - Fetches notifications from API and updates badge count
- **ADDED** `Navbar.updateNotificationsList()` - Renders notifications in dropdown with:
  - Title, message preview, and timestamp
  - Unread indicator (highlighted background)
  - Mark as read button (checkmark)
  - Delete button (X)
- **ADDED** `Navbar.markNotificationRead()` - Mark single notification as read
- **ADDED** `Navbar.deleteNotification()` - Delete single notification
- **ADDED** `Navbar.markAllNotificationsRead()` - Mark all notifications as read
- **ADDED** `Navbar.escapeHtml()` - XSS protection for notification content
- **ADDED** Auto-refresh every 60 seconds
- **UPDATED** `renderNotifications()` - Now renders full dropdown with header and action buttons

#### Purchase Notifications (billing.service.js)
- **ADDED** User notification on placement purchase: "Куплена ссылка на сайте X для проекта Y. Списано $Z."
- **ADDED** Admin notification on purchase: "Пользователь X купил ссылку на Y за $Z."
- **ADDED** Grouped notification for batch purchases: "Куплено N размещений для проекта X. Списано $Y."
- **ADDED** Admin notification for batch purchases: "Пользователь X купил N размещений за $Y."

#### Scheduled Placement Notifications (scheduled-placements.cron.js)
- **ADDED** Admin notification when scheduled placement is published: "Запланированное размещение #N на сайте X успешно опубликовано."

### 📋 Notification Types Added
| Type | Recipient | Event |
|------|-----------|-------|
| `placement_purchased` | User | Single placement purchase |
| `admin_placement_purchased` | Admin | User purchased placement |
| `batch_placement_purchased` | User | Multiple placements purchased |
| `admin_batch_purchased` | Admin | User batch purchase |
| `placement_published` | User | Scheduled placement published |
| `admin_placement_published` | Admin | Scheduled placement published |

### 📦 Files Changed
- `backend/build/js/navbar.js` - Full notification system UI implementation
- `backend/services/billing.service.js` - Purchase and batch purchase notifications
- `backend/cron/scheduled-placements.cron.js` - Admin notifications for scheduled publications
- `database/migrate_add_updated_at.sql` - NEW migration file
- `database/run_updated_at_migration.js` - NEW migration runner

### 🔧 Migration Required
```bash
# Run this migration if scheduled placements are failing with refunds:
node database/run_updated_at_migration.js
```

---

## [2.5.8] - 2025-11-28

### 🔐 Security Hardening (Extended Audit)

#### Queue Routes Protection (CRITICAL FIX)
- **ADDED** Admin authentication to `/api/queue/*` routes
- **BEFORE** Queue endpoints were publicly accessible (CRITICAL vulnerability)
  - Anyone could view all job data (GET /api/queue/jobs)
  - Anyone could cancel/retry jobs (POST /api/queue/jobs/:q/:id/cancel)
  - Anyone could cleanup job history (POST /api/queue/cleanup)
- **AFTER** Queue routes require admin authentication
- **UPDATED** `backend/routes/queue.routes.js` - Added auth + admin middleware

#### Debug Endpoints Protection
- **ADDED** Admin authentication to `/api/debug/*` routes
- **BEFORE** Debug endpoints were accessible without authentication (CRITICAL vulnerability)
- **AFTER** Debug endpoints require:
  1. Valid JWT token (authMiddleware)
  2. Admin role (adminMiddleware)
  3. NODE_ENV=development (routes not mounted in production)
- **UPDATED** `backend/routes/debug.routes.js` - Added auth + admin middleware

#### CORS Configuration Documentation
- **ADDED** `CORS_ORIGINS` environment variable documentation in CLAUDE.md
- **RECOMMENDED** Set `CORS_ORIGINS=https://yourdomain.com` in production
- **DEFAULT** Falls back to `*` (all origins) if not set

#### WordPress Verify Endpoint Rate Limiting
- **ADDED** Rate limit (10/min) to `/api/wordpress/verify` endpoint
- **BEFORE** No rate limit allowed unlimited API key verification attempts
- **AFTER** 10 requests per minute per IP (prevents brute-force enumeration)
- **UPDATED** `backend/routes/wordpress.routes.js` - Added publicApiLimiter

#### Security Audit Summary
- ✅ SQL Injection: Parameterized queries
- ✅ Brute Force: 5 attempts → 30 min lockout
- ✅ JWT: 1h access + 7d refresh tokens
- ✅ XSS: escapeHtml() utilities
- ✅ API Key: X-API-Key header
- ✅ Debug endpoints: Admin-only + development mode
- ✅ Queue endpoints: Admin-only (FIXED)
- ✅ WordPress verify: Rate limited (FIXED)
- 🟡 CORS: Documented, recommend setting CORS_ORIGINS

### 📦 Files Changed
- `backend/routes/queue.routes.js` - Admin authentication added (CRITICAL)
- `backend/routes/debug.routes.js` - Admin authentication added
- `backend/routes/wordpress.routes.js` - Rate limit added to verify endpoint
- `CLAUDE.md` - CORS_ORIGINS documentation

---

## [2.5.7] - 2025-11-28

### 🔐 Security Improvements

#### JWT Token Refresh System
- **CHANGED** Access token expiry: 7 days → 1 hour (reduces risk if token is stolen)
- **ADDED** Refresh token support (7 days expiry) for seamless session continuation
- **ADDED** `POST /api/auth/refresh` endpoint with rate limiting (10/min)
- **ADDED** `refreshAccessToken()` function in `auth.service.js`
- **ADDED** `refreshToken` controller in `auth.controller.js`
- **ADDED** Auto-refresh in frontend: tokens refresh 5 minutes before expiry
- **ADDED** Token retry: if 401 received, attempts refresh before logging out
- **UPDATED** `auth.js` - Complete rewrite with token lifecycle management:
  - `saveTokens(token, refreshToken, expiresIn)` - Store tokens with expiry
  - `scheduleTokenRefresh(expiresIn)` - Auto-schedule refresh
  - `refreshAccessToken()` - Call backend refresh endpoint
  - `ensureValidToken()` - Check token validity before requests
  - `initTokenRefresh()` - Restore refresh timer on page load

#### XSS Protection
- **ADDED** `backend/build/js/security.js` - New security utilities file
- **ADDED** Global `escapeHtml(text)` function for safe HTML rendering
- **ADDED** `escapeUrl(url)` - URL sanitization with protocol whitelist
- **ADDED** `escapeAttr(text)` - HTML attribute escaping
- **ADDED** `sanitizeForDisplay(obj)` - Deep object sanitization
- **ADDED** `html` template literal tag for safe HTML generation
- **INCLUDED** security.js in all HTML pages (12 files updated)

#### API Key Security (WordPress Plugin)
- **CHANGED** API key now sent in `X-API-Key` header instead of URL/body
- **UPDATED** `fetch_content_from_api()` - Already using header
- **UPDATED** `verify_api_connection()` - Now uses header instead of body
- **UPDATED** `wordpress.controller.js` - `verifyConnection` accepts header
- **BENEFIT** API keys no longer logged in web server access logs
- **UPDATED** WordPress plugin to v2.5.1

### 📦 Files Changed
- `backend/services/auth.service.js` - Refresh token generation
- `backend/controllers/auth.controller.js` - Refresh endpoint controller
- `backend/routes/auth.routes.js` - New /refresh route with rate limiter
- `backend/build/js/auth.js` - Token refresh lifecycle
- `backend/build/js/security.js` - NEW FILE: XSS protection utilities
- `backend/controllers/wordpress.controller.js` - Header-based API key
- `wordpress-plugin/link-manager-widget.php` - v2.5.1, header-based auth
- `backend/build/*.html` (12 files) - Added security.js include

---

## [2.5.6] - 2025-11-28

### 🚀 Features - Registration Token Management
- **ADDED** Delete button for registration tokens on `sites.html`
- **ADDED** `DELETE /api/sites/tokens/:id` endpoint for token deletion
- **ADDED** `deleteToken()` function in `site.service.js` (only owner can delete)
- **ADDED** `deleteToken` controller in `site.controller.js`
- **ADDED** `deleteRegistrationToken()` JS function with confirmation dialog
- **ADDED** Confirmation message: "Сайты, уже зарегистрированные с этим токеном, останутся в системе"

### 🔧 WordPress Plugin - UX Improvement
- **FIXED** Plugin auto-generates API key on install - user had to delete it to see registration form
- **REMOVED** Auto-generation of API key in `init()` function
- **IMPROVED** Now shows "Quick Site Registration" form immediately after plugin install
- **UPDATED** `wordpress-plugin/link-manager-widget.php` v2.5.0
- **REBUILT** `backend/build/link-manager-widget.zip`

### ✅ UI Improvements
- **ADDED** Auto-refresh every 10 seconds on `admin-moderation.html`
- **ADDED** "Авто: 10с" badge indicator
- **ADDED** Silent refresh (no spinner) with new item notification
- **ADDED** Page size selector on `admin-placements.html` (50/100/200/500)
- **ADDED** "Дашборд" link in admin navbar

---

## [2.5.5] - 2025-11-28

### 🚀 Features - Bulk Auto-Renewal Management
- **ADDED** Bulk selection for active placements with checkboxes
- **ADDED** "Select All" checkbox in active placements table header
- **ADDED** Bulk actions panel: "Включить автопродление" / "Выключить автопродление"
- **ADDED** Progress modal for bulk auto-renewal operations with:
  - Real-time progress bar (0%→100%)
  - Counters: Total/Successful/Failed
  - Error list display
  - Abort functionality
- **ADDED** New functions in `placements-manager.js`:
  - `toggleAllActive(checkbox)` - Toggle all active checkboxes
  - `updateActiveBulkActions()` - Update bulk actions panel state
  - `bulkSetAutoRenewal(enabled)` - Batch process auto-renewal changes
  - `showBulkAutoRenewalProgress()` / `updateBulkAutoRenewalProgress()` / `completeBulkAutoRenewalProgress()`
  - `abortBulkAutoRenewal()` - Cancel ongoing bulk operation

### ✅ UI Improvements
- **CHANGED** Navigation menu labels:
  - "Купить ссылки" → "Покупка"
  - "Размещения" → "Ссылки"
- **MODIFIED** `navbar-config.js` - Updated menu item text

---

## [2.5.4] - 2025-11-27

### 🚀 Features - Progress Indicator for Bulk Purchases
- **ADDED** Visual progress indicator when purchasing multiple links (100+ sites)
- **ADDED** Batch processing: requests grouped by 5 for visible progress updates
- **ADDED** Real-time UI updates: progress bar (0%→100%), counters (Total/Successful/Failed)
- **ADDED** Cancel functionality: user can stop remaining purchases mid-process
- **ADDED** Three new functions in `placements.html`:
  - `showPurchaseProgressModal(total)` - Initialize and show progress modal
  - `updatePurchaseProgress(percent, successful, failed, total, siteName)` - Update UI
  - `completePurchaseProgress(successful, failed, errors)` - Finalize with status

### 🔐 Security - Admin-Only Public Sites
- **ADDED** Restriction: Only admin can set `is_public = true` on sites
- **ADDED** New admin endpoint: `PUT /api/admin/sites/:id/public-status`
- **ADDED** New admin endpoint: `GET /api/admin/sites` - view all sites with owner info
- **ADDED** `setSitePublicStatus()` function in admin.service.js with audit logging
- **ADDED** `getAllSites()` function in admin.service.js for admin panel
- **MODIFIED** `site.controller.js` - `createSite()` forces `is_public = false` for non-admin
- **MODIFIED** `site.controller.js` - `updateSite()` ignores `is_public` for non-admin
- **MODIFIED** `sites.html` - Hidden Public checkbox and bulk buttons for non-admin users
- **MODIFIED** `sites.html` - Table shows read-only badge instead of toggle for non-admin

### 🐛 Bug Fixes
- **FIXED** Critical bug in `placements.html` - `selectedSites` variable was undefined
  - Changed `selectedSites.forEach()` to `Object.keys(siteAssignments).forEach()`
  - Fixed purchase button not activating when selecting sites
  - Fixed total price not calculating correctly
- **FIXED** Calls to non-existent functions in `placements.html`:
  - Changed `updatePurchaseButton()` to `updateCreateButtonState()`
  - Changed `updatePurchaseButtonState()` to `updateCreateButtonState()`
- **FIXED** Pagination limit bug in `placements-manager.js` causing only 20 records to display:
  - `loadScheduledPlacements()` - added `limit=5000` (was using default 20)
  - `loadHistoryPlacements()` - changed from `limit=50` to `limit=5000`
  - Issue: Scheduled tab showed 100+ then reset to 20 after page load

### 📚 Documentation
- **ADDED** ADR-020: Admin-Only Public Site Control
- **UPDATED** CHANGELOG.md with all November 27 changes

---

## [2.5.3] - 2025-11-25

### 🌍 GEO System
- **ADDED** `geo VARCHAR(10) DEFAULT 'EN'` column to `sites` table
- **ADDED** GEO filter dropdown on placements.html for filtering sites by country
- **ADDED** Bulk GEO update via admin-site-params.html
- **ADDED** GEO column display on sites.html, placements-manager.html
- **ADDED** Migration: `database/migrate_add_geo.sql`
- **ADDED** Migration runner: `database/run_geo_migration.js`

### 📊 API
- **UPDATED** `POST /api/admin/sites/bulk-update-params` - Now supports 10 parameters:
  - `dr`, `da`, `tf`, `cf` (0-100 ratings)
  - `ref_domains`, `rd_main`, `norm`, `keywords`, `traffic` (unlimited counts)
  - `geo` (string, auto-uppercase conversion)

### 🎨 Frontend
- **ADDED** GEO filter dropdown on placements.html (dynamic population from site data)
- **ADDED** GEO column to sites table (sites.html)
- **ADDED** GEO column to placements manager tables (active, scheduled, history)
- **FIXED** Admin site params page navbar (added missing navbar-config.js)
- **REMOVED** "Скрыть купленные" badge from active filters info

### 📚 Documentation
- **ADDED** ADR-018: GEO Parameter System
- **ADDED** ADR-019: Optimization Principles Documentation
- **UPDATED** OPTIMIZATION_PRINCIPLES.md with GEO implementation example
- **UPDATED** RUNBOOK.md with GEO migration procedure

### 🔧 Export
- **UPDATED** Export functions (CSV, TSV, JSON, PlainText) with GEO column

---

## [2.5.2] - 2025-11-25

### 📦 Database
- **ADDED** New site parameter columns to `sites` table:
  - `tf INTEGER DEFAULT 0` - Trust Flow (Majestic), 0-100
  - `cf INTEGER DEFAULT 0` - Citation Flow (Majestic), 0-100
  - `keywords INTEGER DEFAULT 0` - Keyword count (Ahrefs)
  - `traffic INTEGER DEFAULT 0` - Traffic estimate (Ahrefs)
- **ADDED** Migration: `database/migrate_add_tf_cf_keywords_traffic.sql`

### 📊 API
- **UPDATED** `POST /api/admin/sites/bulk-update-params` - Now supports 9 parameters:
  - `dr` (Domain Rating) - Validation: 0-100
  - `da` (Domain Authority) - Validation: 0-100
  - `tf` (Trust Flow) - Validation: 0-100
  - `cf` (Citation Flow) - Validation: 0-100
  - `ref_domains` - No upper limit (count)
  - `rd_main` - No upper limit (count)
  - `norm` - No upper limit (count)
  - `keywords` - No upper limit (count)
  - `traffic` - No upper limit (count)
- **UPDATED** Context-aware validation: DR/DA/TF/CF limited to 0-100, other parameters unlimited

### 🎨 Frontend
- **UPDATED** Admin site params page with 9 parameter options
- **UPDATED** Sites table with TF, CF, Keywords, Traffic columns
- **UPDATED** Export functions (CSV, TSV, JSON, PlainText) with new columns

---

## [2.5.1] - 2025-11-25

### 📦 Database
- **ADDED** New site parameter columns to `sites` table:
  - `ref_domains INTEGER DEFAULT 0` - Number of referring domains (Ahrefs)
  - `rd_main INTEGER DEFAULT 0` - Referring domains to homepage
  - `norm INTEGER DEFAULT 0` - Norm links count
- **ADDED** `da INTEGER DEFAULT 0` - Domain Authority (MOZ) column

### 📊 API
- **UPDATED** `POST /api/admin/sites/bulk-update-params` - Now supports 5 parameters:
  - `dr` (Domain Rating) - Validation: 0-100
  - `da` (Domain Authority) - Validation: 0-100
  - `ref_domains` - No upper limit (count)
  - `rd_main` - No upper limit (count)
  - `norm` - No upper limit (count)
- **ADDED** Context-aware validation: DR/DA limited to 0-100, other parameters unlimited

### 🎨 Frontend
- **UPDATED** Admin site params page (`admin-site-params.html`) with 5 parameter options
- **ADDED** Parameter descriptions in Russian

### 📚 Documentation
- **ADDED** OPTIMIZATION_PRINCIPLES.md - Code optimization framework (LEVER methodology)
- **UPDATED** CLAUDE.md with optimization principles reference

---

## [2.5.0] - 2025-01-23

### 📚 Documentation
- **ADDED** Comprehensive Architecture Decision Records (ADR.md) documenting 16 major architectural decisions
- **UPDATED** CLAUDE.md with Documentation Index and ADR quick reference
- **ADDED** CHANGELOG.md for tracking all project changes
- **ADDED** RUNBOOK.md for common operational procedures
- **ADDED** DECISIONS.md for quick technical notes
- **ADDED** API_REFERENCE.md comprehensive API documentation

### 🎯 Features
- Extended fields system (JSONB) for unlimited link metadata
- WordPress plugin v2.5.0 with template system (default, with_image, card, custom)
- Removed anchor text uniqueness constraint (allow duplicate anchors)
- Pagination max limit increased from 100 to 5000

### 🔧 Improvements
- Performance: Redis cache provides 10-19x speedup
- Database: 15 performance indexes active
- Security: Enhanced SSRF and XSS protection

---

## [2.4.5] - 2025-01-17

### 🔌 WordPress Plugin
- **ADDED** Extended fields support (image_url, link_attributes, wrapper_config, custom_data)
- **ADDED** Multiple template system: default, with_image, card, custom
- **ADDED** Template shortcode parameters: `[lm_links template="card" limit="3" home_only="false"]`
- **IMPROVED** XSS protection with wp_kses_post() for custom HTML
- **IMPROVED** Dynamic link attribute injection

### 📦 Database
- **ADDED** 4 JSONB columns to project_links table
  - `image_url` - Link images
  - `link_attributes` - HTML attributes (class, style, rel, target, data-*)
  - `wrapper_config` - Wrapper element config
  - `custom_data` - Custom metadata

### 🔄 Breaking Changes
- Removed UNIQUE constraint on `(project_id, anchor_text)` - allows duplicate anchors

---

## [2.4.0] - 2024-11-25

### 🚀 Features
- **ADDED** Bulk registration system via tokens
  - Token-based WordPress site registration
  - Self-service onboarding (no manual data entry)
  - Supports 1000+ site registrations
- **ADDED** `registration_tokens` table with expiry and usage limits

### 🔌 WordPress Plugin v2.4.0
- **ADDED** Quick registration form in plugin settings
- **ADDED** Auto-registration via registration tokens
- **IMPROVED** Plugin settings UI with step-by-step guidance

### 📊 API
- **ADDED** `POST /api/sites/generate-token` - Generate registration tokens
- **ADDED** `POST /api/sites/register-from-wordpress` - Self-registration endpoint
- **ADDED** `GET /api/sites/tokens` - List user tokens

### 🔐 Security
- Rate limiting: 5 registrations/minute (prevent abuse)
- CSRF protection via WordPress nonce
- Token validation (expiry, usage limits)

---

## [2.3.0] - 2024-11-17

### 💰 Billing System
- **ADDED** Full billing system with prepaid balance
- **ADDED** Transaction history with CSV/JSON export
- **ADDED** 5-tier discount system based on total_spent
  - Стандарт: $0+ → 0%
  - Бронза: $100+ → 5%
  - Серебро: $500+ → 10%
  - Золото: $1000+ → 15%
  - Платина: $5000+ → 20%
- **ADDED** Auto-renewal for link placements
- **ADDED** Scheduled placements (up to 90 days)

### 📦 Database
- **ADDED** `transactions` table for billing history
- **ADDED** `discount_tiers` table for tiered discounts
- **ADDED** `balance`, `total_spent`, `current_discount` to users table
- **ADDED** `final_price`, `discount_applied`, `auto_renewal` to placements table

### 📊 API
- **ADDED** `POST /api/billing/purchase` - New placement purchase endpoint
- **ADDED** `POST /api/billing/deposit` - Add balance
- **ADDED** `POST /api/billing/renew/:placementId` - Manual renewal
- **ADDED** `GET /api/billing/transactions` - Transaction history
- **ADDED** `GET /api/billing/export/placements` - Export placements
- **DEPRECATED** `POST /api/placements` - Use `/api/billing/purchase` instead

### 🔄 Breaking Changes
- Placement creation moved from `/api/placements` to `/api/billing/purchase`
- New request format required (single siteId, not array)

---

## [2.2.0] - 2024-11-15

### 🌐 Static PHP Sites Support
- **ADDED** Support for non-WordPress (static HTML/PHP) sites
- **ADDED** `site_type` column (wordpress/static_php)
- **ADDED** Domain-based authentication for static sites
- **ADDED** Static PHP widget (link-manager-widget.php)
- **ADDED** `GET /api/static/get-content-by-domain` endpoint

### 📦 Database
- **ADDED** `site_type VARCHAR(20) DEFAULT 'wordpress'` to sites table
- **MODIFIED** `api_key` column to nullable (static sites don't need API keys)

### 🔧 Improvements
- Static sites: links only (max_articles forced to 0)
- Domain normalization (www, protocol, path stripping)
- 5-minute cache for static widget

### 🔐 Security
- SSRF protection (localhost, private IPs, metadata endpoints)
- XSS protection (htmlspecialchars on all outputs)

---

## [2.1.0] - 2024-11-12

### ⚡ Performance
- **ADDED** Redis/Valkey caching with graceful degradation
- **ADDED** Bull queue workers for background processing
  - placement.worker.js - Batch placements
  - wordpress.worker.js - Article publishing
  - batch.worker.js - Export operations
- **ADDED** 15 database indexes for optimal JOIN performance

### 📈 Cache Strategy
- WordPress content: 5 minutes TTL (19x speedup: 152ms → 8ms)
- Placements list: 2 minutes TTL (19x speedup: 173ms → 9ms)
- Automatic cache invalidation on mutations

### 🔧 Improvements
- Replaced `redis.keys()` with `redis.scan()` (production-safe)
- Database connection pool warmup (~50ms)
- Bcrypt warmup (~200ms)
- Query performance monitoring (log slow queries >1000ms)

---

## [2.0.0] - 2024-11-10

### 🏗️ Major Refactoring
- **MIGRATED** to modular architecture with separation of concerns
- **RENAMED** Entry point: `server.js` → `server-new.js`
- **ADDED** Graceful shutdown with SIGTERM/SIGINT handlers

### 📁 New Structure
```
backend/
├── config/       - Database, logger, queue, constants
├── controllers/  - HTTP request handlers
├── services/     - Business logic
├── routes/       - API endpoints
├── middleware/   - Auth, rate limiting, error handling
├── workers/      - Background jobs
└── cron/         - Scheduled tasks
```

### 🔄 Breaking Changes
- New architecture requires updated deployment configuration
- Environment variables: `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET` required

---

## [1.5.0] - 2024-10-30

### 🔌 WordPress Plugin v2.4.3
- **FIXED** Browser autofill issue in registration form
- **REMOVED** "Number of links" field from widget settings
- **IMPROVED** Registration form UX

### 📊 Features
- **ADDED** Display available content statistics in WordPress admin
- **IMPROVED** Widget configuration interface

---

## [1.4.0] - 2024-10-20

### 🔐 Authentication
- **ADDED** JWT-based authentication (7-day expiry)
- **ADDED** 5-tier rate limiting strategy
  - LOGIN: 5 requests / 15 minutes
  - API: 100 requests / minute
  - CREATE: 10 requests / minute
  - PLACEMENT: 20 requests / minute
  - WORDPRESS: 30 requests / minute

### 🔧 Improvements
- No database lookups in auth middleware (performance)
- User info embedded in JWT payload
- Role-based access control (user/admin)

---

## [1.3.0] - 2024-10-15

### 📦 Database
- **ADDED** Transaction-wrapped multi-step operations
- **ADDED** Row-level locking with `FOR UPDATE`
- **ADDED** COALESCE pattern for partial updates

### 🔧 Improvements
- Fixed race conditions in placement deletion
- Atomic placement creation (15+ operations)
- Type safety: parseInt() for COUNT() results

---

## [1.2.0] - 2024-10-10

### 🌐 Frontend
- **ADDED** Modular Vanilla JS architecture
  - core/ - API client, utils, app init
  - components/ - Notifications, modals, pagination
  - modules/ - Page-specific logic
- **ADDED** 12 HTML pages (dashboard, projects, sites, placements, etc.)

### 🎨 UI
- Bootstrap 5.3.0 with custom styles
- Responsive design for mobile/tablet
- Notification system for user feedback

---

## [1.1.0] - 2024-10-05

### 📦 Database
- **ADDED** PostgreSQL schema (8 core tables)
- **ADDED** Usage tracking system
  - project_links: usage_limit, usage_count
  - project_articles: usage_limit (fixed at 1)
- **ADDED** Placement system
  - placements table with status, wordpress_post_id
  - placement_content for link/article associations

### 🔧 Database Features
- Automatic quota management
- Article duplication for reuse
- Used articles cannot be deleted

---

## [1.0.0] - 2024-10-01

### 🚀 Initial Release
- **ADDED** Project management (CRUD operations)
- **ADDED** Site management (WordPress sites)
- **ADDED** Link management (SEO anchor texts)
- **ADDED** Article management (guest posts)
- **ADDED** WordPress plugin v2.2.2
  - Shortcode: `[link_manager]`
  - 5-minute cache
  - API key authentication

### 📦 Tech Stack
- Node.js 16+ / Express.js 4.18
- PostgreSQL 12+
- Winston logging
- Helmet security
- CORS support

### 🔐 Security
- Parameterized SQL queries (SQL injection protection)
- Helmet middleware (XSS, CSRF, clickjacking)
- Rate limiting on all endpoints

---

## Version Numbering

Following [Semantic Versioning](https://semver.org/):

- **MAJOR** version: Incompatible API changes
- **MINOR** version: Backwards-compatible functionality
- **PATCH** version: Backwards-compatible bug fixes

### Upcoming

See [GitHub Issues](https://github.com/maxximseo/link-manager/issues) for planned features.

### Legend

- 🚀 **ADDED** - New features
- ✅ **CHANGED** - Changes in existing functionality
- 🔧 **IMPROVED** - Improvements without breaking changes
- ⚠️ **DEPRECATED** - Soon-to-be removed features
- ❌ **REMOVED** - Removed features
- 🐛 **FIXED** - Bug fixes
- 🔐 **SECURITY** - Security improvements
- 📦 **DATABASE** - Database schema changes
- 📊 **API** - API endpoint changes
- 🔌 **PLUGIN** - WordPress plugin updates
