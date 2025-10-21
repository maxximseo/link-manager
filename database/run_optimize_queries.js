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
      path.join(__dirname, 'migrate_optimize_queries.sql'),
      'utf8'
    );

    // Remove psql-specific commands and SELECT query
    const lines = migrationSQL.split('\n');
    const cleanLines = [];
    let skipUntilSemicolon = false;

    for (const line of lines) {
      if (line.trim().startsWith('\\')) continue;
      if (line.trim().toLowerCase().startsWith('select ')) {
        skipUntilSemicolon = true;
        continue;
      }
      if (skipUntilSemicolon) {
        if (line.includes(';')) skipUntilSemicolon = false;
        continue;
      }
      cleanLines.push(line);
    }

    const cleanSQL = cleanLines.join('\n');

    console.log('Running migration: Optimize slow queries with composite indexes...');
    await client.query(cleanSQL);

    console.log('✅ Migration completed successfully!');
    console.log('Indexes created:');
    console.log('  - idx_sites_user_created on sites(user_id, created_at DESC)');
    console.log('  - idx_project_links_project on project_links(project_id, id)');
    console.log('  - idx_project_articles_project on project_articles(project_id, id)');
    console.log('  - idx_placement_content_placement_link on placement_content(placement_id, link_id)');
    console.log('  - idx_placement_content_placement_article on placement_content(placement_id, article_id)');
    console.log('  - idx_placements_site_project on placements(site_id, project_id, id)');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
