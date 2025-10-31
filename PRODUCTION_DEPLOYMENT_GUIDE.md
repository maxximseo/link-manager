# Production Deployment Guide - Billing System

## 🚀 DigitalOcean Deployment Steps

### Prerequisites
- Production URL: https://shark-app-9kv6u.ondigitalocean.app
- Database: PostgreSQL on DigitalOcean (defaultdb)
- Cache: Valkey (Redis-compatible) on DigitalOcean
- GitHub: https://github.com/maxximseo/link-manager

### Environment Variables Already Configured

The following environment variables should already be set in DigitalOcean App Platform:

```bash
# Database (DigitalOcean PostgreSQL)
DATABASE_URL=${db-postgresql-nyc3-90526.DATABASE_URL}

# Server Configuration
NODE_ENV=production
PORT=3000

# JWT Secret
JWT_SECRET=your-jwt-secret-from-digitalocean-env-vars

# Redis/Valkey
REDIS_HOST=your-valkey-host.ondigitalocean.com
REDIS_PORT=25060
REDIS_USER=default
REDIS_PASSWORD=your-redis-password-from-digitalocean
```

### Step 1: Deploy to DigitalOcean

All changes are already committed to branch `claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`.

**Option A: Merge to main and auto-deploy**
```bash
git checkout main
git merge claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ
git push origin main
```

DigitalOcean will automatically detect the push and redeploy.

**Option B: Deploy directly from feature branch**
- Go to DigitalOcean App Platform dashboard
- Update the branch setting to deploy from `claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`
- Trigger manual deployment

### Step 2: Run Database Migration

Once the app is deployed, SSH into the DigitalOcean container and run:

```bash
# Connect to your DigitalOcean app console
doctl apps logs <app-id> --follow

# Or use DigitalOcean web console to access the container
# Navigate to: Apps > link-manager > Console

# Run migration
node database/run_billing_migration.js
```

**Expected output:**
```
🔄 Starting billing system migration...
✅ Migration completed successfully!

📊 Verifying users table...
Users columns added: [
  { column_name: 'balance', data_type: 'numeric', ... },
  { column_name: 'total_spent', data_type: 'numeric', ... },
  { column_name: 'current_discount', data_type: 'integer', ... }
]

📊 Verifying new tables...
New tables created: [
  'audit_log',
  'discount_tiers',
  'notifications',
  'renewal_history',
  'transactions'
]

💰 Discount tiers:
┌─────────┬───────────────┬────────────┬─────────────────────┐
│ (index) │   tier_name   │ min_spent  │ discount_percentage │
├─────────┼───────────────┼────────────┼─────────────────────┤
│    0    │  'Стандарт'   │   '0.00'   │          0          │
│    1    │   'Bronze'    │  '800.00'  │         10          │
│    2    │   'Silver'    │ '1200.00'  │         15          │
│    3    │    'Gold'     │ '1600.00'  │         20          │
│    4    │  'Platinum'   │ '2000.00'  │         25          │
│    5    │   'Diamond'   │ '2400.00'  │         30          │
└─────────┴───────────────┴────────────┴─────────────────────┘

✨ Billing system migration completed successfully!
```

### Step 3: Verify Cron Jobs Started

Check the application logs for cron job initialization:

```bash
doctl apps logs <app-id> | grep "cron"
```

**Expected log entries:**
```
[INFO] Cron jobs initialized successfully
[INFO] Auto-renewal cron job scheduled for 00:00
[INFO] Expiry reminder cron job scheduled for 09:00
[INFO] Scheduled placements cron job scheduled (hourly)
```

### Step 4: Test API Endpoints

```bash
# Get admin token
TOKEN=$(curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# Test billing endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/billing/balance

curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/billing/pricing

curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/billing/discount-tiers

# Test admin endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/admin/dashboard/stats?period=week
```

### Step 5: Test Frontend Pages

Navigate to these URLs in browser:
- https://shark-app-9kv6u.ondigitalocean.app/balance.html
- https://shark-app-9kv6u.ondigitalocean.app/my-placements.html
- https://shark-app-9kv6u.ondigitalocean.app/admin-dashboard.html (admin only)

