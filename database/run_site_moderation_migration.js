/**
 * Migration Runner: Site Moderation System
 * Adds moderation_status and rejection_reason columns to sites table
 *
 * Run: node database/run_site_moderation_migration.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import database connection
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('🚀 Starting Site Moderation Migration...\n');

  const client = await pool.connect();

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_site_moderation.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Running migration SQL...\n');

    await client.query('BEGIN');

    // Execute migration
    await client.query(migrationSQL);

    await client.query('COMMIT');

    console.log('✅ Migration completed successfully!\n');

    // Verify columns exist
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites'
      AND column_name IN ('moderation_status', 'rejection_reason')
      ORDER BY column_name
    `);

    console.log('📊 Verification - New columns in sites table:');
    verifyResult.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'none'})`);
    });

    // Show current status distribution
    const statsResult = await client.query(`
      SELECT moderation_status, COUNT(*) as count
      FROM sites
      GROUP BY moderation_status
      ORDER BY count DESC
    `);

    console.log('\n📈 Current moderation status distribution:');
    statsResult.rows.forEach(row => {
      console.log(`   - ${row.moderation_status}: ${row.count} sites`);
    });

    console.log('\n✨ Site moderation system is ready!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
