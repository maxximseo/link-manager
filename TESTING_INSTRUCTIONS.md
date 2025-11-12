# 🧪 Critical Billing System Tests - Implementation Guide

## Overview

This document describes the implementation of 6 mandatory critical tests for the billing system to ensure financial integrity and data consistency.

---

## ✅ Test Implementation Summary

### TEST 1: Non-existent contentId → Error without charge ✅

**Location:** [backend/services/billing.service.js:216-248](backend/services/billing.service.js#L216-L248)

**Implementation:**
```javascript
// 4.5. CRITICAL: Validate content IDs BEFORE charging money
const tableName = type === 'link' ? 'project_links' : 'project_articles';

for (const contentId of contentIds) {
  const contentResult = await client.query(`
    SELECT id, usage_count, usage_limit, status
    FROM ${tableName}
    WHERE id = $1
  `, [contentId]);

  // TEST 1: Non-existent contentId
  if (contentResult.rows.length === 0) {
    throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${contentId} not found`);
  }
  // ... more validation
}
```

**What it does:**
- Validates that contentId exists in database BEFORE deducting money
- Throws error if content not found
- Transaction rolls back automatically (no COMMIT executed)
- User balance remains unchanged

**Test verification:**
```bash
node test-billing-critical.js
# Should show: ✅ TEST 1 PASSED: Balance unchanged, no charge for invalid contentId
```

---

### TEST 2: Foreign contentId → Ownership error ✅

**Location:** [backend/services/billing.service.js:239-247](backend/services/billing.service.js#L239-L247)

**Implementation:**
```javascript
// TEST 2: Ownership validation - content must belong to the same project
const ownershipResult = await client.query(`
  SELECT id FROM ${tableName}
  WHERE id = $1 AND project_id = $2
`, [contentId, projectId]);

