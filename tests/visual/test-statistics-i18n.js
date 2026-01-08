/**
 * Visual test for Statistics page i18n (RU/EN)
 * Tests multilingual support on statistics page
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

async function testStatisticsI18n() {
  console.log('Starting Statistics i18n Tests...\n');

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

  // Test 1: Russian Statistics Page (default)
  console.log('Test 1: Russian Statistics Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/statistics.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for Russian text elements
    const statisticsTitle = await page
      .$eval('[data-i18n="statisticsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const periodWeek = await page
      .$eval('[data-i18n="periodWeek"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Statistics title: ${statisticsTitle}`);
    console.log(`   Period week: ${periodWeek}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'statistics-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: statistics-ru.png');

    if (statisticsTitle.includes('Статистика') && periodWeek.includes('Неделя')) {
      results.passed++;
      results.tests.push({ name: 'Russian Statistics Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Statistics Page',
        status: 'FAIL',
        statisticsTitle,
        periodWeek
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Statistics Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Statistics Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for English text elements
    const statisticsTitle = await page
      .$eval('[data-i18n="statisticsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const periodWeek = await page
      .$eval('[data-i18n="periodWeek"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const periodDay = await page
      .$eval('[data-i18n="periodDay"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Statistics title: ${statisticsTitle}`);
    console.log(`   Period week: ${periodWeek}`);
    console.log(`   Period day: ${periodDay}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'statistics-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: statistics-en.png');

    if (
      statisticsTitle.includes('Statistics') &&
      periodWeek.includes('Week') &&
      periodDay.includes('Day')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Statistics Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Statistics Page',
        status: 'FAIL',
        statisticsTitle,
        periodWeek
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Statistics Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Spending Cards in English
  console.log('Test 3: Spending Cards (English)');
  try {
    const spendingDay = await page
      .$eval('[data-i18n="spendingDay"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const spendingMonth = await page
      .$eval('[data-i18n="spendingMonth"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Spending day: ${spendingDay}`);
    console.log(`   Spending month: ${spendingMonth}`);

    if (spendingDay.includes('Daily') && spendingMonth.includes('Monthly')) {
      results.passed++;
      results.tests.push({ name: 'Spending Cards EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Spending Cards EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Spending Cards EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Placements Stats Section in English
  console.log('Test 4: Placements Stats Section (English)');
  try {
    const placementsStatsTitle = await page
      .$eval('[data-i18n="placementsStatsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const totalPlacementsStat = await page
      .$eval('[data-i18n="totalPlacementsStat"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Placements stats title: ${placementsStatsTitle}`);
    console.log(`   Total placements stat: ${totalPlacementsStat}`);

    if (
      placementsStatsTitle.includes('Placement Statistics') &&
      totalPlacementsStat.includes('Total placements')
    ) {
      results.passed++;
      results.tests.push({ name: 'Placements Stats EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Placements Stats EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Placements Stats EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Balance Summary Section in English
  console.log('Test 5: Balance Summary Section (English)');
  try {
    const balanceSummaryTitle = await page
      .$eval('[data-i18n="balanceSummaryTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const currentBalanceStat = await page
      .$eval('[data-i18n="currentBalanceStat"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Balance summary title: ${balanceSummaryTitle}`);
    console.log(`   Current balance stat: ${currentBalanceStat}`);

    if (
      balanceSummaryTitle.includes('Balance Summary') &&
      currentBalanceStat.includes('Current balance')
    ) {
      results.passed++;
      results.tests.push({ name: 'Balance Summary EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Balance Summary EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Balance Summary EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Switch back to Russian
  console.log('Test 6: Switch Back to Russian');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const statisticsTitle = await page
      .$eval('[data-i18n="statisticsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const placementsStatsTitle = await page
      .$eval('[data-i18n="placementsStatsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Statistics title: ${statisticsTitle}`);
    console.log(`   Placements stats title: ${placementsStatsTitle}`);

    if (
      statisticsTitle.includes('Статистика') &&
      placementsStatsTitle.includes('Статистика размещений')
    ) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch to Russian',
        status: 'FAIL',
        statisticsTitle,
        placementsStatsTitle
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
    const icon = t.status === 'PASS' ? '\u2705' : t.status === 'FAIL' ? '\u274C' : '\u26A0\uFE0F';
    console.log(`   ${icon} ${t.name}: ${t.status}`);
  });

  console.log('\nScreenshots saved to:', CONFIG.screenshotDir);

  return results;
}

testStatisticsI18n().catch(console.error);
