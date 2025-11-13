/**
 * Migration Runner for allow_articles column
 * Adds allow_articles boolean column to sites table
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting allow_articles migration...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrate_add_allow_articles.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Changes applied:');
    console.log('  - Added allow_articles BOOLEAN column to sites table (default TRUE)');
    console.log('  - Set allow_articles = FALSE for all static_php sites');
    console.log('  - Created index on allow_articles for WordPress sites');
    console.log('');

    // Verify migration
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'allow_articles'
    `);

    if (result.rows.length > 0) {
      console.log('Verification successful:');
      console.log('  Column:', result.rows[0].column_name);
      console.log('  Type:', result.rows[0].data_type);
      console.log('  Default:', result.rows[0].column_default);
    } else {
      console.log('⚠️  Warning: Could not verify column creation');
    }

    // Show statistics
    const statsResult = await client.query(`
      SELECT
        site_type,
        allow_articles,
        COUNT(*) as count
      FROM sites
      GROUP BY site_type, allow_articles
      ORDER BY site_type, allow_articles
    `);

    if (statsResult.rows.length > 0) {
      console.log('');
      console.log('Current sites statistics:');
      statsResult.rows.forEach(row => {
        console.log(`  ${row.site_type}: allow_articles=${row.allow_articles} → ${row.count} sites`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Error details:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('');
    console.log('Migration runner finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('Migration runner failed');
    process.exit(1);
  });
