# API Reference

Complete reference for all API endpoints in Link Manager system.

**Base URL**: `http://localhost:3003/api` (development)
**Production URL**: `https://shark-app-9kv6u.ondigitalocean.app/api`
**API Version**: 2.6.12
**Last Updated**: December 2025

---

## Table of Contents

1. [Authentication](#authentication)
2. [Projects](#projects)
3. [Sites](#sites)
4. [Placements](#placements)
5. [Billing](#billing)
6. [Payments (CryptoCloud)](#payments-cryptocloud)
7. [WordPress Integration](#wordpress-integration)
8. [Static PHP Sites](#static-php-sites)
9. [Admin](#admin)
10. [Webhooks](#webhooks)
11. [Error Codes](#error-codes)
12. [Rate Limits](#rate-limits)

---

## Authentication

All endpoints except `/auth/login`, `/auth/register`, and `/wordpress/*` require JWT authentication.

**Header Format**:
```http
Authorization: Bearer <jwt-token>
```

### POST /api/auth/login

Authenticate user and receive JWT token.

**Request**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response** (200 OK):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Token Lifecycle** (v2.5.7+):
- Access token: 1 hour expiry (reduced from 7 days for security)
- Refresh token: 7 days expiry (for seamless session continuation)
- Frontend auto-refreshes 5 minutes before expiry

**Errors**:
- `401 Unauthorized` - Invalid credentials
- `429 Too Many Requests` - Rate limit exceeded (5 attempts / 15 minutes)

**Rate Limit**: 5 requests / 15 minutes

---

### POST /api/auth/refresh

Refresh access token using refresh token. No authentication header required.

**Request**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**Errors**:
- `400 Bad Request` - Refresh token not provided
- `401 Unauthorized` - Invalid/expired refresh token, or account locked
- `429 Too Many Requests` - Rate limit exceeded

**Rate Limit**: 10 requests / 1 minute

---

### POST /api/auth/register

Register new user account.

**Request**:
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 2,
      "username": "newuser",
      "email": "user@example.com",
      "role": "user"
    }
  }
}
```

**Validation**:
- `username`: 3-50 characters, alphanumeric + underscore
- `email`: Valid email format
- `password`: Minimum 6 characters

**Errors**:
- `400 Bad Request` - Validation failed
- `409 Conflict` - Username or email already exists

---

## Projects

Manage SEO link placement projects.

### GET /api/projects

List all projects for authenticated user.

**Query Parameters**:
- `page` (integer, optional) - Page number (default: 1)
- `limit` (integer, optional) - Items per page (default: 20, max: 5000)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "name": "SEO Campaign 2025",
      "description": "Main SEO campaign",
      "link_count": 150,
      "article_count": 25,
      "created_at": "2025-01-15T10:00:00.000Z",
      "updated_at": "2025-01-20T14:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Rate Limit**: 100 requests / minute

---

### POST /api/projects

Create new project.

**Request**:
```json
{
  "name": "New SEO Campaign",
  "description": "Campaign for Q1 2025"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "user_id": 1,
    "name": "New SEO Campaign",
    "description": "Campaign for Q1 2025",
    "created_at": "2025-01-23T12:00:00.000Z"
  }
}
```

**Validation**:
- `name`: Required, 1-255 characters
- `description`: Optional, max 1000 characters

**Rate Limit**: 10 requests / minute

---

### PUT /api/projects/:id

Update existing project.

**Request**:
```json
{
  "name": "Updated Campaign Name",
  "description": "Updated description"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Updated Campaign Name",
    "description": "Updated description",
    "updated_at": "2025-01-23T12:05:00.000Z"
  }
}
```

**Note**: Partial updates supported (COALESCE pattern). Only provided fields are updated.

**Errors**:
- `404 Not Found` - Project doesn't exist or not owned by user

---

### DELETE /api/projects/:id

Delete project and all associated links/articles.

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**⚠️ Warning**: This is a CASCADE delete. All links, articles, and placements associated with this project will be deleted.

---

### GET /api/projects/:id/links

Get all links for a project.

**Query Parameters**:
- `page` (integer, optional) - Page number
- `limit` (integer, optional) - Items per page (max: 5000)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": 1,
      "url": "https://example.com/page1",
      "anchor_text": "Best Product 2025",
      "usage_count": 5,
      "usage_limit": 999,
      "image_url": "https://example.com/icon.png",
      "link_attributes": {
        "class": "btn btn-primary",
        "target": "_blank"
      },
      "wrapper_config": {
        "wrapper_tag": "div",
        "wrapper_class": "featured-link"
      },
      "custom_data": {
        "description": "Top product",
        "category": "premium"
      },
      "created_at": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

**Extended Fields** (v2.5.0+):
- `image_url` (string, nullable) - Image URL for link
- `link_attributes` (JSONB, nullable) - Custom HTML attributes
- `wrapper_config` (JSONB, nullable) - Wrapper element config
- `custom_data` (JSONB, nullable) - Custom metadata

---

### POST /api/projects/:id/links

Add new link to project.

**Request**:
```json
{
  "url": "https://example.com/product",
  "anchor_text": "Buy Now",
  "image_url": "https://example.com/icon.png",
  "link_attributes": {
    "class": "btn btn-primary",
    "style": "color: red;",
    "target": "_blank"
  },
  "wrapper_config": {
    "wrapper_tag": "div",
    "wrapper_class": "cta-box",
    "wrapper_style": "border: 2px solid gold;"
  },
  "custom_data": {
    "description": "Special offer",
    "category": "featured"
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 123,
    "project_id": 1,
    "url": "https://example.com/product",
    "anchor_text": "Buy Now",
    "usage_count": 0,
    "usage_limit": 999,
    "image_url": "https://example.com/icon.png",
    "link_attributes": {...},
    "wrapper_config": {...},
    "custom_data": {...},
    "created_at": "2025-01-23T12:00:00.000Z"
  }
}
```

**Validation**:
- `url`: Required, valid URL format (http/https)
- `anchor_text`: Required, 1-255 characters
- `image_url`: Optional, valid URL
- Extended fields: Optional, max 10KB each

**Note**: Duplicate anchor texts are allowed (since v2.5.0)

---

### PUT /api/projects/:id/links/:linkId

Update an existing link.

**Request Body** (all fields optional):
```json
{
  "url": "https://example.com/updated-page",
  "anchor_text": "Updated anchor text",
  "usage_limit": 5,
  "html_context": "Updated context with <a href=\"...\">link</a> in text",
  "image_url": "https://example.com/image.png",
  "link_attributes": {
    "class": "btn btn-primary",
    "rel": "sponsored"
  },
  "wrapper_config": {
    "wrapper_tag": "div",
    "wrapper_class": "featured"
  },
  "custom_data": {}
}
```

**Response** (200 OK):
```json
{
  "id": 123,
  "project_id": 1,
  "url": "https://example.com/updated-page",
  "anchor_text": "Updated anchor text",
  "usage_limit": 5,
  "usage_count": 0,
  "html_context": "Updated context with <a href=\"...\">link</a> in text",
  "image_url": "https://example.com/image.png",
  "link_attributes": {"class": "btn btn-primary", "rel": "sponsored"},
  "wrapper_config": {"wrapper_tag": "div", "wrapper_class": "featured"},
  "custom_data": {},
  "created_at": "2025-01-15T10:00:00.000Z",
  "updated_at": "2025-12-11T14:30:00.000Z"
}
```

**Features**:
- Partial updates supported (only send fields to change)
- Uses COALESCE pattern - omitted fields retain current values
- `updated_at` automatically set to current timestamp

**Errors**:
- `400 Bad Request` - Invalid field values
- `404 Not Found` - Link not found or not owned by user

---

### DELETE /api/projects/:id/links/:linkId

Delete link from project.

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Link deleted successfully"
}
```

**Errors**:
- `400 Bad Request` - Link is in use (placements exist)
- `404 Not Found` - Link not found

---

### GET /api/projects/:id/articles

Get all articles for a project.

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": 1,
      "title": "How to Choose the Best Product",
      "content": "<p>Article content...</p>",
      "usage_count": 1,
      "usage_limit": 1,
      "created_at": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

**Note**: Articles have `usage_limit: 1` (single-use). Used articles cannot be deleted.

---

### POST /api/projects/:id/articles

Add new article to project.

**Request**:
```json
{
  "title": "Article Title",
  "content": "<p>Article content in HTML...</p>"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "project_id": 1,
    "title": "Article Title",
    "content": "<p>Article content...</p>",
    "usage_count": 0,
    "usage_limit": 1,
    "created_at": "2025-01-23T12:00:00.000Z"
  }
}
```

**Validation**:
- `title`: Required, 1-500 characters
- `content`: Required, HTML content

---

### POST /api/projects/:id/articles/:articleId/duplicate

Duplicate article for reuse (creates new article with same content but fresh usage_count).

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 3,
    "project_id": 1,
    "title": "Article Title (Copy)",
    "content": "<p>Article content...</p>",
    "usage_count": 0,
    "usage_limit": 1,
    "created_at": "2025-01-23T12:05:00.000Z"
  }
}
```

---

## Sites

Manage WordPress and static PHP sites.

### GET /api/sites

List all sites for authenticated user.

**Query Parameters**:
- `page` (integer, optional) - Page number
- `limit` (integer, optional) - Items per page (max: 5000)
- `site_type` (string, optional) - Filter by type: `wordpress` or `static_php`
- `is_public` (boolean, optional) - Filter by visibility

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "site_name": "My Blog",
      "site_url": "https://myblog.com",
      "site_type": "wordpress",
      "api_key": "api_abc123...",
      "allow_articles": true,
      "is_public": false,
      "available_for_purchase": true,
      "max_links": 10,
      "used_links": 3,
      "max_articles": 5,
      "used_articles": 1,
      "created_at": "2025-01-10T10:00:00.000Z"
    }
  ]
}
```

**Site Types**:
- `wordpress` - WordPress sites with plugin (supports links + articles)
- `static_php` - Static HTML/PHP sites (links only, api_key nullable)

---

### POST /api/sites

Create new site.

**Request (WordPress)**:
```json
{
  "site_name": "My WordPress Blog",
  "site_url": "https://example.com",
  "site_type": "wordpress",
  "api_key": "api_generated_by_plugin",
  "max_links": 10,
  "max_articles": 5,
  "allow_articles": true,
  "is_public": false
}
```

**Request (Static PHP)**:
```json
{
  "site_name": "Static Site",
  "site_url": "https://static-site.com",
  "site_type": "static_php",
  "max_links": 20
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "site_name": "My WordPress Blog",
    "site_url": "https://example.com",
    "site_type": "wordpress",
    "api_key": "api_generated_by_plugin",
    "max_links": 10,
    "used_links": 0,
    "max_articles": 5,
    "used_articles": 0,
    "created_at": "2025-01-23T12:00:00.000Z"
  }
}
```

**Validation**:
- `site_url`: Required, valid URL (SSRF protection applied)
- `site_type`: Optional, default `wordpress`
- `api_key`: Optional for static_php, required for wordpress
- Static sites: `max_articles` forced to 0

**Security**: Blocks localhost, private IPs, cloud metadata endpoints

**Rate Limit**: 10 requests / minute

---

### POST /api/sites/generate-token

Generate registration token for bulk WordPress site registration.

**Request**:
```json
{
  "label": "January 2025 Batch",
  "max_uses": 10,
  "expires_in_days": 30
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "token": "reg_abc123def456...",
    "label": "January 2025 Batch",
    "max_uses": 10,
    "expires_at": "2025-02-22T12:00:00.000Z",
    "created_at": "2025-01-23T12:00:00.000Z"
  }
}
```

**Token Format**: `reg_` + 64 hex characters (128 chars total)

**Rate Limit**: 100 requests / minute

---

### POST /api/sites/register-from-wordpress

Self-registration endpoint for WordPress sites using token (NO AUTH REQUIRED).

**Request**:
```json
{
  "registration_token": "reg_abc123def456...",
  "site_url": "https://new-blog.com",
  "api_key": "api_auto_generated"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "site_id": 123,
    "site_url": "https://new-blog.com",
    "api_key": "api_auto_generated"
  }
}
```

**Validation**:
- Token must be valid, not expired, and not exhausted
- Site URL must not already exist for the token owner

**Rate Limit**: 5 requests / minute (prevent abuse)

---

### GET /api/sites/tokens

List all registration tokens for authenticated user.

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": 1,
      "token": "reg_abc123...",
      "label": "January 2025 Batch",
      "max_uses": 10,
      "current_uses": 3,
      "expires_at": "2025-02-22T12:00:00.000Z",
      "created_at": "2025-01-23T12:00:00.000Z"
    }
  ]
}
```

**Rate Limit**: 100 requests / minute

---

### DELETE /api/sites/tokens/:id

Delete a registration token (only owner can delete).

**Response** (200 OK):
```json
{
  "success": true
}
```

**Errors**:
- 404 Not Found - Token doesn't exist or belongs to another user
- 400 Bad Request - Invalid token ID

**Note**: Sites already registered with this token will remain in the system.

**Rate Limit**: 100 requests / minute

---

## Placements

**⚠️ DEPRECATED**: Use [Billing API](#billing) for new integrations.

### GET /api/placements

List all placements for authenticated user.

**Query Parameters**:
- `page` (integer, optional) - Page number
- `limit` (integer, optional) - Items per page (max: 5000)
- `project_id` (integer, optional) - Filter by project
- `status` (string, optional) - Filter by status: `pending`, `placed`, `failed`

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": 1,
      "site_id": 5,
      "type": "link",
      "status": "placed",
      "final_price": 23.75,
      "original_price": 25.00,
      "discount_applied": 5,
      "wordpress_post_id": 456,
      "site_url": "https://myblog.com",
      "site_name": "My Blog",
      "project_name": "SEO Campaign 2025",
      "link_count": 1,
      "article_count": 0,
      "link_title": "Best Product",
      "placed_at": "2025-01-20T10:00:00.000Z",
      "purchased_at": "2025-01-20T09:55:00.000Z",
      "published_at": "2025-01-20T10:00:15.000Z",
      "expires_at": "2026-01-20T10:00:00.000Z",
      "auto_renewal": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Status Values**:
- `pending` - Awaiting WordPress publication (or scheduled)
- `placed` - Successfully published to WordPress
- `failed` - Publication failed (check logs)

---

### DELETE /api/placements/:id

Delete placement (reduces site quota).

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Placement deleted successfully"
}
```

**⚠️ Warning**: Deletes placement from database and reduces used quotas. Does NOT remove content from WordPress site.

---

## Billing

Primary API for purchasing placements with billing integration.

### GET /api/billing/balance

Get current user balance and discount tier.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "balance": 150.50,
    "totalSpent": 850.00,
    "currentDiscount": 10,
    "discountTier": "Серебро"
  }
}
```

**Discount Tiers**:
- Стандарт: $0+ → 0%
- Бронза: $100+ → 5%
- Серебро: $500+ → 10%
- Золото: $1000+ → 15%
- Платина: $5000+ → 20%

---

### POST /api/billing/deposit

Add balance to user account.

**Request**:
```json
{
  "amount": 100.00,
  "description": "Initial deposit"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "newBalance": 250.50,
    "amount": 100.00
  }
}
```

**Validation**:
- `amount`: $0.01 - $10,000

**Rate Limit**: 50 requests / minute

---

### GET /api/billing/transactions

Get transaction history.

**Query Parameters**:
- `page` (integer, optional) - Page number
- `limit` (integer, optional) - Items per page (max: 50)
- `type` (string, optional) - Filter by type: `deposit`, `purchase`, `renewal`, `refund`

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "type": "purchase",
      "amount": 23.75,
      "description": "Placement purchase: SEO Campaign 2025 → My Blog",
      "balance_before": 250.50,
      "balance_after": 226.75,
      "related_placement_id": 1,
      "created_at": "2025-01-20T09:55:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /api/billing/pricing

Get current pricing with user's discount applied.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "basePrice": {
      "link": 25.00,
      "article": 15.00
    },
    "userDiscount": 10,
    "discountTier": "Серебро",
    "finalPrice": {
      "link": 22.50,
      "article": 13.50
    },
    "renewalDiscount": 30,
    "renewalPrice": {
      "link": 17.50
    }
  }
}
```

