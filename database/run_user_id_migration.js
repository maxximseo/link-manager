const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Parse DATABASE_URL
const url = new URL(process.env.DATABASE_URL);
const config = {
  host: url.hostname,
  port: url.port || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false }
};

const pool = new Pool(config);

async function runMigration() {
  console.log('🔄 Starting user_id migration for placements table...');

  try {
    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_add_user_id_to_placements.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ Migration completed successfully!');

    // Verify changes
    console.log('\n📊 Verifying placements table...');
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'placements'
      AND column_name = 'user_id'
    `);

    if (columns.rows.length > 0) {
      console.log('✅ user_id column exists in placements table');
      console.log(columns.rows[0]);
    } else {
      console.log('❌ user_id column NOT found in placements table');
    }

    // Check if all placements have user_id populated
    const nullUserIds = await pool.query(`
      SELECT COUNT(*) as count
      FROM placements
      WHERE user_id IS NULL
    `);

    console.log(`\n📊 Placements without user_id: ${nullUserIds.rows[0].count}`);

    console.log('\n✨ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
