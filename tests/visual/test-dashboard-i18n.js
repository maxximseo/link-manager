/**
 * Visual test for Dashboard i18n (RU/EN)
 * Tests multilingual support on dashboard page
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

async function testDashboardI18n() {
  console.log('Starting Dashboard i18n Tests...\n');

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

  // Test 1: Russian Dashboard (default)
  console.log('Test 1: Russian Dashboard (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/dashboard.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 1000)); // Wait for translations to apply

    const pageTitle = await page.title();
    const lang = await page.$eval('html', el => el.getAttribute('lang'));

    // Check for Russian text elements
    const createBtnText = await page.$eval('[data-i18n="createProject"]', el => el.textContent);
    const projectsListText = await page.$eval('[data-i18n="projectsList"]', el => el.textContent);

    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Create button: ${createBtnText}`);
    console.log(`   Projects list header: ${projectsListText}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'dashboard-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: dashboard-ru.png');

    if (lang === 'ru' && createBtnText.includes('Создать') && projectsListText.includes('Список')) {
      results.passed++;
      results.tests.push({ name: 'Russian Dashboard', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Dashboard',
        status: 'FAIL',
        lang,
        createBtnText,
        projectsListText
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Dashboard', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Dashboard (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang'));

    // Check for English text elements
    const createBtnText = await page.$eval('[data-i18n="createProject"]', el => el.textContent);
    const projectsListText = await page.$eval('[data-i18n="projectsList"]', el => el.textContent);
    const totalProjectsText = await page.$eval('[data-i18n="totalProjects"]', el => el.textContent);

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Create button: ${createBtnText}`);
    console.log(`   Projects list header: ${projectsListText}`);
    console.log(`   Total projects label: ${totalProjectsText}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'dashboard-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: dashboard-en.png');

    if (
      lang === 'en' &&
      createBtnText.includes('Create') &&
      projectsListText.includes('Projects') &&
      totalProjectsText.includes('Total')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Dashboard', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Dashboard',
        status: 'FAIL',
        lang,
        createBtnText,
        projectsListText
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Dashboard', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Check table headers in English
  console.log('Test 3: Table Headers in English');
  try {
    const projectHeader = await page.$eval('[data-i18n="project"]', el => el.textContent);
    const createdHeader = await page.$eval('[data-i18n="created"]', el => el.textContent);
    const spentHeader = await page.$eval('[data-i18n="spent"]', el => el.textContent);
    const placedHeader = await page.$eval('[data-i18n="placed"]', el => el.textContent);

    console.log(`   Project header: ${projectHeader}`);
    console.log(`   Created header: ${createdHeader}`);
    console.log(`   Spent header: ${spentHeader}`);
    console.log(`   Placed header: ${placedHeader}`);

    if (
      projectHeader === 'Project' &&
      createdHeader === 'Created' &&
      spentHeader === 'Spent' &&
      placedHeader === 'Placed'
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

  // Test 4: Switch back to Russian
  console.log('Test 4: Switch Back to Russian');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    const lang = await page.$eval('html', el => el.getAttribute('lang'));
    const projectHeader = await page.$eval('[data-i18n="project"]', el => el.textContent);

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Project header: ${projectHeader}`);

    if (lang === 'ru' && projectHeader.includes('Проект')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Switch to Russian', status: 'FAIL', lang, projectHeader });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Switch to Russian', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Stats cards labels
  console.log('Test 5: Stats Cards Labels (Russian)');
  try {
    const totalSitesText = await page.$eval('[data-i18n="totalSites"]', el => el.textContent);
    const totalPlacementsText = await page.$eval(
      '[data-i18n="totalPlacements"]',
      el => el.textContent
    );
    const scheduledText = await page.$eval('[data-i18n="scheduled"]', el => el.textContent);

    console.log(`   Total sites: ${totalSitesText}`);
    console.log(`   Total placements: ${totalPlacementsText}`);
    console.log(`   Scheduled: ${scheduledText}`);

    if (
      totalSitesText.includes('сайтов') &&
      totalPlacementsText.includes('размещений') &&
      scheduledText.includes('Запланировано')
    ) {
      results.passed++;
      results.tests.push({ name: 'Stats Cards RU', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Stats Cards RU', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Stats Cards RU', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Modal translations
  console.log('Test 6: Modal Translations (Russian)');
  try {
    // Click create button to open modal
    await page.click('.btn-create');
    await new Promise(r => setTimeout(r, 500));

    const modalTitle = await page.$eval('#modalTitle', el => el.textContent);
    const projectNameLabel = await page.$eval('[data-i18n="projectName"]', el => el.textContent);
    const cancelBtn = await page.$eval('[data-i18n="cancel"]', el => el.textContent);
    const saveBtn = await page.$eval('[data-i18n="save"]', el => el.textContent);

    console.log(`   Modal title: ${modalTitle}`);
    console.log(`   Project name label: ${projectNameLabel}`);
    console.log(`   Cancel button: ${cancelBtn}`);
    console.log(`   Save button: ${saveBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'dashboard-modal-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: dashboard-modal-ru.png');

    // Close modal
    await page.click('.btn-close');

    if (
      modalTitle.includes('Создать') &&
      projectNameLabel.includes('Название') &&
      cancelBtn === 'Отмена' &&
      saveBtn === 'Сохранить'
    ) {
      results.passed++;
      results.tests.push({ name: 'Modal RU', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Modal RU', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Modal RU', status: 'ERROR', error: error.message });
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

testDashboardI18n().catch(console.error);