if (ownershipResult.rows.length === 0) {
  throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${contentId} does not belong to project ${projectId} (ownership violation)`);
}
```

**What it does:**
- Validates that content belongs to the specified project
- Prevents users from using other users' content
- Throws ownership violation error BEFORE charging
- Transaction rolls back automatically

**Test verification:**
```bash
node test-billing-critical.js
# Should show: ✅ TEST 2 PASSED: Ownership validated, no charge for foreign contentId
```

---

### TEST 3: WordPress unavailable → ROLLBACK ✅

**Location:** [backend/services/billing.service.js:391-405](backend/services/billing.service.js#L391-L405)

**Implementation:**
```javascript
// 15. If not scheduled, publish immediately
// TEST 3: WordPress failure must ROLLBACK entire transaction
if (status === 'pending') {
  try {
    await publishPlacement(client, placement.id);
  } catch (publishError) {
    logger.error('Failed to publish placement to WordPress - ROLLING BACK transaction', {
      placementId: placement.id,
      error: publishError.message
    });
    // CRITICAL: ROLLBACK entire transaction on WordPress failure
    // This ensures no money is charged if placement cannot be published
    throw new Error(`Failed to publish placement to WordPress: ${publishError.message}`);
  }
}
```

**What it does:**
- Attempts to publish placement to WordPress
- If WordPress API fails or is unavailable, throws error
- Error triggers catch block in main function → ROLLBACK
- All changes reversed: no charge, no placement created, no content marked as used

**Test verification:**
```bash
node test-billing-critical.js
# Should show: ✅ TEST 3 PASSED: Transaction rolled back, no charge on WordPress failure
```

---

### TEST 4: Exhausted content → Error exhausted ✅

**Location:** [backend/services/billing.service.js:234-237](backend/services/billing.service.js#L234-L237)

**Implementation:**
```javascript
const content = contentResult.rows[0];

// TEST 4: Exhausted content
if (content.status === 'exhausted' || content.usage_count >= content.usage_limit) {
  throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${contentId} is exhausted (${content.usage_count}/${content.usage_limit} uses)`);
}
```

**What it does:**
- Checks if content has reached usage limit
- Validates `status === 'exhausted'` OR `usage_count >= usage_limit`
- Throws error BEFORE charging money
- Prevents using content that has no remaining uses

**Test verification:**
```bash
node test-billing-critical.js
# Should show: ✅ TEST 4 PASSED: Exhausted content rejected, no charge
```

---

### TEST 5: Delete placement → Money refunded ✅

**Location:** [backend/services/placement.service.js:534-574](backend/services/placement.service.js#L534-L574)

**Implementation:**
```javascript
// TEST 5: Refund money on placement deletion
if (refundAmount > 0) {
  // Get user balance with lock
  const userResult = await client.query(
    'SELECT balance, total_spent FROM users WHERE id = $1 FOR UPDATE',
    [placementData.user_id]
  );

  if (userResult.rows.length > 0) {
    const currentBalance = parseFloat(userResult.rows[0].balance);
    const newBalance = currentBalance + refundAmount;

    // Update user balance
    await client.query(
      'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, placementData.user_id]
    );

    // Create refund transaction record
    await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, metadata
      )
      VALUES ($1, 'refund', $2, $3, $4, $5, $6)
    `, [
      placementData.user_id,
      refundAmount,
      currentBalance,
      newBalance,
      `Refund for deleted placement #${placementId}`,
      JSON.stringify({ placementId, refundAmount, deletedAt: new Date().toISOString() })
    ]);
  }
}
```

**What it does:**
- Reads `final_price` from placement record
- Adds refund amount back to user's balance
- Creates transaction record of type 'refund'
- Ensures audit trail of all refunds
- Uses FOR UPDATE lock to prevent race conditions

**Test verification:**
```bash
node test-billing-critical.js
# Should show: ✅ TEST 5 PASSED: Money refunded on placement deletion
```

---

### TEST 6: Legacy endpoint → 410 Gone ✅

**Location:** [backend/routes/placement.routes.js:28-38](backend/routes/placement.routes.js#L28-L38)

**Implementation:**
```javascript
// TEST 6: Legacy endpoint - 410 Gone
// Old placement creation endpoint is deprecated in favor of billing system
router.post('/', (req, res) => {
  res.status(410).json({
    error: 'This endpoint is deprecated and no longer available',
    message: 'Placement creation has been moved to the billing system',
    newEndpoint: 'POST /api/billing/purchase',
    migration: 'Please use the new billing API to purchase placements',
    documentation: 'See API docs for migration guide'
  });
});
```

**What it does:**
- Returns HTTP 410 Gone status (permanent removal)
- Provides clear error message
- Directs users to new endpoint
- Prevents accidental use of old free placement creation

**Test verification:**
```bash
node test-billing-critical.js
# Should show: ✅ TEST 6 PASSED: Legacy endpoint returns 410 Gone
```

---

## 🎯 Running All Tests

### Prerequisites

1. Server must be running:
```bash
npm run dev
# or
PORT=3003 NODE_ENV=development npm run dev
```

2. Database must have billing migration applied:
```bash
node database/run_billing_migration.js
```

3. Admin user must exist (default: admin/admin123)

### Run Test Suite

```bash
node test-billing-critical.js
```

### Expected Output

```
🧪 ══════════════════════════════════════════════
🧪 CRITICAL BILLING SYSTEM TESTS
🧪 ══════════════════════════════════════════════

🔧 Setting up test data...
✅ Admin logged in
✅ Test user logged in
✅ Added $1000 to test user balance
✅ Created test project #123
✅ Created test site #456
✅ Created test link #789
✅ Created test article #101

🧪 ══════════════════════════════════════════════
🧪 TEST 1: Non-existent contentId → Error without charge
🧪 ══════════════════════════════════════════════
ℹ️  Balance before: $1000
✅ Purchase failed as expected
ℹ️  Error: Link with ID 999999 not found
ℹ️  Balance after: $1000
✅ ✅ TEST 1 PASSED: Balance unchanged, no charge for invalid contentId

🧪 ══════════════════════════════════════════════
🧪 TEST 2: Foreign contentId → Ownership error
🧪 ══════════════════════════════════════════════
✅ Created admin link #202
ℹ️  Test user balance before: $1000
✅ Purchase failed with ownership error as expected
ℹ️  Error: Link with ID 202 does not belong to project 123 (ownership violation)
✅ ✅ TEST 2 PASSED: Ownership validated, no charge for foreign contentId

🧪 ══════════════════════════════════════════════
🧪 TEST 3: WordPress unavailable → ROLLBACK
🧪 ══════════════════════════════════════════════
✅ Created bad site #303
ℹ️  Balance before: $1000
ℹ️  Balance after: $1000
✅ ✅ TEST 3 PASSED: Transaction rolled back, no charge on WordPress failure

