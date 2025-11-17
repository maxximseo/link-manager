const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting extended fields migration...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrate_add_extended_link_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('Added columns to project_links:');
    console.log('  - image_url (VARCHAR(500))');
    console.log('  - link_attributes (JSONB)');
    console.log('  - wrapper_config (JSONB)');
    console.log('  - custom_data (JSONB)');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
