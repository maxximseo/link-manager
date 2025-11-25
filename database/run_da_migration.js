/**
 * Migration runner for adding DA (Domain Authority) column to sites table
 * Run with: node database/run_da_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Starting DA migration...');

  // Create connection pool (always use SSL for remote databases)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_da.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration...');
    await pool.query(migrationSQL);

    // Verify column exists
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'da'
    `);

    if (verifyResult.rows.length > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('Column details:', verifyResult.rows[0]);
    } else {
      console.error('❌ Migration failed: DA column not found');
      process.exit(1);
    }

    // Show current sites count
    const countResult = await pool.query('SELECT COUNT(*) FROM sites');
    console.log(`Total sites in database: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
