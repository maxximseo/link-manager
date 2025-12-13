#!/usr/bin/env node
/**
 * Import data to Supabase from export file
 *
 * Usage:
 *   node scripts/import-to-supabase.js migration-data/export-TIMESTAMP.json
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

// Supabase connection config from .env
const config = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

async function importData(inputFile) {
  console.log('========================================');
  console.log('IMPORT TO SUPABASE');
  console.log('========================================\n');

  if (!inputFile) {
    console.error('Usage: node scripts/import-to-supabase.js <export-file.json>');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`ERROR: File not found: ${inputFile}`);
    process.exit(1);
  }

  if (!config.password) {
    console.error('ERROR: DB_PASSWORD not set in .env');
    process.exit(1);
  }

  console.log(`Target: ${config.host}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}\n`);

  // Read export file
  console.log('Reading export file...');
  const exportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  console.log(`Source: ${exportData.source || 'unknown'}`);
  console.log(`Export timestamp: ${exportData.timestamp}`);
  console.log(`Tables: ${Object.keys(exportData.tables).length}`);
  console.log(`Total records: ${exportData.metadata?.total_records || 'unknown'}\n`);

  const pool = new Pool(config);
  const startTime = Date.now();

  const stats = {
    imported: 0,
    skipped: 0,
    errors: 0,
    byTable: {}
  };

  try {
    console.log('Connecting to Supabase...');
    const client = await pool.connect();
    console.log('Connected!\n');

    // Start transaction
    await client.query('BEGIN');

    console.log('Importing tables...\n');

    for (const tableName of TABLES_ORDER) {
      const tableData = exportData.tables[tableName];

      if (!tableData || tableData.length === 0) {
        console.log(`  ${tableName}: Skipped (no data)`);
        stats.byTable[tableName] = { imported: 0, skipped: 0 };
        continue;
      }

      stats.byTable[tableName] = { imported: 0, skipped: 0 };

      for (const row of tableData) {
        try {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

          await client.query(
            `INSERT INTO ${tableName} (${columns.join(', ')})
             VALUES (${placeholders})
             ON CONFLICT DO NOTHING`,
            values
          );

          stats.byTable[tableName].imported++;
          stats.imported++;
        } catch (err) {
          if (err.code === '23505') {
            // Duplicate key - skip
            stats.byTable[tableName].skipped++;
            stats.skipped++;
          } else {
            console.error(`    Error in ${tableName}: ${err.message}`);
            stats.errors++;
          }
        }
      }

      const tableStats = stats.byTable[tableName];
      const status = tableStats.skipped > 0 ? '⚠️' : '✅';
      console.log(`  ${status} ${tableName}: ${tableStats.imported} imported, ${tableStats.skipped} skipped`);
    }

    // Update sequences
    console.log('\nUpdating sequences...');
    for (const tableName of TABLES_ORDER) {
      try {
        await client.query(`
          SELECT setval(pg_get_serial_sequence('${tableName}', 'id'),
                        COALESCE((SELECT MAX(id) FROM ${tableName}), 1),
                        true)
        `);
      } catch (err) {
        // Table might not have id column or sequence
      }
    }
    console.log('Sequences updated');

    // Commit transaction
    await client.query('COMMIT');
    client.release();

    const duration = Date.now() - startTime;

    console.log('\n========================================');
    console.log('IMPORT COMPLETE');
    console.log('========================================');
    console.log(`Imported: ${stats.imported}`);
    console.log(`Skipped (duplicates): ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Duration: ${duration}ms`);
    console.log('========================================\n');

    if (stats.errors > 0) {
      console.log('⚠️  Some errors occurred. Check logs above.');
    } else {
      console.log('✅ Import successful!');
    }

    console.log('\nNext: Test the application');
    console.log('npm run dev');

  } catch (error) {
    console.error('\nIMPORT FAILED:', error.message);

    try {
      const client = await pool.connect();
      await client.query('ROLLBACK');
      client.release();
    } catch (e) {
      // Ignore rollback errors
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

const inputFile = process.argv[2];
importData(inputFile);
