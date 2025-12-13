#!/usr/bin/env node
/**
 * Export data from DigitalOcean PostgreSQL
 * Creates a JSON file with all data for migration to Supabase
 *
 * Usage:
 *   export OLD_DB_HOST=your-host.db.ondigitalocean.com
 *   export OLD_DB_PORT=25060
 *   export OLD_DB_NAME=defaultdb
 *   export OLD_DB_USER=doadmin
 *   export OLD_DB_PASSWORD=your-password
 *   node scripts/export-from-digitalocean.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Tables in dependency order (parents before children)
const TABLES_ORDER = [
  'users',
  'discount_tiers',
  'projects',
  'sites',
  'project_links',
  'project_articles',
  'placements',
  'placement_content',
  'transactions',
  'renewal_history',
  'referral_transactions',
  'referral_withdrawals',
  'notifications',
  'audit_log',
  'registration_tokens'
];

// DigitalOcean connection config
const config = {
  host: process.env.OLD_DB_HOST || process.env.DB_HOST || 'db-postgresql-nyc3-90526-do-user-24010108-0.j.db.ondigitalocean.com',
  port: parseInt(process.env.OLD_DB_PORT || process.env.DB_PORT || '25060'),
  database: process.env.OLD_DB_NAME || process.env.DB_NAME || 'defaultdb',
  user: process.env.OLD_DB_USER || process.env.DB_USER || 'doadmin',
  password: process.env.OLD_DB_PASSWORD || process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

async function exportData() {
  console.log('========================================');
  console.log('EXPORT FROM DIGITALOCEAN');
  console.log('========================================\n');

  if (!config.password) {
    console.error('ERROR: Database password not set');
    console.error('Set OLD_DB_PASSWORD or DB_PASSWORD environment variable');
    process.exit(1);
  }

  console.log(`Host: ${config.host}`);
  console.log(`Port: ${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}\n`);

  const pool = new Pool(config);
  const startTime = Date.now();

  try {
    console.log('Connecting to DigitalOcean PostgreSQL...');
    const client = await pool.connect();
    console.log('Connected!\n');

    const exportData = {
      timestamp: new Date().toISOString(),
      source: 'digitalocean',
      database: config.database,
      tables: {},
      metadata: {
        total_records: 0,
        tables_count: 0,
        export_duration_ms: 0
      }
    };

    // Get list of existing tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);
    const existingTables = tablesResult.rows.map(r => r.table_name);

    console.log('Exporting tables...\n');

    for (const tableName of TABLES_ORDER) {
      if (!existingTables.includes(tableName)) {
        console.log(`  Skipping ${tableName} (not found)`);
        continue;
      }

      try {
        const result = await client.query(`SELECT * FROM ${tableName} ORDER BY id`);
        exportData.tables[tableName] = result.rows;
        exportData.metadata.total_records += result.rows.length;
        exportData.metadata.tables_count++;
        console.log(`  ${tableName}: ${result.rows.length} records`);
      } catch (err) {
        console.log(`  ${tableName}: ERROR - ${err.message}`);
      }
    }

    client.release();

    exportData.metadata.export_duration_ms = Date.now() - startTime;

    // Save to file
    const timestamp = Date.now();
    const outputDir = path.join(__dirname, '..', 'migration-data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `export-${timestamp}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

    console.log('\n========================================');
    console.log('EXPORT COMPLETE');
    console.log('========================================');
    console.log(`File: ${outputFile}`);
    console.log(`Tables: ${exportData.metadata.tables_count}`);
    console.log(`Records: ${exportData.metadata.total_records}`);
    console.log(`Duration: ${exportData.metadata.export_duration_ms}ms`);
    console.log('========================================\n');

    console.log('Next step: Run import to Supabase');
    console.log(`node scripts/import-to-supabase.js ${outputFile}`);

  } catch (error) {
    console.error('\nEXPORT FAILED:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

exportData();
