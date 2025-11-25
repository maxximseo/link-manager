/**
 * Migration runner for moderation columns
 * Adds approved_at, approved_by, rejection_reason to placements table
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Starting moderation migration...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrate_add_moderation.sql'),
      'utf8'
    );

    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('   - Added approved_at column');
    console.log('   - Added approved_by column');
    console.log('   - Added rejection_reason column');
    console.log('   - Created index for pending_approval status');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