---

### POST /api/billing/purchase

**PRIMARY ENDPOINT** for creating placements.

**Request**:
```json
{
  "projectId": 1,
  "siteId": 5,
  "type": "link",
  "contentIds": [123],
  "scheduledDate": "2025-01-25T10:00:00Z",
  "autoRenewal": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "placement": {
      "id": 2,
      "project_id": 1,
      "site_id": 5,
      "type": "link",
      "status": "placed",
      "final_price": 22.50,
      "wordpress_post_id": 789
    },
    "newBalance": 204.25,
    "newDiscount": 10,
    "newTier": "Серебро"
  }
}
```

**Validation**:
- `projectId`: Required, must own project
- `siteId`: Required, site must be available
- `type`: Required, `link` or `article`
- `contentIds`: Required array with exactly 1 ID
- `scheduledDate`: Optional, max 90 days in future
- `autoRenewal`: Optional boolean

**Business Rules**:
1. Sufficient balance required
2. Site must have available quota
3. Content must have usage_count < usage_limit
4. Static PHP sites cannot purchase articles
5. One placement per site per project (no duplicates)

**Errors**:
- `400 Bad Request` - Insufficient balance, no quota, validation error
- `409 Conflict` - Site already purchased for this project

**Rate Limit**: 50 requests / minute (supports bulk operations)

