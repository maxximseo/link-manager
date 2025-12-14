/**
 * Visual test for Placements page i18n (RU/EN)
 * Tests multilingual support on placements page
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  screenshotDir: path.join(__dirname, 'screenshots'),
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

// Ensure screenshots directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

async function testPlacementsI18n() {
  console.log('Starting Placements i18n Tests...\n');

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
    await page.waitForFunction(
      () => window.location.pathname.includes('dashboard'),
      { timeout: 15000 }
    );
    await new Promise(r => setTimeout(r, 1000)); // Wait for page to settle
    console.log('   Logged in successfully\n');
  } catch (error) {
    console.log(`   Login failed: ${error.message}\n`);
    await browser.close();
    return results;
  }

  // Test 1: Russian Placements Page (default)
  console.log('Test 1: Russian Placements Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/placements.html`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'ru');
    const pageTitle = await page.title();

    // Check for Russian text elements
    const projectSelectionTitle = await page.$eval('[data-i18n="projectSelection"]', el => el.textContent).catch(() => 'NOT FOUND');
    const contentTypeTitle = await page.$eval('[data-i18n="contentType"]', el => el.textContent).catch(() => 'NOT FOUND');

    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Project Selection: ${projectSelectionTitle}`);
    console.log(`   Content Type: ${contentTypeTitle}`);

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'placements-ru.png'), fullPage: true });
    console.log('   Screenshot saved: placements-ru.png');

    if (projectSelectionTitle.includes('Выбор') && contentTypeTitle.includes('Тип')) {
      results.passed++;
      results.tests.push({ name: 'Russian Placements Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Russian Placements Page', status: 'FAIL', projectSelectionTitle, contentTypeTitle });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Placements Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Placements Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'en');
    const pageTitle = await page.title();

    // Check for English text elements
    const projectSelectionTitle = await page.$eval('[data-i18n="projectSelection"]', el => el.textContent).catch(() => 'NOT FOUND');
    const contentTypeTitle = await page.$eval('[data-i18n="contentType"]', el => el.textContent).catch(() => 'NOT FOUND');
    const availableSitesTitle = await page.$eval('[data-i18n="availableSites"]', el => el.textContent).catch(() => 'NOT FOUND');

    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Project Selection: ${projectSelectionTitle}`);
    console.log(`   Content Type: ${contentTypeTitle}`);
    console.log(`   Available Sites: ${availableSitesTitle}`);

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'placements-en.png'), fullPage: true });
    console.log('   Screenshot saved: placements-en.png');

    if (projectSelectionTitle.includes('Project') && contentTypeTitle.includes('Content') && availableSitesTitle.includes('Available')) {
      results.passed++;
      results.tests.push({ name: 'English Placements Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'English Placements Page', status: 'FAIL', projectSelectionTitle, contentTypeTitle, availableSitesTitle });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Placements Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Publication Settings in English
  console.log('Test 3: Publication Settings (English)');
  try {
    const publicationSettingsTitle = await page.$eval('[data-i18n="publicationSettings"]', el => el.textContent).catch(() => 'NOT FOUND');
    const publishImmediately = await page.$eval('[data-i18n="publishImmediately"]', el => el.textContent).catch(() => 'NOT FOUND');
    const delayedPublication = await page.$eval('[data-i18n="delayedPublication"]', el => el.textContent).catch(() => 'NOT FOUND');

    console.log(`   Publication Settings: ${publicationSettingsTitle}`);
    console.log(`   Publish Immediately: ${publishImmediately}`);
    console.log(`   Delayed Publication: ${delayedPublication}`);

    if (publicationSettingsTitle.includes('Publication') && publishImmediately.includes('immediately')) {
      results.passed++;
      results.tests.push({ name: 'Publication Settings EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Publication Settings EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Publication Settings EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Zone Cards in English
  console.log('Test 4: Zone Cards (English)');
  try {
    const fastZone = await page.$eval('[data-i18n="fast"]', el => el.textContent).catch(() => 'NOT FOUND');
    const mediumZone = await page.$eval('[data-i18n="medium"]', el => el.textContent).catch(() => 'NOT FOUND');
    const slowZone = await page.$eval('[data-i18n="slow"]', el => el.textContent).catch(() => 'NOT FOUND');

    console.log(`   Fast zone: ${fastZone}`);
    console.log(`   Medium zone: ${mediumZone}`);
    console.log(`   Slow zone: ${slowZone}`);

    if (fastZone === 'Fast' && mediumZone === 'Medium' && slowZone === 'Slow') {
      results.passed++;
      results.tests.push({ name: 'Zone Cards EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Zone Cards EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Zone Cards EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Whitelist/Blacklist Cards in English
  console.log('Test 5: Whitelist/Blacklist Cards (English)');
  try {
    const whitelistTitle = await page.$eval('[data-i18n="whitelistTitle"]', el => el.textContent).catch(() => 'NOT FOUND');
    const blacklistTitle = await page.$eval('[data-i18n="blacklistTitle"]', el => el.textContent).catch(() => 'NOT FOUND');
    const whitelistDesc = await page.$eval('[data-i18n="whitelistDesc"]', el => el.textContent).catch(() => 'NOT FOUND');

    console.log(`   Whitelist title: ${whitelistTitle}`);
    console.log(`   Blacklist title: ${blacklistTitle}`);
    console.log(`   Whitelist desc: ${whitelistDesc}`);

    if (whitelistTitle === 'Whitelist' && blacklistTitle === 'Blacklist' && whitelistDesc.includes('quick access')) {
      results.passed++;
      results.tests.push({ name: 'Whitelist/Blacklist EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Whitelist/Blacklist EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Whitelist/Blacklist EN', status: 'ERROR', error: error.message });
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
    const projectSelectionTitle = await page.$eval('[data-i18n="projectSelection"]', el => el.textContent).catch(() => 'NOT FOUND');
    const fastZone = await page.$eval('[data-i18n="fast"]', el => el.textContent).catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Project Selection: ${projectSelectionTitle}`);
    console.log(`   Fast zone: ${fastZone}`);

    if (projectSelectionTitle.includes('Выбор') && fastZone.includes('Быстро')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Switch to Russian', status: 'FAIL', projectSelectionTitle, fastZone });
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

testPlacementsI18n().catch(console.error);
