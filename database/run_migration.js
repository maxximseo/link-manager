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
  console.log('🔄 Starting migration...');

  try {
    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_usage_limits.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ Migration completed successfully!');

    // Verify changes
    const links = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'project_links'
      AND column_name IN ('usage_limit', 'usage_count', 'status')
    `);

    const articles = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'project_articles'
      AND column_name IN ('usage_limit', 'usage_count', 'status')
    `);

    console.log('\n📊 Verification:');
    console.log('project_links columns:', links.rows);
    console.log('project_articles columns:', articles.rows);

    // Show usage counts
    const linkUsage = await pool.query(`
      SELECT
        COUNT(*) as total_links,
        SUM(usage_count) as total_usage,
        COUNT(CASE WHEN status = 'exhausted' THEN 1 END) as exhausted
      FROM project_links
    `);

    const articleUsage = await pool.query(`
      SELECT
        COUNT(*) as total_articles,
        SUM(usage_count) as total_usage,
        COUNT(CASE WHEN status = 'exhausted' THEN 1 END) as exhausted
      FROM project_articles
    `);

    console.log('\n📈 Current usage stats:');
    console.log('Links:', linkUsage.rows[0]);
    console.log('Articles:', articleUsage.rows[0]);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
