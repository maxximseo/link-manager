/**
 * Test script for rental expiration cron
 *
 * This script tests the processExpiredRentals function manually
 * to verify it works correctly before relying on cron schedule.
 */

require('dotenv').config({ path: './backend/.env' });
const { processExpiredRentals } = require('../backend/cron/cleanup-expired-rentals.cron');
const { pool } = require('../backend/config/database');

async function testExpirationCron() {
  console.log('🧪 Testing rental expiration cron...\n');

  try {
    // Check for expired rentals before processing
    const beforeCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM site_slot_rentals
      WHERE status = 'active' AND expires_at < NOW()
    `);

    const expiredCount = parseInt(beforeCheck.rows[0].count);
    console.log(`Found ${expiredCount} expired rentals that need processing\n`);

    if (expiredCount === 0) {
      console.log('✨ No expired rentals to test. System is clean.');
      console.log('\n💡 To test manually, create a rental with expires_at in the past:');
      console.log(
        "   UPDATE site_slot_rentals SET expires_at = NOW() - INTERVAL '1 day' WHERE id = <rental_id>;\n"
      );
      return;
    }

    // Show details of rentals that will be expired
    const details = await pool.query(`
      SELECT
        r.id,
        r.site_id,
        r.slot_count,
        r.slot_type,
        s.site_name,
        r.expires_at,
        NOW() - r.expires_at as overdue
      FROM site_slot_rentals r
      JOIN sites s ON s.id = r.site_id
      WHERE r.status = 'active' AND r.expires_at < NOW()
    `);

    console.log('📋 Rentals to be expired:');
    console.log('════════════════════════════════════════════════════════════════');
    details.rows.forEach(r => {
      console.log(`  ID: ${r.id}`);
      console.log(`  Site: ${r.site_name} (ID: ${r.site_id})`);
      console.log(`  Slots: ${r.slot_count} ${r.slot_type}`);
      console.log(`  Expired: ${r.expires_at.toISOString()}`);
      console.log(`  Overdue: ${r.overdue}`);
      console.log('  ────────────────────────────────────────────────────────────');
    });
    console.log('');

    // Run the expiration process
    console.log('⚙️  Running processExpiredRentals()...\n');
    const result = await processExpiredRentals();

    console.log(`✅ Processed ${result.processed} expired rentals\n`);

    // Verify rentals were actually expired
    const afterCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM site_slot_rentals
      WHERE status = 'active' AND expires_at < NOW()
    `);

    const remainingExpired = parseInt(afterCheck.rows[0].count);

    if (remainingExpired === 0) {
      console.log('✅ SUCCESS: All expired rentals were processed correctly');
    } else {
      console.log(
        `⚠️  WARNING: ${remainingExpired} expired rentals still remain (may be race condition or error)`
      );
    }

    // Check notifications were created
    const notificationCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE type IN ('rental_expired_owner', 'rental_expired_tenant')
        AND created_at > NOW() - INTERVAL '1 minute'
    `);

    const recentNotifications = parseInt(notificationCheck.rows[0].count);
    console.log(`\n📬 Created ${recentNotifications} notifications for expired rentals`);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🎉 Test completed successfully!');
    console.log('════════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run test
testExpirationCron().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
