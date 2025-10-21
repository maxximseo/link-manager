require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrate_add_usage_indexes.sql'),
      'utf8'
    );

    // Remove psql-specific commands
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('\\'))
      .join('\n');

    console.log('Running migration: Add usage tracking indexes...');
    await client.query(cleanSQL);

    console.log('✅ Migration completed successfully!');
    console.log('Indexes created:');
    console.log('  - idx_project_links_usage on project_links(project_id, usage_count, usage_limit)');
    console.log('  - idx_project_articles_usage on project_articles(project_id, usage_count, usage_limit)');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