---

### POST /api/billing/renew/:placementId

Renew link placement (extends expiry by 1 year).

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "newExpiryDate": "2027-01-20T10:00:00.000Z",
    "pricePaid": 17.50,
    "newBalance": 186.75
  }
}
```

**Note**: 30% renewal discount applied (base price × 0.7)

**Errors**:
- `400 Bad Request` - Cannot renew articles, insufficient balance

---

### PATCH /api/billing/auto-renewal/:placementId

Toggle auto-renewal for placement.

**Request**:
```json
{
  "enabled": true
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```

---

### GET /api/billing/export/placements

Export user placements to CSV or JSON.

**Query Parameters**:
- `format` (string, optional) - `csv` or `json` (default: csv)
- `project_id` (integer, optional) - Filter by project

**Response** (200 OK):
- **Content-Type**: `text/csv` or `application/json`
- **Headers**: `Content-Disposition: attachment; filename="placements_20250123.csv"`

**CSV Format**:
```csv
ID,Project,Site,Type,Status,Price,Purchased,Published,Expires
1,SEO Campaign,My Blog,link,placed,23.75,2025-01-20,2025-01-20,2026-01-20
```

---

## Payments (CryptoCloud)

Cryptocurrency payment endpoints for balance deposits via CryptoCloud.plus.

**Rate Limit**: 10 invoice creations per minute, 100 requests per minute for other endpoints.

### GET /api/payments/config

Get payment system configuration.

**Response** (200 OK):
```json
{
  "enabled": true,
  "minAmount": 10,
  "maxAmount": 10000,
  "currencies": ["USDT", "BTC", "ETH", "LTC", "TRX", "XMR", "DOGE", "TON"]
}
```

---

### POST /api/payments/create-invoice

Create a new deposit invoice. Returns payment link for cryptocurrency payment.

**Request**:
```json
{
  "amount": 50,
  "email": "user@example.com"  // Optional
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "invoice": {
    "id": 1,
    "orderId": "deposit_1072_1765910209642",
    "amount": 50,
    "paymentLink": "https://pay.cryptocloud.plus/VISBJ5RH",
    "expiresAt": "2025-12-17T18:36:51.879Z",
    "status": "pending"
  }
}
```

**Errors**:
- `400 Bad Request` - Amount below minimum ($10) or above maximum ($10,000)
- `500 Internal Server Error` - Payment system unavailable

---

### GET /api/payments/invoice/:orderId

Get status of a specific invoice.

**Response** (200 OK):
```json
{
  "invoice": {
    "id": 1,
    "orderId": "deposit_1072_1765910209642",
    "amount": 50,
    "status": "pending",
    "paymentLink": "https://pay.cryptocloud.plus/VISBJ5RH",
    "expiresAt": "2025-12-17T18:36:51.879Z",
    "paidAt": null,
    "createdAt": "2025-12-16T18:36:54.534Z"
  }
}
```

**Invoice Statuses**:
- `pending` - Awaiting payment
- `paid` - Payment confirmed, balance added
- `expired` - Invoice expired (24h)
- `cancelled` - Invoice cancelled

---

### GET /api/payments/pending

Get list of active (pending) invoices for current user.

**Response** (200 OK):
```json
{
  "invoices": [
    {
      "id": 2,
      "orderId": "deposit_1072_1765910632824",
      "amount": 15,
      "paymentLink": "https://pay.cryptocloud.plus/J20SS1TM",
      "expiresAt": "2025-12-17T18:43:54.502Z",
      "createdAt": "2025-12-16T18:43:54.918Z"
    }
  ]
}
```

---

### GET /api/payments/history

Get payment history with pagination.

**Query Parameters**:
- `page` (integer, default: 1) - Page number
- `limit` (integer, default: 20, max: 100) - Items per page

**Response** (200 OK):
```json
{
  "payments": [
    {
      "id": 2,
      "orderId": "deposit_1072_1765910632824",
      "amount": 15,
      "status": "paid",
      "cryptoCurrency": "USDT_TRC20",
      "cryptoAmount": 15.00,
      "expiresAt": "2025-12-17T18:43:54.502Z",
      "paidAt": "2025-12-16T19:00:00.000Z",
      "createdAt": "2025-12-16T18:43:54.918Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

---

## Webhooks

Public webhook endpoints for external services. No authentication required (signature verification instead).

### POST /api/webhooks/cryptocloud

CryptoCloud.plus payment notification webhook.

**Security**: JWT signature verification using `CRYPTOCLOUD_SECRET_KEY`.

**Request Body** (from CryptoCloud):
```json
{
  "status": "success",
  "invoice_id": "INV-XXXXXXXX",
  "order_id": "deposit_1072_1765910209642",
  "amount_crypto": "15.00000000",
  "currency": "USDT_TRC20",
  "token": "eyJ..."  // JWT for signature verification
}
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "success": true,
  "message": "Payment processed",
  "userId": 1072,
  "amount": 50
}
```

**Errors**:
- `400 Bad Request` - Invalid JWT signature
- `404 Not Found` - Invoice not found

**Webhook Processing**:
1. Verify JWT signature using secret key
2. Find invoice by `order_id`
3. Check idempotency (skip if already paid)
4. Update invoice status to `paid`
5. Add balance to user account via `billingService.addBalance()`
6. Log transaction details

---

## WordPress Integration

Public endpoints for WordPress plugin integration.

### GET /api/wordpress/get-content

Get published links and articles for WordPress site (NO AUTH - uses API key).

**Query Parameters**:
- `api_key` (string, required) - Site API key from plugin

**Response** (200 OK):
```json
{
  "links": [
    {
      "id": 1,
      "url": "https://example.com/product",
      "anchor_text": "Buy Now",
      "html_context": null,
      "image_url": "https://example.com/icon.png",
      "link_attributes": {
        "class": "btn btn-primary",
        "target": "_blank"
      },
      "wrapper_config": {
        "wrapper_tag": "div",
        "wrapper_class": "cta-box"
      },
      "custom_data": {
        "description": "Special offer",
        "category": "featured"
      }
    }
  ],
  "articles": [
    {
      "id": 1,
      "title": "How to Choose the Best Product",
      "content": "<p>Article content...</p>",
      "slug": "how-to-choose-best-product"
    }
  ]
}
```

**Caching**: 5 minutes TTL (Redis)

**Rate Limit**: 30 requests / minute

---

### POST /api/wordpress/publish-article

Publish article to WordPress site (used internally by placement system).

**Request**:
```json
{
  "site_url": "https://myblog.com",
  "api_key": "api_abc123",
  "article": {
    "title": "Article Title",
    "content": "<p>Article content...</p>",
    "slug": "article-slug"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "post_id": 456,
  "url": "https://myblog.com/article-slug"
}
```

**WordPress Endpoint Called**: `POST /wp-json/link-manager/v1/publish-article`

**Errors**:
- `400 Bad Request` - Invalid site URL, API key mismatch
- `500 Internal Server Error` - WordPress API failure

---

## Static PHP Sites

Public endpoint for static HTML/PHP sites.

### GET /api/static/get-content-by-domain

Get links for static site by domain (NO AUTH).

**Query Parameters**:
- `domain` (string, required) - Site domain (e.g., `example.com`)

**Response** (200 OK):
```json
{
  "links": [
    {
      "url": "https://example.com/product",
      "anchor_text": "Buy Now"
    }
  ],
  "articles": []
}
```

**Domain Normalization**:
- `https://www.example.com/path` → `example.com`
- `http://example.com` → `example.com`

**Caching**: 5 minutes TTL

**Rate Limit**: 30 requests / minute

---

## Admin

Admin-only endpoints (requires `role: admin`).

### GET /api/admin/users

List all users (admin only).

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "balance": 500.00,
      "total_spent": 1500.00,
      "current_discount": 15,
      "created_at": "2024-10-01T10:00:00.000Z"
    }
  ]
}
```

---

### POST /api/admin/clear-cache

Clear all Redis cache (admin only).

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Cache cleared successfully"
}
```

---

### GET /api/admin/sites/with-zero-param

Get sites where a specific parameter is 0 or null.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| parameter | string | `dr` | Parameter name: `dr`, `da`, `ref_domains`, `rd_main`, `norm` |

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "count": 5,
    "parameter": "ref_domains",
    "sites": [
      {
        "id": 1,
        "site_name": "Example Site",
        "site_url": "https://example.com",
        "dr": 45,
        "da": 30,
        "ref_domains": 0,
        "rd_main": 0,
        "norm": 0
      }
    ]
  }
}
```

---

### POST /api/admin/sites/bulk-update-params

Bulk update site parameters (DR, DA, TF, CF, Ref Domains, RD Main, Norm, Keywords, Traffic).

**Request Body:**
```json
{
  "parameter": "ref_domains",
  "updates": [
    { "domain": "example.com", "value": 5432 },
    { "domain": "site.org", "value": 1200 }
  ]
}
```

**Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| parameter | string | One of: `dr`, `da`, `tf`, `cf`, `ref_domains`, `rd_main`, `norm`, `keywords`, `traffic` |
| updates | array | Array of domain/value pairs |
| updates[].domain | string | Domain name (without protocol) |
| updates[].value | integer | New value (min: 0) |

**Supported Parameters:**
| Parameter | Source | Range | Description |
|-----------|--------|-------|-------------|
| dr | Ahrefs | 0-100 | Domain Rating |
| da | MOZ | 0-100 | Domain Authority |
| tf | Majestic | 0-100 | Trust Flow |
| cf | Majestic | 0-100 | Citation Flow |
| ref_domains | Ahrefs | 0-∞ | Referring domains count |
| rd_main | Ahrefs | 0-∞ | Referring domains to homepage |
| norm | - | 0-∞ | Norm links count |
| keywords | Ahrefs | 0-∞ | Keywords count |
| traffic | Ahrefs | 0-∞ | Traffic estimate |

**Validation Rules:**
- `dr`, `da`, `tf`, `cf`: Values must be 0-100 (ratings)
- `ref_domains`, `rd_main`, `norm`, `keywords`, `traffic`: No upper limit (counts)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "total": 10,
    "updated": 8,
    "notFound": 2,
    "errors": 0,
    "details": [
      {
        "domain": "example.com",
        "siteUrl": "https://example.com",
        "status": "updated",
        "oldValue": 0,
        "newValue": 5432,
        "message": "Updated successfully"
      },
      {
        "domain": "unknown.com",
        "status": "not_found",
        "message": "Site not found"
      }
    ]
  }
}
```