Check browser console for any JavaScript errors.

### Step 6: Initial User Setup

Give initial balance to admin user for testing:

```sql
-- Connect to PostgreSQL
psql "postgresql://[DB_USER]:[DB_PASSWORD]@[DB_HOST]:[DB_PORT]/defaultdb?sslmode=require"

-- Add balance to admin user
UPDATE users
SET balance = 1000.00,
    total_spent = 0.00,
    current_discount = 0
WHERE username = 'admin';

-- Verify
SELECT id, username, balance, total_spent, current_discount FROM users;
```

### Step 7: Test Complete Purchase Flow

1. Login as admin at https://shark-app-9kv6u.ondigitalocean.app
2. Navigate to "Баланс" (Balance) page
3. Verify balance shows $1000.00
4. Navigate to "Размещения" (My Placements) page
5. Click "Купить размещение" (Purchase Placement)
6. Select project, type (link/article), site, content
7. Set scheduled date (optional)
8. Enable auto-renewal (for links only)
9. Click "Купить" (Purchase)
10. Verify:
    - Balance decreased
    - New placement appears in Active tab
    - Transaction appears in transaction history
    - Discount tier updates if threshold reached

## 🔍 Troubleshooting

### Migration Fails

**Error: Column already exists**
```
ERROR: column "balance" of relation "users" already exists
```

**Solution:** Migration is idempotent. If columns already exist, you can skip the ALTER TABLE statements or drop and recreate.

```sql
-- Check what columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('balance', 'total_spent', 'current_discount');
```

### Cron Jobs Not Starting

**Check logs:**
```bash
doctl apps logs <app-id> | grep -i "cron\|error"
```

**Common issues:**
- Redis not connected (graceful degradation, crons still work)
- Database connection failed
- Syntax errors in cron files

### API Endpoints Return 500

**Check server logs:**
```bash
doctl apps logs <app-id> --follow
```

**Common issues:**
- Missing environment variables
- Database connection issues
- Redis connection timeout (should gracefully degrade)

### Frontend Pages Don't Load

**Check:**
1. Browser console for JavaScript errors
2. Network tab for 404s on static files
3. JWT token in localStorage

**Solution:**
```javascript
// In browser console
localStorage.getItem('token')  // Should return JWT token
```

## 📊 Database Schema Changes

### New Tables (5)

1. **transactions** - Financial transaction history
2. **discount_tiers** - Discount configuration (6 tiers pre-populated)
3. **renewal_history** - Placement renewal records
4. **notifications** - User notifications
5. **audit_log** - Security audit trail

### Modified Tables (2)

1. **users** - Added 8 columns:
   - `balance` DECIMAL(10,2) DEFAULT 0.00
   - `total_spent` DECIMAL(10,2) DEFAULT 0.00
   - `current_discount` INTEGER DEFAULT 0
   - `last_login` TIMESTAMP
   - `failed_login_attempts` INTEGER DEFAULT 0
   - `account_locked_until` TIMESTAMP
   - `email_verified` BOOLEAN DEFAULT FALSE
   - `verification_token` VARCHAR(255)

2. **placements** - Added 12 columns:
   - `user_id` INTEGER (references users)
   - `original_price` DECIMAL(10,2)
   - `discount_applied` INTEGER
   - `final_price` DECIMAL(10,2)
   - `purchased_at` TIMESTAMP
   - `scheduled_publish_date` TIMESTAMP
   - `published_at` TIMESTAMP
   - `expires_at` TIMESTAMP
   - `auto_renewal` BOOLEAN DEFAULT FALSE
   - `renewal_price` DECIMAL(10,2)
   - `last_renewed_at` TIMESTAMP
   - `renewal_count` INTEGER DEFAULT 0
   - `purchase_transaction_id` INTEGER

### New Indexes (20)

All indexes created with `IF NOT EXISTS` for idempotent migrations.

Performance indexes on:
- transactions (user_id, type, created_at)
- placements (expires_at, auto_renewal, scheduled_publish_date)
- notifications (user_id, is_read, created_at)
- audit_log (user_id, action, created_at)
- renewal_history (placement_id, renewed_at)

