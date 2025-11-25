/**
 * Migration runner for ref_domains, rd_main, norm columns
 * Run with: node database/run_ref_domains_migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Starting ref_domains/rd_main/norm migration...');

  // Create connection pool (always use SSL for remote databases)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const migrationPath = path.join(__dirname, 'migrate_add_ref_domains.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration...');
    await pool.query(sql);

    // Verify columns were added
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND column_name IN ('ref_domains', 'rd_main', 'norm')
      ORDER BY column_name
    `);

    console.log('✅ Migration completed successfully!');
    console.log('Column details:', result.rows);

    // Get count of sites
    const countResult = await pool.query('SELECT COUNT(*) FROM sites');
    console.log('Total sites in database:', countResult.rows[0].count);

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
