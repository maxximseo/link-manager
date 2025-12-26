/**
 * Migration Runner: Add history JSONB column to site_slot_rentals
 * Adds audit trail functionality to rental records
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const { Client } = require('pg');
const fs = require('fs');

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully');

    console.log('\n📝 Running migration: Add history JSONB to site_slot_rentals...');
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrate_add_rental_history.sql'),
      'utf8'
    );

    await client.query(sql);
    console.log('✅ Migration completed successfully!');

    // Verify
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'site_slot_rentals' AND column_name = 'history'
    `);

    if (result.rows.length > 0) {
      console.log('\n✅ Verification passed:');
      console.log('   Column:', result.rows[0].column_name);
      console.log('   Type:', result.rows[0].data_type);
      console.log('   Default:', result.rows[0].column_default);
    } else {
      console.log('\n❌ Verification failed: history column not found');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Column already exists - migration may have been run before');
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Disconnected from database');
  }
}

runMigration();
