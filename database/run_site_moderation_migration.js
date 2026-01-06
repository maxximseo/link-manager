/**
 * Migration: Add moderation columns to sites table
 * Run: node database/run_site_moderation_migration.js
 */

const { query } = require('../backend/config/database');

async function runMigration() {
  try {
    console.log('Starting site moderation migration...');
    console.log('');

    // Step 1: Add moderation_status column
    console.log('1. Adding moderation_status column...');
    await query(`
      ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT NULL
    `);
    console.log('   Done.');

    // Step 2: Add rejection_reason column
    console.log('2. Adding rejection_reason column...');
    await query(`
      ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);
    console.log('   Done.');

    // Step 3: Create index for pending sites
    console.log('3. Creating index on moderation_status...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_sites_moderation_status
      ON sites(moderation_status)
      WHERE moderation_status = 'pending'
    `);
    console.log('   Done.');

    // Step 4: Verify columns exist
    console.log('4. Verifying columns...');
    const verifyResult = await query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND column_name IN ('moderation_status', 'rejection_reason')
      ORDER BY column_name
    `);

    console.log('   Found columns:');
    verifyResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'NULL'})`);
    });

    // Step 5: Check current sites status
    console.log('');
    console.log('5. Current sites moderation status:');
    const statsResult = await query(`
      SELECT
        moderation_status,
        COUNT(*) as count
      FROM sites
      GROUP BY moderation_status
      ORDER BY count DESC
    `);

    statsResult.rows.forEach(row => {
      const status = row.moderation_status || 'NULL (private)';
      console.log(`   - ${status}: ${row.count} sites`);
    });

    console.log('');
    console.log('Migration completed successfully!');
    console.log('');
    console.log('New workflow:');
    console.log('  - NULL: Private site (personal use only)');
    console.log('  - pending: Requested public sale, waiting for admin');
    console.log('  - approved: Can be public, user can toggle is_public');
    console.log('  - rejected: Admin rejected, user can resubmit');

  } catch (error) {
    console.error('Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }

  process.exit(0);
}

runMigration();
