/**
 * Migration: Add site_endpoint_updates table
 * Run with: node database/run_endpoint_updates_migration.js
 */

const { query } = require('../backend/config/database');

async function runMigration() {
  console.log('Starting endpoint updates migration...');

  try {
    // Create table
    console.log('Creating site_endpoint_updates table...');
    await query(`
      CREATE TABLE IF NOT EXISTS site_endpoint_updates (
        id SERIAL PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        new_endpoint VARCHAR(500) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confirmed_at TIMESTAMP,
        CONSTRAINT unique_site_endpoint_update UNIQUE (site_id)
      )
    `);
    console.log('  Table created');

    // Create indexes
    console.log('Creating indexes...');
    await query(
      'CREATE INDEX IF NOT EXISTS idx_endpoint_updates_status ON site_endpoint_updates(status)'
    );
    await query(
      'CREATE INDEX IF NOT EXISTS idx_endpoint_updates_site_id ON site_endpoint_updates(site_id)'
    );
    console.log('  Indexes created');

    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

runMigration();
