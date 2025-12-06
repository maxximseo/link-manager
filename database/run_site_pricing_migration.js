const { pool } = require('../backend/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting site pricing migration...');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrate_add_site_pricing.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('✅ Site pricing migration completed successfully');
    console.log('📊 Added columns: price_link, price_article to sites table');
    console.log('💡 Existing sites will use NULL (defaults to $25 for links, $15 for articles)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
