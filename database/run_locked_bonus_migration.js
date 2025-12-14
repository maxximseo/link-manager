/**
 * Migration runner for locked bonus system
 * Run: node database/run_locked_bonus_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting locked bonus migration...\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_locked_bonus.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify columns were added
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('locked_bonus', 'locked_bonus_unlock_amount', 'locked_bonus_unlocked')
      ORDER BY column_name
    `);

    console.log('Verification - New columns in users table:');
    console.log('─'.repeat(60));
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'none'})`);
    });

    // Check index
    const indexResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'idx_users_locked_bonus'
    `);

    console.log('\n' + '─'.repeat(60));
    if (indexResult.rows.length > 0) {
      console.log('✅ Index idx_users_locked_bonus created');
    } else {
      console.log('⚠️ Index idx_users_locked_bonus not found');
    }

    console.log('\n✅ Locked bonus system is ready!');
    console.log('\nNext steps:');
    console.log('  1. Update auth.service.js to add $50 bonus on referral registration');
    console.log('  2. Update billing.service.js to unlock bonus on deposit >= $100');
    console.log('  3. Update balance API and UI to display locked bonus');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
