/**
 * Migration: Fix moderation_status default value
 *
 * Problem: Database has DEFAULT 'pending' instead of NULL
 * This caused all new sites to show "На проверке" instead of "Активен"
 *
 * Solution:
 * 1. Change column default from 'pending' to NULL
 * 2. Fix existing sites that were incorrectly set to 'pending'
 */

const { query } = require('../backend/config/database');

async function migrate() {
  try {
    console.log('🔧 Fixing moderation_status default...\n');

    // Step 1: Check current default
    console.log('1. Checking current default...');
    const currentDefault = await query(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'moderation_status'
    `);
    console.log(`   Current default: ${currentDefault.rows[0]?.column_default || 'NULL'}`);

    // Step 2: Change default to NULL
    console.log('\n2. Changing default to NULL...');
    await query(`ALTER TABLE sites ALTER COLUMN moderation_status SET DEFAULT NULL`);
    console.log('   ✅ Default changed to NULL');

    // Step 3: Count affected sites (pending but not actually requesting public sale)
    console.log('\n3. Finding incorrectly marked sites...');
    const countResult = await query(`
      SELECT COUNT(*) as count
      FROM sites
      WHERE moderation_status = 'pending' AND is_public = false
    `);
    const affectedCount = parseInt(countResult.rows[0].count);
    console.log(`   Found ${affectedCount} sites to fix`);

    // Step 4: Fix existing sites
    if (affectedCount > 0) {
      console.log('\n4. Fixing existing sites...');
      const updateResult = await query(`
        UPDATE sites
        SET moderation_status = NULL
        WHERE moderation_status = 'pending' AND is_public = false
        RETURNING id, site_url
      `);

      console.log(`   ✅ Fixed ${updateResult.rowCount} sites:`);
      updateResult.rows.forEach(row => {
        console.log(`      - [${row.id}] ${row.site_url}`);
      });
    } else {
      console.log('\n4. No sites need fixing');
    }

    // Step 5: Verify new default
    console.log('\n5. Verifying new default...');
    const newDefault = await query(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'moderation_status'
    `);
    console.log(`   New default: ${newDefault.rows[0]?.column_default || 'NULL'}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNew sites will now have moderation_status = NULL (shows "Активен")');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

migrate();
