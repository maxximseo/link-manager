/**
 * Visual test: Sites Page SEO Metrics Highlighting
 * Verifies that SEO metrics columns have blue background
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSitesSeoMetrics() {
  console.log('='.repeat(60));
  console.log('VISUAL TEST: Sites Page SEO Metrics Highlighting');
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
    failed: 0
  };

  function addResult(name, passed, details = '') {
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

    // Go to sites page
    console.log('2. Loading Sites page...');
    await page.goto(CONFIG.baseUrl + '/sites.html', { waitUntil: 'networkidle2' });
    await sleep(2000);
    console.log('   Page loaded\n');

    // Check for seo-metric-th classes in headers
    console.log('3. Checking SEO metric headers...');
    const headerCheck = await page.evaluate(() => {
      const seoHeaders = document.querySelectorAll('.seo-metric-th');
      const expectedHeaders = ['DR', 'DA', 'TF', 'CF', 'RD', 'RDm', 'Norm', 'KW', 'Traf'];

      return {
        count: seoHeaders.length,
        expected: expectedHeaders.length,
        headers: Array.from(seoHeaders).map(h => h.textContent.trim().split(' ')[0]),
        hasCorrectBackground: Array.from(seoHeaders).every(h => {
          const bg = getComputedStyle(h).backgroundColor;
          // #eff6ff = rgb(239, 246, 255)
          return bg.includes('239') && bg.includes('246') && bg.includes('255');
        })
      };
    });

    addResult(
      `Found ${headerCheck.count} SEO metric headers (expected ${headerCheck.expected})`,
      headerCheck.count === headerCheck.expected
    );
    console.log(`   Headers: ${headerCheck.headers.join(', ')}`);

    addResult(
      'Headers have blue background (#eff6ff)',
      headerCheck.hasCorrectBackground
    );

    // Check for seo-metric-td classes in body cells
    console.log('\n4. Checking SEO metric data cells...');
    const cellCheck = await page.evaluate(() => {
      const seoCells = document.querySelectorAll('.seo-metric-td');
      const firstRowCells = document.querySelectorAll('tbody tr:first-child .seo-metric-td');

      return {
        totalCells: seoCells.length,
        cellsPerRow: firstRowCells.length,
        hasCorrectBackground: firstRowCells.length > 0 && Array.from(firstRowCells).every(c => {
          const bg = getComputedStyle(c).backgroundColor;
          return bg.includes('239') && bg.includes('246') && bg.includes('255');
        })
      };
    });

    addResult(
      `Found ${cellCheck.cellsPerRow} SEO cells per row (expected 9)`,
      cellCheck.cellsPerRow === 9
    );

    addResult(
      'Data cells have blue background (#eff6ff)',
      cellCheck.hasCorrectBackground
    );

    // Take screenshot
    console.log('\n5. Taking screenshot...');
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-seo-metrics.png',
      fullPage: false
    });
    console.log('   Screenshot saved: sites-seo-metrics.png');

  } catch (error) {
    console.error('\nTest error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-seo-metrics-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`   PASSED: ${results.passed}`);
  console.log(`   FAILED: ${results.failed}`);
  console.log('='.repeat(60));

  if (results.failed === 0) {
    console.log('\nSEO metrics highlighting working correctly!');
  } else {
    console.log('\nSome tests failed. Check details above.');
  }

  console.log('\nTest completed');
}

testSitesSeoMetrics().catch(console.error);
