/**
 * Migration runner for USDT TRC20 wallet support
 * Run with: node database/run_usdt_wallet_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Always use SSL with rejectUnauthorized: false for cloud databases
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting USDT wallet migration...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrate_add_usdt_wallet.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query(migrationSQL);

    console.log('Migration completed successfully!');

    // Verify columns exist
    const verifyUsers = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'usdt_wallet'
    `);

    const verifyWithdrawals = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'referral_withdrawals'
        AND column_name IN ('withdrawal_type', 'wallet_address', 'admin_comment', 'processed_at', 'processed_by')
    `);

    console.log('\nVerification:');
    console.log('users.usdt_wallet:', verifyUsers.rows.length > 0 ? 'EXISTS' : 'MISSING');
    console.log('referral_withdrawals new columns:', verifyWithdrawals.rows.length, 'of 5 found');

    if (verifyUsers.rows.length > 0 && verifyWithdrawals.rows.length >= 5) {
      console.log('\nAll columns created successfully!');
    } else {
      console.log('\nWarning: Some columns may be missing. Check the output above.');
    }
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
