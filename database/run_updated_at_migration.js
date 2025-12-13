/**
 * Migration runner: Add updated_at column to tables that need it
 *
 * Fixes errors like:
 * - "column updated_at of relation placements does not exist"
 * - "column updated_at of relation project_links does not exist"
 *
 * Usage: node database/run_updated_at_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');

// Always use SSL for DigitalOcean
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TABLES_TO_UPDATE = [
  { table: 'placements', fallback: 'published_at' },
  { table: 'project_links', fallback: 'created_at' },
  { table: 'project_articles', fallback: 'created_at' },
  { table: 'registration_tokens', fallback: 'created_at' }
];

async function addUpdatedAtToTable(tableName, fallbackColumn) {
  console.log(`\n📋 Processing table: ${tableName}`);

  // Check if column already exists
  const checkResult = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name = 'updated_at'
  `, [tableName]);

  if (checkResult.rows.length > 0) {
    console.log(`   ✅ Column updated_at already exists`);
    return;
  }

  // Add the column
  console.log(`   📝 Adding updated_at column...`);
  await pool.query(`
    ALTER TABLE ${tableName}
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);
  console.log(`   ✓ Column added successfully`);

  // Update existing records
  console.log(`   📝 Updating existing records...`);
  const updateResult = await pool.query(`
    UPDATE ${tableName}
    SET updated_at = COALESCE(${fallbackColumn}, NOW())
    WHERE updated_at IS NULL
  `);
  console.log(`   ✓ Updated ${updateResult.rowCount} records`);
}

async function runMigration() {
  console.log('🚀 Starting migration: Add updated_at columns to tables...');

  try {
    for (const { table, fallback } of TABLES_TO_UPDATE) {
      await addUpdatedAtToTable(table, fallback);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('   All tables now have updated_at column.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
