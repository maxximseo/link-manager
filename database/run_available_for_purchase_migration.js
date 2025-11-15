/**
 * Migration runner: Add available_for_purchase column to sites table
 *
 * This migration adds a boolean column to control whether sites are available for purchase.
 * When available_for_purchase = FALSE, the site will not appear in placement purchase lists.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: Add available_for_purchase column to sites table...\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_available_for_purchase.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');

    console.log('Adding available_for_purchase column to sites table...');
    await client.query('ALTER TABLE sites ADD COLUMN IF NOT EXISTS available_for_purchase BOOLEAN DEFAULT TRUE');
    console.log('✓ Column added');

    console.log('\nUpdating existing sites to available_for_purchase = TRUE...');
    const updateResult = await client.query('UPDATE sites SET available_for_purchase = TRUE WHERE available_for_purchase IS NULL');
    console.log(`✓ Updated ${updateResult.rowCount} existing sites`);

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nChanges:');
    console.log('  - Added available_for_purchase column to sites table');
    console.log('  - Default value: TRUE (all sites available by default)');
    console.log('  - Existing sites updated to TRUE');
    console.log('  - Site owners can now disable purchases by setting this to FALSE');

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
