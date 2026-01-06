/**
 * Visual test for Project Detail page i18n (RU/EN)
 * Tests multilingual support on project detail page
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

async function testProjectDetailI18n() {
  console.log('Starting Project Detail i18n Tests...\n');

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

  // First, get a project ID from the dashboard
  let projectId = null;
  try {
    await page.goto(`${CONFIG.baseUrl}/dashboard.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 2000));

    // Find a project link to get its ID
    projectId = await page.evaluate(() => {
      const link = document.querySelector('a[href*="project-detail.html?id="]');
      if (link) {
        const href = link.getAttribute('href');
        const match = href.match(/id=(\d+)/);
        return match ? match[1] : null;
      }
      return null;
    });

    if (!projectId) {
      console.log('   No projects found, skipping project detail tests\n');
      await browser.close();
      return results;
    }
    console.log(`   Found project ID: ${projectId}\n`);
  } catch (error) {
    console.log(`   Failed to find project: ${error.message}\n`);
    await browser.close();
    return results;
  }

  // Test 1: Russian Project Detail Page (default)
  console.log('Test 1: Russian Project Detail Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/project-detail.html?id=${projectId}`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for Russian text elements
    const backToProjects = await page
      .$eval('[data-i18n="backToProjects"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const linkTypesTitle = await page
      .$eval('[data-i18n="linkTypesTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Back to projects: ${backToProjects}`);
    console.log(`   Link types title: ${linkTypesTitle}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'project-detail-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: project-detail-ru.png');

    if (backToProjects.includes('Назад') && linkTypesTitle.includes('Типы')) {
      results.passed++;
      results.tests.push({ name: 'Russian Project Detail Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Project Detail Page',
        status: 'FAIL',
        backToProjects,
        linkTypesTitle
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({
      name: 'Russian Project Detail Page',
      status: 'ERROR',
      error: error.message
    });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Project Detail Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for English text elements
    const backToProjects = await page
      .$eval('[data-i18n="backToProjects"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const linkTypesTitle = await page
      .$eval('[data-i18n="linkTypesTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const projectLinks = await page
      .$eval('[data-i18n="projectLinks"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Back to projects: ${backToProjects}`);
    console.log(`   Link types title: ${linkTypesTitle}`);
    console.log(`   Project links tab: ${projectLinks}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'project-detail-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: project-detail-en.png');

    if (
      backToProjects.includes('Back') &&
      linkTypesTitle.includes('Link Types') &&
      projectLinks.includes('Project links')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Project Detail Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Project Detail Page',
        status: 'FAIL',
        backToProjects,
        linkTypesTitle
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({
      name: 'English Project Detail Page',
      status: 'ERROR',
      error: error.message
    });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Link Types Section in English
  console.log('Test 3: Link Types Section (English)');
  try {
    const homepageTitle = await page
      .$eval('[data-i18n="homepageTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const articleTitle = await page
      .$eval('[data-i18n="articleTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Homepage title: ${homepageTitle}`);
    console.log(`   Article title: ${articleTitle}`);

    if (homepageTitle.includes('Homepage') && articleTitle.includes('Article')) {
      results.passed++;
      results.tests.push({ name: 'Link Types Section EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Link Types Section EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Link Types Section EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Toolbar Buttons in English
  console.log('Test 4: Toolbar Buttons (English)');
  try {
    const bulkImport = await page
      .$eval('[data-i18n="bulkImport"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const addLink = await page
      .$eval('[data-i18n="addLink"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Bulk import: ${bulkImport}`);
    console.log(`   Add link: ${addLink}`);

    if (bulkImport.includes('Bulk') && addLink.includes('Add link')) {
      results.passed++;
      results.tests.push({ name: 'Toolbar Buttons EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Toolbar Buttons EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Toolbar Buttons EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Tab Buttons in English
  console.log('Test 5: Tab Buttons (English)');
  try {
    const projectArticles = await page
      .$eval('[data-i18n="projectArticles"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Project articles: ${projectArticles}`);

    if (projectArticles.includes('Project articles')) {
      results.passed++;
      results.tests.push({ name: 'Tab Buttons EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Tab Buttons EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Tab Buttons EN', status: 'ERROR', error: error.message });
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

    const backToProjects = await page
      .$eval('[data-i18n="backToProjects"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const linkTypesTitle = await page
      .$eval('[data-i18n="linkTypesTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Back to projects: ${backToProjects}`);
    console.log(`   Link types title: ${linkTypesTitle}`);

    if (backToProjects.includes('Назад') && linkTypesTitle.includes('Типы')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch to Russian',
        status: 'FAIL',
        backToProjects,
        linkTypesTitle
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

testProjectDetailI18n().catch(console.error);
