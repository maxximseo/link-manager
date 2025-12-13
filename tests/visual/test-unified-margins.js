/**
 * Visual test: Unified Page Margins
 * Verifies that all pages have consistent container structure
 * - No duplicate headers (only sidebar.js header should exist)
 * - container-fluid without extra margins (mt-4, px-4)
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

const PAGES_TO_TEST = [
  { url: '/dashboard.html', name: 'Dashboard' },
  { url: '/sites.html', name: 'Sites' },
  { url: '/placements.html', name: 'Placements (Buy)' },
  { url: '/placements-manager.html', name: 'Placements Manager' },
  { url: '/balance.html', name: 'Balance' },
  { url: '/profile.html', name: 'Profile' }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testUnifiedMargins() {
  console.log('='.repeat(60));
  console.log('VISUAL TEST: Unified Page Margins');
  console.log('='.repeat(60));
  console.log('');

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

  function addResult(name, passed, details = '') {
    results.tests.push({ name, passed, details });
    if (passed) {
      results.passed++;
      console.log(`   [PASS] ${name}`);
    } else {
      results.failed++;
      console.log(`   [FAIL] ${name}${details ? ': ' + details : ''}`);
    }
  }

  try {
    // Login
    console.log('1. Logging in...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   Login successful\n');

    // Test each page
    for (const pageInfo of PAGES_TO_TEST) {
      console.log(`2. Testing ${pageInfo.name} (${pageInfo.url})...`);

      await page.goto(CONFIG.baseUrl + pageInfo.url, { waitUntil: 'networkidle2' });
      await sleep(1500);

      // Check for duplicate headers
      const headerCheck = await page.evaluate(() => {
        // Sidebar creates header in .main-header
        const sidebarHeader = document.querySelector('.main-header .page-header-text h1, .main-header h1');

        // Look for duplicate headers in content area
        const contentHeaders = document.querySelectorAll('.main-content h1, .main-content .page-header h1');

        // Count h1 tags in main-content (should be 0 for pages that only need sidebar header)
        const h1InContent = document.querySelectorAll('.main-content > .container-fluid > h1, .main-content > .container-fluid > div > h1').length;

        return {
          hasSidebarHeader: !!sidebarHeader,
          sidebarHeaderText: sidebarHeader ? sidebarHeader.textContent.trim() : null,
          contentH1Count: h1InContent,
          duplicateHeadersFound: h1InContent > 0
        };
      });

      addResult(
        `${pageInfo.name}: No duplicate headers`,
        !headerCheck.duplicateHeadersFound,
        headerCheck.duplicateHeadersFound ? `Found ${headerCheck.contentH1Count} h1 tags in content` : ''
      );

      // Check container structure
      const containerCheck = await page.evaluate(() => {
        const container = document.querySelector('.main-content > .container-fluid, .main-content > .container');
        if (!container) return { found: false };

        const classes = container.className;
        return {
          found: true,
          classes: classes,
          hasContainerFluid: classes.includes('container-fluid'),
          hasMt4: classes.includes('mt-4'),
          hasPx4: classes.includes('px-4')
        };
      });

      addResult(
        `${pageInfo.name}: Uses container-fluid`,
        containerCheck.hasContainerFluid,
        containerCheck.found ? `Classes: ${containerCheck.classes}` : 'Container not found'
      );

      addResult(
        `${pageInfo.name}: No mt-4 class`,
        !containerCheck.hasMt4,
        containerCheck.hasMt4 ? 'Has mt-4 class' : ''
      );

      addResult(
        `${pageInfo.name}: No px-4 class`,
        !containerCheck.hasPx4,
        containerCheck.hasPx4 ? 'Has px-4 class' : ''
      );

      // Take screenshot
      await page.screenshot({
        path: `tests/visual/screenshots/margins-${pageInfo.url.replace(/[\/\.]/g, '-')}.png`,
        fullPage: false
      });
      console.log(`   Screenshot saved: margins-${pageInfo.url.replace(/[\/\.]/g, '-')}.png\n`);
    }

  } catch (error) {
    console.error('\nTest error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/margins-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`   PASSED: ${results.passed}`);
  console.log(`   FAILED: ${results.failed}`);
  console.log('='.repeat(60));

  if (results.failed === 0) {
    console.log('\nAll pages have unified margins!');
  } else {
    console.log('\nSome tests failed. Review details above.');
  }

  console.log('\nTest completed');
}

testUnifiedMargins().catch(console.error);
