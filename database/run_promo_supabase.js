/**
 * Migration Runner: Promo Codes System for Supabase
 * Uses root .env file for DATABASE_URL
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env'), override: true }); // Uses backend .env and OVERRIDES existing vars

// Parse DATABASE_URL if provided
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    process.env.DB_HOST = url.hostname;
    process.env.DB_PORT = url.port || 5432;
    process.env.DB_NAME = url.pathname.slice(1);
    process.env.DB_USER = url.username;
    process.env.DB_PASSWORD = decodeURIComponent(url.password);
    console.log('✅ Using DATABASE_URL from root .env');
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error.message);
    process.exit(1);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('🚀 Starting Promo Codes Migration on Supabase...\n');
  console.log(`📊 Database: ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);

  const client = await pool.connect();

  try {
    // Read SQL migration file
    const migrationPath = path.join(__dirname, 'migrate_promo_codes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📝 Executing migration SQL...\n');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify the changes
    console.log('🔍 Verifying migration...\n');

    // Check promo_codes table
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'promo_codes'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ Table promo_codes created');

      // Show table structure
      const columns = await client.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'promo_codes'
        ORDER BY ordinal_position
      `);

      console.log('\n📋 promo_codes columns:');
      columns.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} ${col.column_default ? `(default: ${col.column_default})` : ''}`);
      });
    } else {
      console.log('❌ Table promo_codes NOT found');
    }

    // Check new user columns
    const userColumns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('referral_bonus_received', 'referral_activated_at', 'activated_promo_code_id')
      ORDER BY column_name
    `);

    console.log('\n📋 New users table columns:');
    userColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.column_default ? `(default: ${col.column_default})` : ''}`);
    });

    // Check indexes
    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'promo_codes'
    `);

    console.log('\n📋 promo_codes indexes:');
    indexes.rows.forEach(idx => {
      console.log(`   - ${idx.indexname}`);
    });

    console.log('\n🎉 Migration verification complete!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
