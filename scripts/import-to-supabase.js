const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

console.log('===========================================');
console.log('IMPORT DATA TO SUPABASE');
console.log('===========================================\n');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_CONFIG = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

const IMPORT_ORDER = [
  'users',
  'discount_tiers',
  'projects',
  'sites',
  'project_links',
  'project_articles',
  'transactions',
  'placements',
  'placement_content',
  'renewal_history',
  'referral_transactions',
  'referral_withdrawals',
  'notifications',
  'audit_log',
  'registration_tokens'
];

async function importData(exportFile) {
  const pool = new Pool(SUPABASE_CONFIG);

  try {
    console.log('Reading export file...');
    const data = JSON.parse(await fs.readFile(exportFile, 'utf-8'));
    console.log('✅ Export file loaded\n');

    console.log('Connecting to Supabase database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected successfully!\n');

    console.log('⚠️  WARNING: This will import data into Supabase');
    console.log('Make sure you have backed up any existing data\n');

    let totalImported = 0;
    let totalSkipped = 0;

    await pool.query('BEGIN');

    for (const table of IMPORT_ORDER) {
      const records = data[table] || [];

      if (records.length === 0) {
        console.log(`⏭️  Skipping ${table} (no data)`);
        continue;
      }

      console.log(`📥 Importing ${records.length} records into ${table}...`);

      try {
        for (const record of records) {
          const columns = Object.keys(record);
          const values = Object.values(record);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

          const insertQuery = `
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (id) DO NOTHING
          `;

          await pool.query(insertQuery, values);
        }

        console.log(`   ✅ Imported ${records.length} records into ${table}`);
        totalImported += records.length;

      } catch (error) {
        console.log(`   ⚠️  Error importing ${table}: ${error.message}`);
        totalSkipped += records.length;
      }
    }

    console.log('\n🔄 Updating sequences...');
    for (const table of IMPORT_ORDER) {
      try {
        await pool.query(`
          SELECT setval(
            pg_get_serial_sequence('${table}', 'id'),
            COALESCE((SELECT MAX(id) FROM ${table}), 1),
            true
          )
        `);
        console.log(`   ✅ Updated sequence for ${table}`);
      } catch (error) {
        console.log(`   ⚠️  No sequence for ${table} (skipped)`);
      }
    }

    await pool.query('COMMIT');

    console.log(`\n===========================================`);
    console.log(`✅ IMPORT COMPLETED`);
    console.log(`===========================================`);
    console.log(`Total records imported: ${totalImported}`);
    console.log(`Total records skipped: ${totalSkipped}`);
    console.log(`\n✅ Data successfully imported to Supabase!`);
    console.log(`\nNext steps:`);
    console.log(`1. Test your application: npm start`);
    console.log(`2. Verify data in Supabase Dashboard`);
    console.log(`3. Update WordPress plugins with new API endpoint`);

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Import failed:', error.message);
    console.error('\nTransaction rolled back. Database is unchanged.');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const exportFile = process.argv[2];

if (!exportFile) {
  console.error('❌ Error: Please provide export file path\n');
  console.log('Usage:');
  console.log('node scripts/import-to-supabase.js path/to/export-file.json\n');
  process.exit(1);
}

if (!SUPABASE_CONFIG.password) {
  console.error('❌ Error: DB_PASSWORD is not set in .env file\n');
  console.log('Please set DB_PASSWORD in your .env file');
  process.exit(1);
}

importData(exportFile);
