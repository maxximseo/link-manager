const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

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
  console.log('🔄 Starting backfill migration for site_type...');

  try {
    // Count NULL values before migration
    const beforeCount = await pool.query(`
      SELECT COUNT(*) as null_count
      FROM sites
      WHERE site_type IS NULL
    `);

    console.log(`\n📊 Found ${beforeCount.rows[0].null_count} sites with NULL site_type`);

    if (parseInt(beforeCount.rows[0].null_count) === 0) {
      console.log('✅ No NULL values to backfill. Migration not needed.');
      return;
    }

    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_backfill_site_types.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ Migration completed successfully!');

    // Verify changes
    const afterCount = await pool.query(`
      SELECT COUNT(*) as null_count
      FROM sites
      WHERE site_type IS NULL
    `);

    console.log(`\n📊 After migration: ${afterCount.rows[0].null_count} sites with NULL site_type`);

    // Show site_type distribution
    const distribution = await pool.query(`
      SELECT
        site_type,
        COUNT(*) as count
      FROM sites
      GROUP BY site_type
      ORDER BY count DESC
    `);

    console.log('\n📈 Site type distribution:');
    distribution.rows.forEach(row => {
      console.log(`  ${row.site_type || 'NULL'}: ${row.count} sites`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
