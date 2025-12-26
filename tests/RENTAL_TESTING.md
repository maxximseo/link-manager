# Rental System Testing Guide

## Overview

This guide explains how to test the rental slot system implementation, specifically:
1. **Rental Expiration Cron Job** - Automatically expires rentals when time is up
2. **WordPress Webhook Integration** - Notifies WordPress sites about rental status changes

## Test Scripts

### 1. Test Rental Expiration Cron

```bash
node tests/test-rental-expiration.js
```

**What it does:**
- Finds all active rentals with `expires_at < NOW()`
- Runs the `processExpiredRentals()` function manually
- Verifies rentals are marked as `expired`
- Checks slots are released back to sites
- Confirms notifications were sent to owner and tenant

**Expected Output:**
```
🧪 Testing rental expiration cron...

Found 3 expired rentals that need processing

📋 Rentals to be expired:
════════════════════════════════════════════════════════════════
  ID: 123
  Site: example.com (ID: 45)
  Slots: 5 link
  Expired: 2024-12-20T10:00:00.000Z
  Overdue: 6 days 5 hours
  ────────────────────────────────────────────────────────────

⚙️  Running processExpiredRentals()...

✅ Processed 3 expired rentals

✅ SUCCESS: All expired rentals were processed correctly

📬 Created 6 notifications for expired rentals

════════════════════════════════════════════════════════════════
🎉 Test completed successfully!
════════════════════════════════════════════════════════════════
```

**If no expired rentals exist:**
The script will show a message explaining how to manually create an expired rental for testing:
```sql
UPDATE site_slot_rentals
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = <rental_id>;
```

---

### 2. Test WordPress Webhook

```bash
node tests/test-rental-webhook.js
```

**What it does:**
- Sends a test webhook to a WordPress site
- Simulates rental approval notification
- Shows request/response details

**Expected Output (when WordPress doesn't have endpoint - NORMAL):**
```
🧪 Testing WordPress rental webhook...

📤 Sending test webhook to: https://example.com
   Endpoint: https://example.com/wp-json/lmw/v1/rental-update
   Action: approved
   Rental ID: 999
   Slots: 5 link

📥 Webhook response:
   Success: false
   ⚠️  Webhook failed (this is OK if plugin not updated on WordPress site)
   Error: Request failed with status code 404
   HTTP Status: 404

════════════════════════════════════════════════════════════════
ℹ️  Note: Webhook failures are expected if WordPress plugin
   does not have the /wp-json/lmw/v1/rental-update endpoint.
   This is OK - the system will work fine without it.
   The webhook is OPTIONAL and only used for real-time updates.
════════════════════════════════════════════════════════════════

🎉 Test completed!
```

**Expected Output (when WordPress HAS the endpoint - FUTURE):**
```
📥 Webhook response:
   Success: true
   ✅ WordPress site received webhook successfully!
   Response: {
     "success": true,
     "message": "Rental status updated",
     "action": "approved",
     "rental_id": 999
   }
```

---

## Manual Verification

### 1. Check Cron is Running

After server restart, verify the cron is initialized:

```bash
tail -f backend/logs/combined.log | grep "Rental expiration"
```

Expected output:
```
[Cron] Rental expiration cron initialized (runs every 15 minutes)
[Cron] Rental expiration check completed: 0 rentals expired
```

---

### 2. Check for Expired Rentals in Database

```sql
-- Find rentals that should be expired
SELECT
  id,
  site_id,
  status,
  expires_at,
  NOW() - expires_at as overdue
FROM site_slot_rentals
WHERE status = 'active' AND expires_at < NOW();
```

If this query returns 0 rows, the cron is working correctly!

---

### 3. Verify Webhooks are Sent

Check logs for webhook attempts:

```bash
tail -f backend/logs/combined.log | grep "WordPress Rental Webhook"
```

Expected output when rental is approved:
```
[WordPress Rental Webhook] Sending approved notification to https://site.com
[WordPress Rental Webhook] Optional webhook failed for https://site.com (this is OK if plugin not updated)
```

Or if WordPress site has endpoint:
```
[WordPress Rental Webhook] Sending approved notification to https://site.com
[WordPress Rental Webhook] Successfully notified https://site.com
```

---

## Creating Test Data

### Create a Rental that Expires Soon

```sql
-- Set expiration to 2 minutes from now
UPDATE site_slot_rentals
SET expires_at = NOW() + INTERVAL '2 minutes'
WHERE id = <rental_id>;

-- Wait 2 minutes, then check cron processed it
-- (Cron runs every 15 minutes, so may take up to 15 min to process)
```

---

### Create an Immediate Expired Rental

```sql
-- Set expiration to 1 day ago
UPDATE site_slot_rentals
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = <rental_id>;

-- Run test script immediately to process it
node tests/test-rental-expiration.js
```

---

## Troubleshooting

### Cron Not Running

**Symptom**: Rentals remain active past expiration date

**Check**:
```bash
# Verify cron is initialized in logs
grep "Rental expiration cron initialized" backend/logs/combined.log

# Check for cron execution
grep "Rental expiration check completed" backend/logs/combined.log
```

**Fix**: Restart server to initialize cron:
```bash
lsof -ti:3003 | xargs kill -9 2>/dev/null
npm run dev
```

---

### Webhook Always Fails

**This is NORMAL!** Webhooks will fail if WordPress sites don't have the updated plugin with `/wp-json/lmw/v1/rental-update` endpoint.

**Expected behavior**:
- Webhook fails with 404 error
- Rental operation completes successfully anyway
- Warning logged, but system continues

**Not a problem because**:
- Webhook is OPTIONAL
- System works fine without it
- Only affects real-time sync (sites get updates on next cache refresh)

---

### Slots Not Released

**Symptom**: After rental expires, `sites.used_links` doesn't decrease

**Check**:
```sql
-- See rental history
SELECT history FROM site_slot_rentals WHERE id = <rental_id>;

-- Should show expired_by_cron action
```

**Verify cron ran**:
```bash
grep "Expired rental <rental_id>: Released" backend/logs/combined.log
```

**Manual fix** (if cron failed mid-transaction):
```sql
BEGIN;

UPDATE site_slot_rentals
SET status = 'expired'
WHERE id = <rental_id>;

UPDATE sites
SET used_links = GREATEST(0, used_links - <slot_count>)
WHERE id = <site_id>;

COMMIT;
```

---

## Success Criteria

✅ **Cron is working** if:
1. Server logs show "Rental expiration cron initialized"
2. Logs show "Rental expiration check completed" every 15 minutes
3. Database query for expired active rentals returns 0 rows

✅ **Webhooks are working** if:
1. Logs show "Sending approved/rejected/cancelled/expired notification" messages
2. Either "Successfully notified" OR "Optional webhook failed" (both are OK)
3. Rental operations complete regardless of webhook status

✅ **System is healthy** if:
1. Rentals transition to `expired` status within 15 minutes of `expires_at`
2. Slots are released back to sites (`used_links` decreases)
3. Notifications are created for owner and tenant
4. Transaction history is logged in `site_slot_rentals.history` JSONB column
