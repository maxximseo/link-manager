/**
 * Migration runner for GEO column
 * Run with: node database/run_geo_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Starting GEO migration...');

  // Create connection pool (always use SSL for remote databases)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const migrationPath = path.join(__dirname, 'migrate_add_geo.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration...');
    await pool.query(sql);

    // Verify column was added
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND column_name = 'geo'
    `);

    console.log('✅ Migration completed successfully!');
    console.log('Column details:', result.rows);

    // Get count of sites
    const countResult = await pool.query('SELECT COUNT(*) FROM sites');
    console.log('Total sites in database:', countResult.rows[0].count);

    // Show sample GEO values
    const sampleResult = await pool.query('SELECT site_url, geo FROM sites LIMIT 5');
    console.log('Sample sites with GEO:', sampleResult.rows);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