🧪 ══════════════════════════════════════════════
🧪 TEST 4: Exhausted content → Error exhausted
🧪 ══════════════════════════════════════════════
✅ ✅ TEST 4 PASSED: Exhausted content rejected, no charge

🧪 ══════════════════════════════════════════════
🧪 TEST 5: Delete placement → Money refunded
🧪 ══════════════════════════════════════════════
ℹ️  Balance before purchase: $1000
✅ Created placement #404, paid $25.00
ℹ️  Balance after purchase: $975.00
✅ Placement deleted
ℹ️  Balance after deletion: $1000.00
✅ ✅ TEST 5 PASSED: Money refunded on placement deletion

🧪 ══════════════════════════════════════════════
🧪 TEST 6: Legacy endpoint → 410 Gone
🧪 ══════════════════════════════════════════════
✅ ✅ TEST 6 PASSED: Legacy endpoint returns 410 Gone
ℹ️  Message: This endpoint is deprecated and no longer available

📊 ══════════════════════════════════════════════
📊 TEST SUMMARY
📊 ══════════════════════════════════════════════

✅ Test 1: Non-existent contentId      ✅ PASS
✅ Test 2: Foreign contentId           ✅ PASS
✅ Test 3: WordPress ROLLBACK          ✅ PASS
✅ Test 4: Exhausted content           ✅ PASS
✅ Test 5: Refund on deletion          ✅ PASS
✅ Test 6: Legacy endpoint 410         ✅ PASS

Total: 6/6 passed

🎉 ALL TESTS PASSED!
```

---

## 🔒 Financial Integrity Guarantees

### Transaction Safety

All financial operations use PostgreSQL transactions with proper error handling:

```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // ... all operations ...

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');  // Automatic rollback on ANY error
  throw error;
} finally {
  client.release();
}
```

### Validation Order (CRITICAL)

Validations MUST happen in this order to prevent financial losses:

1. ✅ User authentication (middleware)
2. ✅ Request validation (express-validator)
3. ✅ BEGIN transaction
4. ✅ Lock user row (FOR UPDATE)
5. ✅ Validate project ownership
6. ✅ Validate site exists
7. ✅ Check duplicate placement
8. ✅ **Validate content IDs** (existence, ownership, exhausted) ← BEFORE charging
9. ✅ Calculate price
10. ✅ Check balance sufficiency
11. ✅ Deduct from balance
12. ✅ Create transaction record
13. ✅ Create placement
14. ✅ Link content
15. ✅ Update site quotas
16. ✅ Update discount tier
17. ✅ Publish to WordPress (or schedule)
18. ✅ Create audit log
19. ✅ COMMIT transaction

**Any error in steps 1-18 causes automatic ROLLBACK.**

### Race Condition Prevention

- `FOR UPDATE` locks on user and placement rows
- Transactions prevent partial updates
- NOWAIT option fails fast on lock conflicts

### Audit Trail

All financial operations are logged:
- `transactions` table records every charge/refund
- `audit_log` table records user actions
- Winston logger records all errors with context

---

## 📝 Manual Testing Scenarios

### Scenario 1: Insufficient Balance

```bash
curl -X POST http://localhost:3003/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "link",
    "contentIds": [1]
  }'

# Expected: 400 Bad Request
# Error: "Insufficient balance. Required: $25.00, Available: $10.00"
# Balance unchanged ✅
```

### Scenario 2: Duplicate Placement

```bash
# Create first placement
curl -X POST http://localhost:3003/api/billing/purchase ...

# Try to create duplicate
curl -X POST http://localhost:3003/api/billing/purchase ...

# Expected: 400 Bad Request
# Error: "A link placement already exists for this project on this site"
# No refund needed (prevented before charge) ✅
```

### Scenario 3: WordPress Timeout

```bash
# Create site with invalid URL
curl -X POST http://localhost:3003/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"site_url": "https://nonexistent-12345.com", ...}'

# Try to purchase article placement
curl -X POST http://localhost:3003/api/billing/purchase \
  -d '{"siteId": <bad_site_id>, "type": "article", ...}'

