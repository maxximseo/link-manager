/**
 * Visual test: Bulk Import Preview Modal
 * Tests the new reference-style design for the bulk import preview
 */

const puppeteer = require('puppeteer');
const { loadCredentials } = require('../utils/credentials');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: loadCredentials(),
  projectId: 1218
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBulkImportPreview() {
  console.log('🔍 VISUAL TEST: Bulk Import Preview Modal\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Login
    console.log('1️⃣ Logging in...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Login successful\n');

    // Navigate to project detail
    console.log('2️⃣ Loading project page...');
    await page.goto(CONFIG.baseUrl + '/project-detail.html?id=' + CONFIG.projectId, {
      waitUntil: 'networkidle2'
    });
    await sleep(2000);
    console.log('   ✅ Page loaded\n');

    // Click on "Массовое добавление" button
    console.log('3️⃣ Opening Bulk Import Modal (Step 1)...');
    await page.click('button[onclick="showBulkImportModal()"]');
    await sleep(1000);
    console.log('   ✅ Step 1 modal opened\n');

    // Take screenshot of Step 1
    await page.screenshot({
      path: 'tests/visual/screenshots/bulk-import-step1.png',
      fullPage: false
    });
    console.log('   📸 Screenshot saved: bulk-import-step1.png\n');

    // Enter test data in textarea
    console.log('4️⃣ Entering test data...');
    const testData = `Discover everything you need to know about gaming when you <a href="https://example.com/games/">visit the site</a> and explore options.
If you want to find reliable platforms, check out <a href="https://example.com/casino/">casino sites</a> to see available choices.
This is a short text.
Another valid link about <a href="https://example.com/review/">online reviews</a> that helps users make better decisions in gaming.`;

    await page.type('#bulkImportText', testData);
    await sleep(500);
    console.log('   ✅ Test data entered (4 lines: 3 valid, 1 invalid)\n');

    // Click "Импортировать ссылки" button to go to Step 2
    console.log('5️⃣ Opening Preview Modal (Step 2)...');
    await page.click('.btn-gradient-cyan');
    await sleep(1500);

    // Wait for preview modal to appear
    await page.waitForSelector('#bulkPreviewModal.show', { timeout: 5000 });
    console.log('   ✅ Step 2 preview modal opened\n');

    // Take screenshot of Step 2
    await page.screenshot({
      path: 'tests/visual/screenshots/bulk-import-step2-preview.png',
      fullPage: false
    });
    console.log('   📸 Screenshot saved: bulk-import-step2-preview.png\n');

    // Analyze the preview modal styling
    console.log('6️⃣ Analyzing Preview Modal styling...');

    const modalStyles = await page.evaluate(() => {
      const modal = document.querySelector('#bulkPreviewModal .modal-content');
      const header = document.querySelector('#bulkPreviewModal .modal-header');
      const validHeader = document.querySelector('#bulkPreviewModal .modal-header + div');
      const footer = document.querySelector('#bulkPreviewModal .modal-footer');
      const importBtn = document.querySelector('#importLinksBtn');
      const backBtn = document.querySelector('#bulkPreviewModal .modal-footer button:first-child');

      // Check for green checkmark circles
      const greenCircles = document.querySelectorAll(
        '#bulkPreviewContent [style*="background: #22c55e"]'
      );

      // Check for anchor highlight (blue + underline)
      const anchorHighlights = document.querySelectorAll(
        '#bulkPreviewContent [style*="color: #2563eb"][style*="underline"]'
      );

      // Check for pink anchor text
      const pinkAnchors = document.querySelectorAll(
        '#bulkPreviewContent [style*="color: #db2777"]'
      );

      // Check valid links count
      const validCountHeader = document.querySelector('#validLinksCountHeader')?.textContent;
      const validCountFooter = document.querySelector('#validLinksCount')?.textContent;

      return {
        modalBorderRadius: modal ? getComputedStyle(modal).borderRadius : null,
        headerBg: header ? getComputedStyle(header).backgroundColor : null,
        footerBg: footer ? getComputedStyle(footer).backgroundColor : null,
        importBtnBg: importBtn ? getComputedStyle(importBtn).backgroundImage : null,
        backBtnBorder: backBtn ? getComputedStyle(backBtn).border : null,
        greenCirclesCount: greenCircles.length,
        anchorHighlightsCount: anchorHighlights.length,
        pinkAnchorsCount: pinkAnchors.length,
        validCountHeader,
        validCountFooter
      };
    });

    console.log('   Modal styles:');
    console.log(`      Border radius: ${modalStyles.modalBorderRadius}`);
    console.log(`      Header bg: ${modalStyles.headerBg}`);
    console.log(`      Footer bg: ${modalStyles.footerBg}`);
    console.log(`      Import btn gradient: ${modalStyles.importBtnBg?.substring(0, 60)}...`);
    console.log(`      Green checkmark circles: ${modalStyles.greenCirclesCount}`);
    console.log(`      Anchor highlights (blue+underline): ${modalStyles.anchorHighlightsCount}`);
    console.log(`      Pink anchor texts: ${modalStyles.pinkAnchorsCount}`);
    console.log(`      Valid count in header: ${modalStyles.validCountHeader}`);
    console.log(`      Valid count in footer: ${modalStyles.validCountFooter}`);
    console.log('');

    // Test results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');

    const tests = [
      {
        name: 'Modal has rounded corners (1rem)',
        pass: modalStyles.modalBorderRadius === '16px' || modalStyles.modalBorderRadius === '1rem'
      },
      { name: 'Header is white', pass: modalStyles.headerBg === 'rgb(255, 255, 255)' },
      { name: 'Footer is gray (#f9fafb)', pass: modalStyles.footerBg === 'rgb(249, 250, 251)' },
      { name: 'Import button has gradient', pass: modalStyles.importBtnBg?.includes('gradient') },
      { name: 'Green checkmark circles present', pass: modalStyles.greenCirclesCount > 0 },
      { name: 'Anchor highlights (blue+underline)', pass: modalStyles.anchorHighlightsCount > 0 },
      { name: 'Pink anchor texts present', pass: modalStyles.pinkAnchorsCount > 0 },
      {
        name: 'Valid count matches (header & footer)',
        pass: modalStyles.validCountHeader === modalStyles.validCountFooter
      }
    ];

    let passed = 0;
    let failed = 0;

    tests.forEach(test => {
      if (test.pass) {
        console.log(`   ✅ ${test.name}`);
        passed++;
      } else {
        console.log(`   ❌ ${test.name}`);
        failed++;
      }
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   PASSED: ${passed}  |  FAILED: ${failed}`);
    console.log('═══════════════════════════════════════════════════════════');

    if (failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Preview modal matches reference design.');
    } else {
      console.log('\n⚠️ Some tests failed. Check screenshots for details.');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);

    // Take error screenshot
    await page.screenshot({
      path: 'tests/visual/screenshots/bulk-import-error.png',
      fullPage: true
    });
    console.log('   📸 Error screenshot saved: bulk-import-error.png');
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
}

testBulkImportPreview().catch(console.error);
