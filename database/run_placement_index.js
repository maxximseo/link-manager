require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrate_add_placement_index.sql'),
      'utf8'
    );

    console.log('Running migration: Add placement composite index...');
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('Index idx_placements_project_site created on placements(project_id, site_id)');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
