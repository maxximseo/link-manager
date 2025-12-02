/**
 * Migration runner: Add updated_at column to placements table
 *
 * Fixes the scheduled placements cron job failure:
 * "column updated_at of relation placements does not exist"
 *
 * Usage: node database/run_updated_at_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('digitalocean')
    ? { rejectUnauthorized: false }
    : false
});

async function runMigration() {
  console.log('🚀 Starting migration: Add updated_at column to placements...\n');

  try {
    // Step 1: Check if column already exists
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'placements'
        AND column_name = 'updated_at'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ Column updated_at already exists in placements table.');
      console.log('   Migration not needed.');
      await pool.end();
      return;
    }

    // Step 2: Add the column
    console.log('📝 Adding updated_at column...');
    await pool.query(`
      ALTER TABLE placements
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('   ✓ Column added successfully');

    // Step 3: Update existing records
    console.log('📝 Updating existing records with timestamps...');
    const updateResult = await pool.query(`
      UPDATE placements
      SET updated_at = COALESCE(published_at, NOW())
      WHERE updated_at IS NULL
    `);
    console.log(`   ✓ Updated ${updateResult.rowCount} records`);

    // Step 4: Verify
    console.log('📝 Verifying migration...');
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(updated_at) as with_updated_at,
             COUNT(*) - COUNT(updated_at) as without_updated_at
      FROM placements
    `);
    const stats = verifyResult.rows[0];
    console.log(`   ✓ Total placements: ${stats.total}`);
    console.log(`   ✓ With updated_at: ${stats.with_updated_at}`);
    console.log(`   ✓ Without updated_at: ${stats.without_updated_at}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('   Scheduled placements cron job should now work correctly.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
