/**
 * Migration runner for limits_changed_at column
 * Adds tracking for when max_links/max_articles were last changed
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Starting limits_changed_at migration...');

    const migrationPath = path.join(__dirname, 'migrate_limits_cooldown.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('The limits_changed_at column has been added to the sites table.');
    console.log('This column tracks when max_links/max_articles were last changed.');
    console.log('Non-admin users can only change these values once every 6 months.');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
