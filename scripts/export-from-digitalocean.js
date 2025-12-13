const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

console.log('===========================================');
console.log('EXPORT DATA FROM DIGITALOCEAN');
console.log('===========================================\n');

const DIGITALOCEAN_CONFIG = {
  host: process.env.OLD_DB_HOST || 'your-digitalocean-host.ondigitalocean.com',
  port: process.env.OLD_DB_PORT || 25060,
  database: process.env.OLD_DB_NAME || 'linkmanager',
  user: process.env.OLD_DB_USER || 'doadmin',
  password: process.env.OLD_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

const TABLES = [
  'users',
  'projects',
  'sites',
  'project_links',
  'project_articles',
  'transactions',
  'placements',
  'placement_content',
  'discount_tiers',
  'renewal_history',
  'referral_transactions',
  'referral_withdrawals',
  'notifications',
  'audit_log',
  'registration_tokens'
];

async function exportData() {
  const pool = new Pool(DIGITALOCEAN_CONFIG);

  try {
    console.log('Connecting to DigitalOcean database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected successfully!\n');

    const exportDir = path.join(__dirname, '..', 'migration-data');
    await fs.mkdir(exportDir, { recursive: true });

    const exportData = {};
    let totalRecords = 0;

    for (const table of TABLES) {
      console.log(`📦 Exporting table: ${table}...`);

      try {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        exportData[table] = result.rows;
        console.log(`   ✅ Exported ${result.rows.length} records from ${table}`);
        totalRecords += result.rows.length;
      } catch (error) {
        console.log(`   ⚠️  Table ${table} not found or error: ${error.message}`);
        exportData[table] = [];
      }
    }

    const exportFile = path.join(exportDir, `export-${Date.now()}.json`);
    await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));

    console.log(`\n===========================================`);
    console.log(`✅ EXPORT COMPLETED`);
    console.log(`===========================================`);
    console.log(`Total records exported: ${totalRecords}`);
    console.log(`Export file: ${exportFile}`);
    console.log(`\nNext step: Run import script to load data into Supabase`);
    console.log(`Command: node scripts/import-to-supabase.js ${exportFile}`);

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    console.error('\nPlease check:');
    console.error('1. DigitalOcean database is accessible');
    console.error('2. OLD_DB_* environment variables are set');
    console.error('3. Your IP is whitelisted in DigitalOcean');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (!DIGITALOCEAN_CONFIG.password) {
  console.error('❌ Error: OLD_DB_PASSWORD environment variable is not set\n');
  console.log('Usage:');
  console.log('OLD_DB_HOST=your-host.ondigitalocean.com \\');
  console.log('OLD_DB_PORT=25060 \\');
  console.log('OLD_DB_NAME=linkmanager \\');
  console.log('OLD_DB_USER=doadmin \\');
  console.log('OLD_DB_PASSWORD=your-password \\');
  console.log('node scripts/export-from-digitalocean.js\n');
  process.exit(1);
}

exportData();
