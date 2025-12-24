/**
 * Migration Runner: Add Site Slot Rentals System
 * Run: node database/run_slot_rentals_migration.js
 */

require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Starting slot rentals migration...');

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_slot_rentals.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('Migration completed successfully!');

    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('site_slot_rentals', 'rental_placements')
    `);

    console.log('Created tables:');
    tables.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    // Show columns
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'site_slot_rentals'
      ORDER BY ordinal_position
    `);

    console.log('\nsite_slot_rentals columns:');
    columns.rows.forEach((col) => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'required'})`);
    });

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
