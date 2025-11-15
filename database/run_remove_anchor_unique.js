/**
 * Migration runner: Remove UNIQUE constraint on anchor_text
 *
 * This migration allows duplicate anchor texts in project_links table.
 * Each link still maintains unique ID and single-use constraint via usage_limit.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: Remove UNIQUE constraint on anchor_text...\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_remove_anchor_unique.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');

    console.log('Dropping UNIQUE index idx_project_links_project_anchor_unique...');
    await client.query('DROP INDEX IF EXISTS idx_project_links_project_anchor_unique');
    console.log('✓ UNIQUE index dropped');

    console.log('\nCreating non-unique index idx_project_links_project_anchor...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_links_project_anchor
      ON project_links (project_id, LOWER(anchor_text))
    `);
    console.log('✓ Non-unique index created');

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nChanges:');
    console.log('  - Removed UNIQUE constraint on (project_id, anchor_text)');
    console.log('  - Created performance index (non-unique)');
    console.log('  - You can now add multiple links with the same anchor text');
    console.log('  - Each link has unique ID and usage_limit = 1');

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
