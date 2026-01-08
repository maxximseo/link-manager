/**
 * Visual test for Placements Manager page i18n (RU/EN)
 * Tests multilingual support on placements manager page
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { loadCredentials } = require('../utils/credentials');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  screenshotDir: path.join(__dirname, 'screenshots'),
  credentials: loadCredentials()
};

// Ensure screenshots directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

async function testPlacementsManagerI18n() {
  console.log('Starting Placements Manager i18n Tests...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Login first
  console.log('Logging in...');
  try {
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard (SPA-style navigation)
    await page.waitForFunction(() => window.location.pathname.includes('dashboard'), {
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 1000)); // Wait for page to settle
    console.log('   Logged in successfully\n');
  } catch (error) {
    console.log(`   Login failed: ${error.message}\n`);
    await browser.close();
    return results;
  }

  // Test 1: Russian Placements Manager Page (default)
  console.log('Test 1: Russian Placements Manager Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/placements-manager.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'ru');

    // Check for Russian text elements
    const allLinksTab = await page
      .$eval('[data-i18n="allLinks"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const filterByProject = await page
      .$eval('[data-i18n="filterByProject"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   All Links tab: ${allLinksTab}`);
    console.log(`   Filter by project: ${filterByProject}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'placements-manager-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: placements-manager-ru.png');

    if (allLinksTab.includes('Все') && filterByProject.includes('Фильтр')) {
      results.passed++;
      results.tests.push({ name: 'Russian Placements Manager Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Placements Manager Page',
        status: 'FAIL',
        allLinksTab,
        filterByProject
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({
      name: 'Russian Placements Manager Page',
      status: 'ERROR',
      error: error.message
    });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Placements Manager Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'en');

    // Check for English text elements
    const allLinksTab = await page
      .$eval('[data-i18n="allLinks"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const activeLinksTab = await page
      .$eval('[data-i18n="activeLinks"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const filterByProject = await page
      .$eval('[data-i18n="filterByProject"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   All Links tab: ${allLinksTab}`);
    console.log(`   Active Links tab: ${activeLinksTab}`);
    console.log(`   Filter by project: ${filterByProject}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'placements-manager-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: placements-manager-en.png');

    if (
      allLinksTab.includes('All') &&
      activeLinksTab.includes('Active') &&
      filterByProject.includes('Filter')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Placements Manager Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Placements Manager Page',
        status: 'FAIL',
        allLinksTab,
        filterByProject
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({
      name: 'English Placements Manager Page',
      status: 'ERROR',
      error: error.message
    });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Table Headers in English
  console.log('Test 3: Table Headers (English)');
  try {
    const thProjectSite = await page
      .$eval('[data-i18n="thProjectSite"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const thPrice = await page
      .$eval('[data-i18n="thPrice"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const thActions = await page
      .$eval('[data-i18n="thActions"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Project/Site header: ${thProjectSite}`);
    console.log(`   Price header: ${thPrice}`);
    console.log(`   Actions header: ${thActions}`);

    if (
      thProjectSite.includes('PROJECT') &&
      thPrice.includes('PRICE') &&
      thActions.includes('ACTIONS')
    ) {
      results.passed++;
      results.tests.push({ name: 'Table Headers EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Table Headers EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Table Headers EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Filters Section in English
  console.log('Test 4: Filters Section (English)');
  try {
    const allTypes = await page
      .$eval('[data-i18n="allTypes"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const dateFrom = await page
      .$eval('[data-i18n="dateFrom"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const dateTo = await page
      .$eval('[data-i18n="dateTo"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   All types: ${allTypes}`);
    console.log(`   Date from: ${dateFrom}`);
    console.log(`   Date to: ${dateTo}`);

    if (
      allTypes.includes('All types') &&
      dateFrom.includes('Date from') &&
      dateTo.includes('Date to')
    ) {
      results.passed++;
      results.tests.push({ name: 'Filters Section EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Filters Section EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Filters Section EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Column Settings in English
  console.log('Test 5: Column Settings (English)');
  try {
    const visibleColumns = await page
      .$eval('[data-i18n="visibleColumns"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const priceColumn = await page
      .$eval('[data-i18n="priceColumn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const actionsColumn = await page
      .$eval('[data-i18n="actionsColumn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Visible columns: ${visibleColumns}`);
    console.log(`   Price column: ${priceColumn}`);
    console.log(`   Actions column: ${actionsColumn}`);

    if (
      visibleColumns.includes('Visible') &&
      priceColumn.includes('Price') &&
      actionsColumn.includes('Actions')
    ) {
      results.passed++;
      results.tests.push({ name: 'Column Settings EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Column Settings EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Column Settings EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Switch back to Russian
  console.log('Test 6: Switch Back to Russian');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'ru');
    const allLinksTab = await page
      .$eval('[data-i18n="allLinks"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const filterByProject = await page
      .$eval('[data-i18n="filterByProject"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   All Links tab: ${allLinksTab}`);
    console.log(`   Filter by project: ${filterByProject}`);

    if (allLinksTab.includes('Все') && filterByProject.includes('Фильтр')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch to Russian',
        status: 'FAIL',
        allLinksTab,
        filterByProject
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Switch to Russian', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  await browser.close();

  // Print summary
  console.log('='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`   Passed: ${results.passed}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Total:  ${results.tests.length}`);
  console.log('='.repeat(50));

  results.tests.forEach(t => {
    const icon = t.status === 'PASS' ? '✅' : t.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`   ${icon} ${t.name}: ${t.status}`);
  });

  console.log('\nScreenshots saved to:', CONFIG.screenshotDir);

  return results;
}

testPlacementsManagerI18n().catch(console.error);
