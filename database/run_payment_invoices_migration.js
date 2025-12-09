/**
 * Migration runner for payment_invoices table
 * Run with: node database/run_payment_invoices_migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigration() {
  console.log('Starting payment_invoices migration...');

  // Create pool with DATABASE_URL or individual vars
  // Always use SSL with rejectUnauthorized: false for DigitalOcean managed databases
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrate_add_payment_invoices.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration...');
    await pool.query(migrationSQL);

    // Verify table was created
    const verifyResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'payment_invoices'
      ORDER BY ordinal_position
    `);

    if (verifyResult.rows.length > 0) {
      console.log('\n✅ Migration successful! Table structure:');
      console.log('----------------------------------------');
      verifyResult.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type}`);
      });
      console.log('----------------------------------------');
    } else {
      console.error('❌ Migration failed: Table not created');
      process.exit(1);
    }

    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'payment_invoices'
    `);

    console.log('\nIndexes created:');
    indexResult.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    console.log('\n✅ Payment invoices migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);

    if (error.message.includes('already exists')) {
      console.log('\nℹ️  Table already exists. Migration may have been run before.');
    } else {
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

runMigration();
