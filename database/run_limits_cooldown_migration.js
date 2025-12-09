/**
 * Migration runner for limits_changed_at column
 * Adds tracking for when max_links/max_articles were last changed
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Parse DATABASE_URL like main app does
  let dbConfig = {};

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    dbConfig = {
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: decodeURIComponent(url.password),
      ssl: url.hostname.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : false
    };
  }

  const pool = new Pool(dbConfig);

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
