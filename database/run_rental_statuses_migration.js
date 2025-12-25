/**
 * Migration: Add pending_approval and rejected statuses to site_slot_rentals
 * Run this script to update the status constraint
 */

require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: rental statuses...');

    await client.query('BEGIN');

    // Drop existing constraint if exists
    await client.query(`
      ALTER TABLE site_slot_rentals
        DROP CONSTRAINT IF EXISTS site_slot_rentals_status_check
    `);
    console.log('  Dropped existing constraint');

    // Add new constraint with expanded status values
    await client.query(`
      ALTER TABLE site_slot_rentals
        ADD CONSTRAINT site_slot_rentals_status_check
        CHECK (status IN ('pending_approval', 'active', 'expired', 'cancelled', 'rejected'))
    `);
    console.log('  Added new constraint with statuses: pending_approval, active, expired, cancelled, rejected');

    // Add comment
    await client.query(`
      COMMENT ON COLUMN site_slot_rentals.status IS 'Rental status: pending_approval (awaiting tenant confirmation), active (confirmed and paid), expired (past expiry date), cancelled (cancelled by owner), rejected (rejected by tenant)'
    `);

    await client.query('COMMIT');

    // Verify
    const result = await client.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name = 'site_slot_rentals_status_check'
    `);

    if (result.rows.length > 0) {
      console.log('\n  Migration completed successfully!');
      console.log('  Constraint:', result.rows[0].check_clause);
    } else {
      console.log('\n  Warning: Could not verify constraint');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
