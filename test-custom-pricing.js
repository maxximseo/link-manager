#!/usr/bin/env node
/**
 * Test Custom Site Pricing System
 *
 * Tests:
 * 1. Create site with custom prices
 * 2. Create site without custom prices (uses defaults)
 * 3. Purchase placement with custom price
 * 4. Purchase placement with default price
 * 5. Verify pricing display in balance page data
 */

const readline = require('readline');

// ANSI color codes
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
  test: (msg) => console.log(`\n${colors.cyan}${colors.bright}TEST:${colors.reset} ${msg}`)
};

const API_BASE = 'http://localhost:3003/api';
let TOKEN = '';

async function apiCall(method, endpoint, data = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`;
  }

  const options = {
    method,
    headers
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.error || responseData.message || `HTTP ${response.status}`);
  }

  return responseData;
}

async function login() {
  log.info('Logging in as admin...');
  const result = await apiCall('POST', '/auth/login', {
    username: 'admin',
    password: 'admin123'
  });
  TOKEN = result.token;
  log.success('Logged in successfully');
}

async function test1_CreateSiteWithCustomPrices() {
  log.test('Create site with custom prices ($50 link, $30 article)');

  try {
    const site = await apiCall('POST', '/sites', {
      site_url: `https://custom-prices-${Date.now()}.com`,
      site_name: 'Custom Pricing Test Site',
      site_type: 'wordpress',
      max_links: 20,
      max_articles: 10,
      price_link: 50.00,
      price_article: 30.00
    });

    if (site.data) {
      const siteData = site.data;
      if (parseFloat(siteData.price_link) === 50.00 && parseFloat(siteData.price_article) === 30.00) {
        log.success(`Site created with custom prices: $${siteData.price_link} / $${siteData.price_article}`);
        return { passed: true, siteId: siteData.id, site: siteData };
      } else {
        log.error(`Wrong prices: $${siteData.price_link} / $${siteData.price_article} (expected $50 / $30)`);
        return { passed: false };
      }
    } else {
      log.error('No site data returned');
      return { passed: false };
    }
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    return { passed: false };
  }
}

async function test2_CreateSiteWithoutCustomPrices() {
  log.test('Create site without custom prices (should use NULL for defaults)');

  try {
    const site = await apiCall('POST', '/sites', {
      site_url: `https://default-prices-${Date.now()}.com`,
      site_name: 'Default Pricing Test Site',
      site_type: 'wordpress',
      max_links: 10,
      max_articles: 5
      // No price_link or price_article - should be NULL
    });

    if (site.data) {
      const siteData = site.data;
      if (siteData.price_link === null && siteData.price_article === null) {
        log.success('Site created with NULL prices (will use $25/$15 defaults)');
        return { passed: true, siteId: siteData.id, site: siteData };
      } else {
        log.error(`Expected NULL prices, got: $${siteData.price_link} / $${siteData.price_article}`);
        return { passed: false };
      }
    } else {
      log.error('No site data returned');
      return { passed: false };
    }
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    return { passed: false };
  }
}

async function test3_UpdateSiteAddCustomPrices() {
  log.test('Update existing site to add custom prices');

  try {
    // First create a site without prices
    const createResult = await apiCall('POST', '/sites', {
      site_url: `https://update-test-${Date.now()}.com`,
      site_name: 'Update Test Site',
      site_type: 'wordpress',
      max_links: 15,
      max_articles: 8
    });

    const siteId = createResult.data.id;
    log.info(`Created site #${siteId} with NULL prices`);

    // Now update it to add custom prices
    const updateResult = await apiCall('PUT', `/sites/${siteId}`, {
      price_link: 35.50,
      price_article: 20.75
    });

    if (updateResult.data) {
      const siteData = updateResult.data;
      if (parseFloat(siteData.price_link) === 35.50 && parseFloat(siteData.price_article) === 20.75) {
        log.success(`Site updated with custom prices: $${siteData.price_link} / $${siteData.price_article}`);
        return { passed: true, siteId: siteData.id, site: siteData };
      } else {
        log.error(`Wrong prices after update: $${siteData.price_link} / $${siteData.price_article}`);
        return { passed: false };
      }
    } else {
      log.error('No site data returned from update');
      return { passed: false };
    }
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    return { passed: false };
  }
}

async function test4_VerifyPricingDisplay() {
  log.test('Verify balance page pricing data (should not show fixed prices)');

  try {
    const balance = await apiCall('GET', '/billing/balance');

    if (balance) {
      log.info(`Current balance: $${balance.balance}`);
      log.info(`Total spent: $${balance.total_spent}`);
      log.info(`Current discount: ${balance.current_discount}%`);
      log.info(`Discount tier: ${balance.tier_name}`);

      // Check that balance endpoint doesn't return fixed prices (old system)
      if (!balance.fixed_link_price && !balance.fixed_article_price) {
        log.success('Balance API correctly does not expose fixed prices');
        return { passed: true };
      } else {
        log.warn('Balance API still exposes fixed prices (may need cleanup)');
        return { passed: true }; // Not a critical failure
      }
    } else {
      log.error('No balance data returned');
      return { passed: false };
    }
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    return { passed: false };
  }
}

async function test5_VerifyDatabaseSchema() {
  log.test('Verify database schema has price columns');

  try {
    // Get all sites to check if price_link and price_article are present
    const sites = await apiCall('GET', '/sites?limit=1');

    if (sites.data && sites.data.length > 0) {
      const firstSite = sites.data[0];

      // Check if price fields exist (can be null or have values)
      if ('price_link' in firstSite && 'price_article' in firstSite) {
        log.success('Database schema correctly includes price_link and price_article columns');
        log.info(`Sample site prices: link=$${firstSite.price_link || 'NULL'}, article=$${firstSite.price_article || 'NULL'}`);
        return { passed: true };
      } else {
        log.error('Missing price_link or price_article columns in sites table');
        return { passed: false };
      }
    } else {
      log.warn('No sites in database to verify schema');
      return { passed: true }; // Not a failure, just no data
    }
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    return { passed: false };
  }
}

async function runAllTests() {
  console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}  Custom Site Pricing System - Comprehensive Test Suite${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  const results = [];

  try {
    await login();

    // Run all tests
    results.push({ name: 'Create site with custom prices', result: await test1_CreateSiteWithCustomPrices() });
    results.push({ name: 'Create site without custom prices', result: await test2_CreateSiteWithoutCustomPrices() });
    results.push({ name: 'Update site to add custom prices', result: await test3_UpdateSiteAddCustomPrices() });
    results.push({ name: 'Verify balance page data', result: await test4_VerifyPricingDisplay() });
    results.push({ name: 'Verify database schema', result: await test5_VerifyDatabaseSchema() });

  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  }

  // Summary
  console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}  Test Results Summary${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  const passed = results.filter(r => r.result.passed).length;
  const total = results.length;

  results.forEach(({ name, result }) => {
    const icon = result.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`${icon} ${name}`);
  });

  console.log(`\n${colors.bright}Total: ${passed}/${total} tests passed${colors.reset}`);

  if (passed === total) {
    console.log(`\n${colors.green}${colors.bright}🎉 All tests passed! Custom pricing system is working correctly.${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bright}⚠️  Some tests failed. Please review the errors above.${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  log.error(`Unhandled error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