**Error Response** (400 Bad Request):
```json
{
  "error": "DR values must be between 0 and 100. Found invalid values for: example.com, site.org"
}
```

---

### GET /api/admin/sites

Get all sites from all users (admin only). Added in v2.5.4.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 50 | Items per page (max: 5000) |
| search | string | - | Search by site URL |
| is_public | boolean | - | Filter by public status |

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "site_name": "Example Site",
      "site_url": "https://example.com",
      "is_public": true,
      "user_id": 123,
      "owner_username": "admin",
      "dr": 45,
      "da": 30,
      "geo": "EN",
      "created_at": "2025-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

**Security**: Admin can see ALL sites from ALL users (for marketplace management).

---

### PUT /api/admin/sites/:id/public-status

Set site public status (admin only). Added in v2.5.4.

**Only admin can make sites public** - regular users cannot set `is_public = true`.

**Request Body:**
```json
{
  "is_public": true
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Site made public successfully",
  "data": {
    "id": 1,
    "site_url": "https://example.com",
    "is_public": true
  }
}
```

**Errors:**
- `400 Bad Request` - Invalid site ID
- `403 Forbidden` - Not admin
- `404 Not Found` - Site not found

**Audit**: All changes logged with admin ID and timestamp.

**See**: [ADR-020](ADR.md#adr-020-admin-only-public-site-control)

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Validation error, missing parameters |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions (not admin) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource (username, site already purchased) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error (check logs) |

---

### Error Response Format

```json
{
  "error": "Failed to create placement",
  "details": "Site \"example.com\" is a static PHP site and does not support article placements"
}
```

**Fields**:
- `error` (string) - High-level error message
- `details` (string, optional) - Specific error details

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Login | 5 requests | 15 minutes |
| General API | 100 requests | 1 minute |
| Create Operations | 10 requests | 1 minute |
| Placements | 20 requests | 1 minute |
| WordPress Plugin | 30 requests | 1 minute |
| Financial Operations | 50 requests | 1 minute |
| WordPress Registration | 5 requests | 1 minute |

**Headers**:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642771200
```

**429 Response**:
```json
{
  "error": "Too many requests, please try again later."
}
```

---

## Pagination

All list endpoints support pagination with consistent parameters.

**Query Parameters**:
- `page` (integer, optional) - Page number (default: 1)
- `limit` (integer, optional) - Items per page (default: 20, max: 5000)

**Response Format**:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Example**:
```bash
GET /api/projects?page=2&limit=50
```

---

## Authentication Examples

### cURL

```bash
# Login
TOKEN=$(curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.data.token')

# Use token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3003/api/projects
```

### JavaScript (Fetch)

```javascript
// Login
const loginResponse = await fetch('http://localhost:3003/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { data } = await loginResponse.json();
const token = data.token;

// Use token
const projectsResponse = await fetch('http://localhost:3003/api/projects', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const projects = await projectsResponse.json();
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.5.0 | 2025-01-23 | Added extended fields support, removed anchor uniqueness |
| 2.4.0 | 2024-11-25 | Added bulk registration API |
| 2.3.0 | 2024-11-17 | Added billing system API |
| 2.2.0 | 2024-11-15 | Added static PHP sites support |
| 2.0.0 | 2024-11-10 | Modular architecture refactor |

---

**For detailed architectural decisions, see [ADR.md](ADR.md)**
**For operational procedures, see [RUNBOOK.md](RUNBOOK.md)**
**For quick patterns, see [DECISIONS.md](DECISIONS.md)**
