/**
 * Migration Runner: Add Referral/Affiliate System
 *
 * Run with: node database/run_referrals_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Starting Referral System Migration...\n');

  // Parse DATABASE_URL or use individual env vars
  let poolConfig;

  // Check if database host is remote (requires SSL)
  const isRemoteDB = process.env.DB_HOST && !['localhost', '127.0.0.1'].includes(process.env.DB_HOST);
  const sslConfig = isRemoteDB || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

  if (process.env.DATABASE_URL) {
    poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  } else {
    poolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'linkmanager',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: sslConfig
    };
  }

  const pool = new Pool(poolConfig);

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_referrals.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Running migration SQL...\n');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify changes
    console.log('🔍 Verifying changes...\n');

    // Check users table columns
    const usersColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('referral_code', 'referred_by_user_id', 'referral_balance', 'total_referral_earnings')
      ORDER BY column_name
    `);

    console.log('Users table new columns:');
    usersColumns.rows.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
    });

    // Check referral_transactions table
    const refTxTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'referral_transactions'
      ) as exists
    `);
    console.log(`\nreferral_transactions table: ${refTxTable.rows[0].exists ? '✓ exists' : '✗ missing'}`);

    // Check referral_withdrawals table
    const refWdTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'referral_withdrawals'
      ) as exists
    `);
    console.log(`referral_withdrawals table: ${refWdTable.rows[0].exists ? '✓ exists' : '✗ missing'}`);

    // Check indexes
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('users', 'referral_transactions', 'referral_withdrawals')
        AND indexname LIKE '%referral%'
    `);
    console.log('\nReferral indexes created:');
    indexes.rows.forEach(idx => {
      console.log(`  ✓ ${idx.indexname}`);
    });

    // Count users with referral codes
    const usersWithCodes = await pool.query(`
      SELECT COUNT(*) as count FROM users WHERE referral_code IS NOT NULL
    `);
    console.log(`\n📊 Users with referral codes: ${usersWithCodes.rows[0].count}`);

    console.log('\n✅ All verifications passed!');
    console.log('\n📝 Next steps:');
    console.log('  1. Restart the server to pick up new schema');
    console.log('  2. Test referral link generation');
    console.log('  3. Test registration with referral code');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
