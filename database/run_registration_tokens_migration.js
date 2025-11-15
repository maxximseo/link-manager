/**
 * Migration runner: Add registration_tokens table
 *
 * This migration adds support for bulk WordPress site registration via tokens.
 * Admins can generate tokens that WordPress sites use to self-register.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: Add registration_tokens table...\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_registration_tokens.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');

    console.log('Creating registration_tokens table...');
    await client.query(migrationSQL);
    console.log('✓ Table created');

    console.log('\nVerifying table structure...');
    const tableCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'registration_tokens'
      ORDER BY ordinal_position
    `);

    console.log('✓ Table structure:');
    tableCheck.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nChanges:');
    console.log('  - Created registration_tokens table');
    console.log('  - Added indexes for token and user_id lookups');
    console.log('  - Admins can now generate registration tokens');
    console.log('  - WordPress sites can self-register using tokens');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
