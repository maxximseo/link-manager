const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env'), override: true });

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
  console.log('🔄 Adding UNIQUE constraints to prevent race conditions...');

  try {
    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_add_unique_constraints.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ UNIQUE constraints added successfully!');

    // Verify indexes were created
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('placements', 'placement_content')
      AND indexname LIKE 'idx_%unique%' OR indexname LIKE 'idx_one_%'
      ORDER BY indexname
    `);

    console.log('\n📊 Created indexes:');
    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
      console.log(`    ${idx.indexdef}`);
    });

  } catch (error) {
    if (error.code === '23505') {
      console.log('⚠️  Some constraints already exist (this is OK)');
    } else if (error.message.includes('already exists')) {
      console.log('✅ Constraints already exist - migration previously applied');
    } else {
      console.error('❌ Migration failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

runMigration();