# Expected: 400 Bad Request
# Error: "Failed to publish placement to WordPress: ..."
# Balance unchanged (ROLLBACK) ✅
```

---

## 🐛 Debugging Failed Tests

### Test 1 Fails (Balance charged despite error)

**Symptom:** Balance decreased even though contentId was invalid

**Diagnosis:**
```sql
-- Check transaction history
SELECT * FROM transactions
WHERE user_id = <test_user_id>
ORDER BY created_at DESC LIMIT 5;

-- Should NOT see purchase transaction for failed attempt
```

**Fix:** Ensure validation happens BEFORE balance deduction

---

### Test 3 Fails (No rollback on WordPress error)

**Symptom:** Money charged but placement marked as 'failed'

**Diagnosis:**
```javascript
// In billing.service.js, publishPlacement error handler
// WRONG (old code):
catch (publishError) {
  await client.query('UPDATE placements SET status = $1...', ['failed', ...]);
  // Transaction commits, user charged! ❌
}

// CORRECT (new code):
catch (publishError) {
  throw new Error(`Failed to publish...`);  // Triggers ROLLBACK ✅
}
```

---

### Test 5 Fails (No refund on deletion)

**Symptom:** Placement deleted but balance not increased

**Diagnosis:**
```sql
-- Check if refund transaction was created
SELECT * FROM transactions
WHERE user_id = <user_id>
AND type = 'refund'
ORDER BY created_at DESC;

-- Should see refund record with positive amount
```

**Fix:** Ensure `final_price` column exists and is populated during purchase

---

## 📚 Related Files

### Modified Files
- [backend/services/billing.service.js](backend/services/billing.service.js) - Content validation, WordPress rollback
- [backend/services/placement.service.js](backend/services/placement.service.js) - Refund logic
- [backend/routes/placement.routes.js](backend/routes/placement.routes.js) - Legacy endpoint deprecation

### Test Files
- [test-billing-critical.js](test-billing-critical.js) - Main test suite

### Database
- [database/migrate_add_billing_system.sql](database/migrate_add_billing_system.sql) - Billing schema
- [database/run_billing_migration.js](database/run_billing_migration.js) - Migration runner

---

## ⚠️ Production Checklist

Before deploying to production:

- [ ] All 6 tests pass locally
- [ ] All 6 tests pass on staging environment
- [ ] Database migration applied on production
- [ ] Rate limiting configured (20 financial ops/hour)
- [ ] Monitoring alerts set up for:
  - [ ] Failed transactions
  - [ ] ROLLBACK events
  - [ ] Refund spikes
  - [ ] 410 endpoint access attempts
- [ ] Backup of transactions table configured
- [ ] Audit log retention policy set

---

## 🔗 API Documentation

### New Endpoint: POST /api/billing/purchase

**Replaces:** POST /api/placements (deprecated, returns 410)

**Request:**
```json
{
  "projectId": 123,
  "siteId": 456,
  "type": "link",
  "contentIds": [789],
  "scheduledDate": "2025-02-01T10:00:00Z",  // optional
  "autoRenewal": false  // optional, links only
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "placement": { ... },
    "newBalance": 975.00,
    "newDiscount": 10,
    "newTier": "Bronze"
  }
}
```

**Response (Error - Non-existent contentId):**
```json
{
  "error": "Link with ID 999 not found"
}
```
Balance: **Unchanged** ✅

**Response (Error - Ownership violation):**
```json
{
  "error": "Link with ID 123 does not belong to project 456 (ownership violation)"
}
```
Balance: **Unchanged** ✅

**Response (Error - Exhausted):**
```json
{
  "error": "Article with ID 101 is exhausted (1/1 uses)"
}
```
Balance: **Unchanged** ✅

**Response (Error - WordPress failure):**
```json
{
  "error": "Failed to publish placement to WordPress: Connection timeout"
}
```
Balance: **Unchanged** (ROLLBACK) ✅

---

## 📞 Support

If any test fails:

1. Check server logs: `tail -f logs/combined.log`
2. Check database state: `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;`
3. Review transaction rollback logs: `grep ROLLBACK logs/combined.log`
4. Verify migration applied: `SELECT column_name FROM information_schema.columns WHERE table_name='placements';`

---

**Last Updated:** 2025-01-22
**Version:** 1.0.0
**Status:** ✅ All tests implemented and verified
