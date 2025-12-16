# Link Manager PRD

## Product Overview

Link Manager is a B2B SaaS platform for managing link and article placements on WordPress and static PHP websites. It provides a marketplace for SEO professionals to purchase link placements on third-party sites with automated publishing.

## Core Features

### 1. Authentication System
- User registration with email verification
- JWT-based authentication (7-day token expiry)
- Role-based access control (admin/user)
- Rate-limited login (5 attempts per 15 minutes)
- Admin IP whitelist protection

### 2. Project Management
- Create, update, delete projects
- Manage links within projects (anchor text, URL, extended fields)
- Manage articles within projects (title, content)
- Bulk link import functionality
- Usage tracking (usage_count, usage_limit)

### 3. Site Management
- WordPress sites with API key authentication
- Static PHP sites with domain-based auth
- Site metrics: DR, DA, Traffic, Keywords
- Public marketplace for site discovery
- Registration tokens for bulk WordPress registration
- Site quotas (max_links, max_articles)

### 4. Placement System
- Purchase link/article placements via billing API
- Scheduled placements (up to 90 days in future)
- Auto-renewal for link placements
- WordPress article auto-publishing
- One placement per site per project restriction

### 5. Billing System
- Prepaid balance model
- 5-tier discount system (0%, 5%, 10%, 15%, 20%)
- Transaction history
- Promo codes with first-deposit bonuses
- CSV/JSON export functionality

### 6. Referral System
- Unique referral codes per user
- 10% commission on referred user spending
- Referral balance withdrawal to main balance
- USDT TRC20 wallet withdrawals ($200 minimum)

### 7. Notification System
- User notifications with read status
- Admin security alerts
- Redis-cached notification queries

### 8. Admin Features
- Dashboard statistics
- User management with balance adjustments
- Placement moderation (approve/reject)
- Site moderation for marketplace
- Bulk parameter updates (DR, DA, etc.)
- Refund processing

## Technical Requirements

### Performance
- Redis caching (5-minute TTL for WordPress API)
- Pagination limits up to 5000 records
- Bull queue workers for background processing
- Database connection pooling (25 connections)

### Security
- Helmet.js security headers
- CORS configuration
- Rate limiting (5-tier strategy)
- Parameterized SQL queries only
- XSS protection in frontend

### Database
- PostgreSQL (Supabase)
- Transaction-wrapped multi-step operations
- Row-level locking for race condition prevention

## User Roles

### Regular Users
- Manage own projects, links, articles
- Purchase placements from marketplace
- View transaction history
- Referral program participation

### Administrators
- All user capabilities
- User balance adjustments
- Placement moderation
- Site public status control
- Bulk site parameter updates
- Refund processing
