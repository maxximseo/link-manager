/**
 * Migration script to remove description column from projects table
 * Uses existing database connection from config
 */

const { query } = require('../backend/config/database');

async function runMigration() {
  try {
    console.log('Starting migration: Remove description from projects...');

    const result = await query('ALTER TABLE projects DROP COLUMN IF EXISTS description');

    console.log('✅ Migration completed successfully');
    console.log('Result:', result);

    // Exit after query completes
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
