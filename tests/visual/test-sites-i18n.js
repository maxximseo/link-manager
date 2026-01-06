/**
 * Visual test for Sites page i18n (RU/EN)
 * Tests multilingual support on sites page
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

async function testSitesI18n() {
  console.log('Starting Sites i18n Tests...\n');

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

  // Test 1: Russian Sites Page (default)
  console.log('Test 1: Russian Sites Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/sites.html`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang'));
    const pageTitle = await page.title();

    // Check for Russian text elements
    const addSiteBtn = await page.$eval('[data-i18n="addSite"]', el => el.textContent);
    const filtersBtn = await page.$eval('[data-i18n="filters"]', el => el.textContent);

    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Add site button: ${addSiteBtn}`);
    console.log(`   Filters button: ${filtersBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'sites-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: sites-ru.png');

    if (lang === 'ru' && addSiteBtn.includes('Добавить') && filtersBtn.includes('Фильтры')) {
      results.passed++;
      results.tests.push({ name: 'Russian Sites Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Sites Page',
        status: 'FAIL',
        lang,
        addSiteBtn,
        filtersBtn
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Sites Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Sites Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang'));
    const pageTitle = await page.title();

    // Check for English text elements
    const addSiteBtn = await page.$eval('[data-i18n="addSite"]', el => el.textContent);
    const filtersBtn = await page.$eval('[data-i18n="filters"]', el => el.textContent);
    const exportBtn = await page.$eval('[data-i18n="export"]', el => el.textContent);

    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Add site button: ${addSiteBtn}`);
    console.log(`   Filters button: ${filtersBtn}`);
    console.log(`   Export button: ${exportBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'sites-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: sites-en.png');

    if (
      lang === 'en' &&
      addSiteBtn.includes('Add') &&
      filtersBtn.includes('Filter') &&
      exportBtn.includes('Export')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Sites Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Sites Page',
        status: 'FAIL',
        lang,
        addSiteBtn,
        filtersBtn
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Sites Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Bulk Registration Section in English
  console.log('Test 3: Bulk Registration Section (English)');
  try {
    const bulkTitle = await page.$eval('[data-i18n="bulkRegistration"]', el => el.textContent);
    const tokenLabel = await page.$eval('[data-i18n="tokenLabel"]', el => el.textContent);
    const maxUsesLabel = await page.$eval('[data-i18n="tokenMaxUses"]', el => el.textContent);

    console.log(`   Bulk registration title: ${bulkTitle}`);
    console.log(`   Token label: ${tokenLabel}`);
    console.log(`   Max uses label: ${maxUsesLabel}`);

    if (
      bulkTitle.includes('Bulk') &&
      tokenLabel.includes('Token') &&
      maxUsesLabel.includes('Max')
    ) {
      results.passed++;
      results.tests.push({ name: 'Bulk Registration EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Bulk Registration EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Bulk Registration EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Open Create Modal (English)
  console.log('Test 4: Create Modal (English)');
  try {
    // Click add site button to open modal
    await page.click('[data-i18n="addSite"]');
    await new Promise(r => setTimeout(r, 800));

    const modalTitle = await page.$eval('#modalTitle', el => el.textContent);
    const siteTypeLabel = await page.$eval('[data-i18n="siteType"]', el => el.textContent);
    const siteNameLabel = await page.$eval('[data-i18n="siteName"]', el => el.textContent);
    const cancelBtn = await page.$eval('[data-i18n="cancel"]', el => el.textContent);
    const saveBtn = await page.$eval('[data-i18n="save"]', el => el.textContent);

    console.log(`   Modal title: ${modalTitle}`);
    console.log(`   Site type label: ${siteTypeLabel}`);
    console.log(`   Site name label: ${siteNameLabel}`);
    console.log(`   Cancel button: ${cancelBtn}`);
    console.log(`   Save button: ${saveBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'sites-modal-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: sites-modal-en.png');

    // Close modal
    await page.click('.btn-close');
    await new Promise(r => setTimeout(r, 300));

    if (
      siteTypeLabel.includes('Site type') &&
      siteNameLabel.includes('Site name') &&
      cancelBtn === 'Cancel' &&
      saveBtn === 'Save'
    ) {
      results.passed++;
      results.tests.push({ name: 'Create Modal EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Create Modal EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Create Modal EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Switch back to Russian
  console.log('Test 5: Switch Back to Russian');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));

    const lang = await page.$eval('html', el => el.getAttribute('lang'));
    const addSiteBtn = await page.$eval('[data-i18n="addSite"]', el => el.textContent);
    const filtersBtn = await page.$eval('[data-i18n="filters"]', el => el.textContent);

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Add site button: ${addSiteBtn}`);
    console.log(`   Filters button: ${filtersBtn}`);

    if (lang === 'ru' && addSiteBtn.includes('Добавить') && filtersBtn.includes('Фильтры')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Switch to Russian', status: 'FAIL', lang, addSiteBtn });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Switch to Russian', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Create Modal in Russian
  console.log('Test 6: Create Modal (Russian)');
  try {
    // Click add site button to open modal
    await page.click('[data-i18n="addSite"]');
    await new Promise(r => setTimeout(r, 800));

    const siteTypeLabel = await page.$eval('[data-i18n="siteType"]', el => el.textContent);
    const siteNameLabel = await page.$eval('[data-i18n="siteName"]', el => el.textContent);
    const cancelBtn = await page.$eval('[data-i18n="cancel"]', el => el.textContent);
    const saveBtn = await page.$eval('[data-i18n="save"]', el => el.textContent);

    console.log(`   Site type label: ${siteTypeLabel}`);
    console.log(`   Site name label: ${siteNameLabel}`);
    console.log(`   Cancel button: ${cancelBtn}`);
    console.log(`   Save button: ${saveBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'sites-modal-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: sites-modal-ru.png');

    // Close modal
    await page.click('.btn-close');

    if (
      siteTypeLabel.includes('Тип') &&
      siteNameLabel.includes('Название') &&
      cancelBtn === 'Отмена' &&
      saveBtn === 'Сохранить'
    ) {
      results.passed++;
      results.tests.push({ name: 'Create Modal RU', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Create Modal RU', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Create Modal RU', status: 'ERROR', error: error.message });
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

testSitesI18n().catch(console.error);
