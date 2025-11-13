/**
 * Migration runner: Make api_key nullable for static PHP sites
 * Run with: node database/run_nullable_migration.js
 */

require('dotenv').config();
const { pool } = require('../backend/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting migration: Make api_key nullable...');

    // Check current constraint
    console.log('\n📋 Current api_key column definition:');
    const checkResult = await client.query(`
      SELECT column_name, is_nullable, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'api_key'
    `);

    if (checkResult.rows.length > 0) {
      const col = checkResult.rows[0];
      console.log(`   Column: ${col.column_name}`);
      console.log(`   Type: ${col.data_type}(${col.character_maximum_length})`);
      console.log(`   Nullable: ${col.is_nullable}`);

      if (col.is_nullable === 'YES') {
        console.log('\n✅ Column api_key is already nullable. No migration needed.');
        return;
      }
    }

    // Run migration
    console.log('\n🔧 Applying migration...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrate_nullable_api_key.sql'),
      'utf8'
    );

    await client.query(migrationSQL);

    // Verify result
    console.log('\n✅ Migration completed successfully!');

    const verifyResult = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'api_key'
    `);

    if (verifyResult.rows[0].is_nullable === 'YES') {
      console.log('✅ Verified: api_key is now nullable');
    } else {
      console.log('❌ Verification failed: api_key is still NOT NULL');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('\n✨ Migration process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration process failed:', error.message);
    process.exit(1);
  });
