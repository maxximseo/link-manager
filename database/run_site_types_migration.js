const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Parse DATABASE_URL
const url = new URL(process.env.DATABASE_URL);
const config = {
  host: url.hostname,
  port: url.port || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false }
};

const pool = new Pool(config);

async function runMigration() {
  console.log('🔄 Starting site_types migration...');

  try {
    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_add_site_types.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ Migration completed successfully!');

    // Verify changes
    console.log('\n📊 Verifying site_type column...');
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites'
      AND column_name = 'site_type'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✓ site_type column added:', columnCheck.rows[0]);
    } else {
      console.log('❌ site_type column not found!');
    }

    // Check existing sites
    console.log('\n📈 Current sites breakdown:');
    const sitesStats = await pool.query(`
      SELECT
        site_type,
        COUNT(*) as count
      FROM sites
      GROUP BY site_type
      ORDER BY site_type
    `);
    console.table(sitesStats.rows);

    console.log('\n✨ Site types migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Update site.service.js to handle site_type');
    console.log('2. Create /api/static/get-content-by-domain endpoint');
    console.log('3. Create PHP widget for static sites');
    console.log('4. Update frontend UI for site type selection');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
