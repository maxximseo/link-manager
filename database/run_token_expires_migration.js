/**
 * Migration runner for token expiration
 * Run: node database/run_token_expires_migration.js
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
    console.log('🚀 Running token expiration migration...');

    const migrationPath = path.join(__dirname, 'migrate_token_expires.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('   - Added verification_token_expires_at column');
    console.log('   - Created index on verification_token');
    console.log('   - Updated existing pending tokens');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
