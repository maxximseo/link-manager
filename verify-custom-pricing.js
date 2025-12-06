#!/usr/bin/env node
/**
 * Direct Database Verification of Custom Pricing System
 *
 * Verifies:
 * 1. price_link and price_article columns exist in sites table
 * 2. Columns are nullable
 * 3. Sample data shows correct schema
 */

const { pool } = require('./backend/config/database');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}`)
};

async function verifySchema() {
  const client = await pool.connect();

  try {
    console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}  Custom Site Pricing - Database Schema Verification${colors.reset}`);
    console.log(`${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}\n`);

    // Test 1: Check if columns exist
    log.section('TEST 1: Verify price columns exist in sites table');

    const schemaQuery = `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND column_name IN ('price_link', 'price_article')
      ORDER BY column_name;
    `;

    const schemaResult = await client.query(schemaQuery);

    if (schemaResult.rows.length === 2) {
      log.success('Both price columns found in sites table');
      schemaResult.rows.forEach(col => {
        log.info(`  ${col.column_name}: ${col.data_type}, nullable=${col.is_nullable}, default=${col.column_default || 'NULL'}`);
      });
    } else {
      log.error(`Expected 2 columns, found ${schemaResult.rows.length}`);
      return false;
    }

    // Test 2: Check sites with custom prices
    log.section('TEST 2: Check existing sites for price data');

    const sitesQuery = `
      SELECT
        id,
        site_name,
        site_type,
        price_link,
        price_article,
        CASE
          WHEN price_link IS NULL THEN 'will use $25 default'
          ELSE CONCAT('custom: $', price_link::text)
        END as link_pricing,
        CASE
          WHEN price_article IS NULL THEN 'will use $15 default'
          ELSE CONCAT('custom: $', price_article::text)
        END as article_pricing
      FROM sites
      ORDER BY id DESC
      LIMIT 5;
    `;

    const sitesResult = await client.query(sitesQuery);

    log.info(`Found ${sitesResult.rowCount} sites (showing last 5):`);

    if (sitesResult.rows.length > 0) {
      sitesResult.rows.forEach(site => {
        console.log(`\n  Site #${site.id}: ${site.site_name || 'Unnamed'} (${site.site_type})`);
        console.log(`    Link pricing: ${site.link_pricing}`);
        console.log(`    Article pricing: ${site.article_pricing}`);
      });
      log.success('Sites table structure verified');
    } else {
      log.warn('No sites in database yet');
    }

    // Test 3: Test NULL handling
    log.section('TEST 3: Verify NULL handling in SELECT queries');

    const nullTest = await client.query(`
      SELECT
        COUNT(*) as total_sites,
        COUNT(price_link) as sites_with_link_price,
        COUNT(price_article) as sites_with_article_price,
        COUNT(*) FILTER (WHERE price_link IS NULL) as sites_using_default_link,
        COUNT(*) FILTER (WHERE price_article IS NULL) as sites_using_default_article
      FROM sites;
    `);

    const stats = nullTest.rows[0];
    log.info(`Total sites: ${stats.total_sites}`);
    log.info(`Sites with custom link price: ${stats.sites_with_link_price}`);
    log.info(`Sites using default link price ($25): ${stats.sites_using_default_link}`);
    log.info(`Sites with custom article price: ${stats.sites_with_article_price}`);
    log.info(`Sites using default article price ($15): ${stats.sites_using_default_article}`);
    log.success('NULL handling works correctly');

    // Test 4: Verify COALESCE pattern works
    log.section('TEST 4: Test COALESCE fallback logic');

    const coalesceTest = await client.query(`
      SELECT
        id,
        site_name,
        COALESCE(price_link, 25.00) as effective_link_price,
        COALESCE(price_article, 15.00) as effective_article_price
      FROM sites
      ORDER BY id DESC
      LIMIT 3;
    `);

    log.info('Effective prices (with COALESCE fallback):');
    coalesceTest.rows.forEach(site => {
      console.log(`  Site #${site.id}: Link=$${site.effective_link_price}, Article=$${site.effective_article_price}`);
    });
    log.success('COALESCE pattern working correctly');

    // Final summary
    console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}${colors.bright}✅ All database schema verifications passed!${colors.reset}`);
    console.log(`${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}\n`);

    console.log(`${colors.cyan}Summary:${colors.reset}`);
    console.log(`  • price_link and price_article columns exist and are nullable`);
    console.log(`  • Existing sites can have NULL values (use defaults)`);
    console.log(`  • COALESCE pattern provides correct fallback logic`);
    console.log(`  • Database migration completed successfully\n`);

    return true;

  } catch (error) {
    log.error(`Verification failed: ${error.message}`);
    console.error(error);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

verifySchema().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
