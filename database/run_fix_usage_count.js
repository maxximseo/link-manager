/**
 * Run fix_usage_count migration
 * Updates usage_count for already placed articles and links
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use the same database connection as the app
const { Pool } = require('pg');

// Parse DATABASE_URL if available
let config;
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  config = {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1),
    user: url.username,
    password: url.password,
    ssl: url.hostname.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : false
  };
} else {
  config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'linkmanager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  };
}

const pool = new Pool(config);

async function runMigration() {
  console.log('🔄 Running fix_usage_count migration...');
  console.log('📍 Database:', config.database, 'on', config.host);

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'fix_usage_count.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute migration
    const result = await pool.query(sql);

    console.log('✅ Migration completed successfully!');

    // Show results
    if (result.length > 0 && result[result.length - 1].rows) {
      console.log('\n📊 Results:');
      result[result.length - 1].rows.forEach(row => {
        console.log(`  ${row.info}: ${row.count}`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