## 🔐 Security Features

1. **Rate Limiting**
   - General API: 100 requests / 15 minutes
   - Financial operations: 20 requests / hour

2. **Database Transactions**
   - All financial operations wrapped in BEGIN/COMMIT/ROLLBACK
   - Row-level locking with FOR UPDATE on critical queries

3. **Audit Logging**
   - All balance changes logged to audit_log
   - Includes user_id, action, old_value, new_value, IP address

4. **Input Validation**
   - express-validator on all POST/PATCH endpoints
   - Type checking, range validation, sanitization

## 📈 Monitoring

### Key Metrics to Monitor

1. **Revenue Metrics** (Admin Dashboard)
   - Daily/weekly/monthly/yearly revenue
   - Revenue by type (purchases vs renewals)
   - Average transaction value

2. **User Metrics**
   - Total users with balance > 0
   - Active placements count
   - Scheduled placements count

3. **System Health**
   - Cron job execution logs
   - Failed renewal attempts
   - Insufficient balance notifications

### Database Queries for Monitoring

```sql
-- Total revenue today
SELECT SUM(ABS(amount)) as today_revenue
FROM transactions
WHERE type IN ('purchase', 'renewal', 'auto_renewal')
AND DATE(created_at) = CURRENT_DATE;

-- Active placements count
SELECT COUNT(*) as active_placements
FROM placements
WHERE status = 'placed'
AND (expires_at IS NULL OR expires_at > NOW());

-- Users by discount tier
SELECT
  dt.tier_name,
  COUNT(u.id) as user_count,
  SUM(u.balance) as total_balance
FROM users u
LEFT JOIN discount_tiers dt ON u.current_discount = dt.discount_percentage
GROUP BY dt.tier_name
ORDER BY dt.min_spent;

-- Upcoming renewals (next 7 days)
SELECT COUNT(*) as upcoming_renewals
FROM placements
WHERE auto_renewal = true
AND status = 'placed'
AND type = 'link'
AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days';
```

## 🎯 Post-Deployment Checklist

- [ ] Migration executed successfully
- [ ] All 5 new tables created
- [ ] 6 discount tiers inserted
- [ ] Cron jobs initialized and running
- [ ] Billing API endpoints responding (10 endpoints)
- [ ] Admin API endpoints responding (7 endpoints)
- [ ] Frontend pages loading without errors (3 pages)
- [ ] Admin user has initial balance for testing
- [ ] Complete purchase flow tested successfully
- [ ] Transaction history displaying correctly
- [ ] Discount tier updates working
- [ ] Auto-renewal scheduled correctly
- [ ] Email notifications configured (optional)
- [ ] Payment gateway integrated (optional)

## 🔄 Rollback Plan

If critical issues occur, rollback using:

```sql
-- Rollback migration
BEGIN;

-- Drop new tables
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS renewal_history CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS discount_tiers CASCADE;

-- Remove new columns from users
ALTER TABLE users
  DROP COLUMN IF EXISTS balance,
  DROP COLUMN IF EXISTS total_spent,
  DROP COLUMN IF EXISTS current_discount,
  DROP COLUMN IF EXISTS last_login,
  DROP COLUMN IF EXISTS failed_login_attempts,
  DROP COLUMN IF EXISTS account_locked_until,
  DROP COLUMN IF EXISTS email_verified,
  DROP COLUMN IF EXISTS verification_token;

-- Remove new columns from placements
ALTER TABLE placements
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS original_price,
  DROP COLUMN IF EXISTS discount_applied,
  DROP COLUMN IF EXISTS final_price,
  DROP COLUMN IF EXISTS purchased_at,
  DROP COLUMN IF EXISTS scheduled_publish_date,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS auto_renewal,
  DROP COLUMN IF EXISTS renewal_price,
  DROP COLUMN IF EXISTS last_renewed_at,
  DROP COLUMN IF EXISTS renewal_count,
  DROP COLUMN IF EXISTS purchase_transaction_id;

COMMIT;
```

Then redeploy previous version from git.

---

**Generated**: 2025-10-22
**Version**: 1.0.0
**Branch**: claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ
