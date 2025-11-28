# Changelog

All notable changes to the Link Manager project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
