/**
 * Visual test: Sites Table - Dashboard Style
 * Tests the new table styling and pagination matching dashboard.html
 */

const puppeteer = require('puppeteer');
const { loadCredentials } = require('../utils/credentials');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: loadCredentials()
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSitesTable() {
  console.log('🔍 VISUAL TEST: Sites Table - Dashboard Style\n');

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
      console.log(`   ✅ ${name}`);
    } else {
      results.failed++;
      console.log(`   ❌ ${name}${details ? ': ' + details : ''}`);
    }
  }

  try {
    // 1. Login
    console.log('1️⃣ Logging in...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    addResult('Login successful', true);

    // 2. Navigate to Sites page
    console.log('\n2️⃣ Loading Sites page...');
    await page.goto(CONFIG.baseUrl + '/sites.html', { waitUntil: 'networkidle2' });
    await sleep(2000);
    addResult('Sites page loaded', true);

    // 3. Check table class
    console.log('\n3️⃣ Checking table styling...');
    const hasNewTableClass = await page.evaluate(() => {
      const table = document.querySelector('table.sites-table');
      return !!table;
    });
    addResult('Table uses .sites-table class', hasNewTableClass);

    // 4. Check table styling
    const tableStyles = await page.evaluate(() => {
      const table = document.querySelector('.sites-table');
      const thead = document.querySelector('.sites-table thead');
      const th = document.querySelector('.sites-table th');
      const tr = document.querySelector('.sites-table tbody tr');
      const td = document.querySelector('.sites-table td');

      return {
        tableExists: !!table,
        theadBg: thead ? getComputedStyle(thead).backgroundColor : null,
        thFontSize: th ? getComputedStyle(th).fontSize : null,
        thTextTransform: th ? getComputedStyle(th).textTransform : null,
        trBorderBottom: tr ? getComputedStyle(tr).borderBottomColor : null,
        tdFontSize: td ? getComputedStyle(td).fontSize : null
      };
    });

    addResult('Table exists', tableStyles.tableExists);
    addResult('Thead has gray background (#f9fafb)', tableStyles.theadBg === 'rgb(249, 250, 251)');
    addResult('Th has uppercase text', tableStyles.thTextTransform === 'uppercase');
    addResult('Th has 11px font', tableStyles.thFontSize === '11px');
    addResult('Td has 13px font', tableStyles.tdFontSize === '13px');

    // 5. Check pagination wrapper
    console.log('\n4️⃣ Checking pagination styling...');
    const paginationStyles = await page.evaluate(() => {
      const wrapper = document.querySelector('.pagination-wrapper');
      const limitSelect = document.getElementById('limitSelect');
      const paginationInfo = document.getElementById('paginationInfo');
      const pageNumbers = document.getElementById('pageNumbers');
      const prevBtn = document.getElementById('prevPageBtn');
      const nextBtn = document.getElementById('nextPageBtn');

      return {
        wrapperExists: !!wrapper,
        wrapperBg: wrapper ? getComputedStyle(wrapper).backgroundColor : null,
        limitSelectExists: !!limitSelect,
        limitSelectValue: limitSelect ? limitSelect.value : null,
        paginationInfoExists: !!paginationInfo,
        paginationInfoText: paginationInfo ? paginationInfo.textContent : null,
        pageNumbersExists: !!pageNumbers,
        prevBtnExists: !!prevBtn,
        nextBtnExists: !!nextBtn
      };
    });

    addResult('Pagination wrapper exists', paginationStyles.wrapperExists);
    addResult(
      'Pagination wrapper has gray background (#f9fafb)',
      paginationStyles.wrapperBg === 'rgb(249, 250, 251)'
    );
    addResult('Limit select exists', paginationStyles.limitSelectExists);
    addResult('Limit select default is 100', paginationStyles.limitSelectValue === '100');
    addResult('Pagination info exists', paginationStyles.paginationInfoExists);
    addResult(
      'Pagination info shows text',
      paginationStyles.paginationInfoText &&
        paginationStyles.paginationInfoText.includes('Показано')
    );
    addResult(
      'Prev/Next buttons exist',
      paginationStyles.prevBtnExists && paginationStyles.nextBtnExists
    );

    // 6. Take screenshot
    console.log('\n5️⃣ Taking screenshots...');
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-table-dashboard-style.png',
      fullPage: false
    });
    console.log('   📸 Screenshot saved: sites-table-dashboard-style.png');

    // 7. Test limit change functionality
    console.log('\n6️⃣ Testing limit change...');
    await page.select('#limitSelect', '200');
    await sleep(2000);

    const newLimit = await page.evaluate(() => {
      return document.getElementById('limitSelect').value;
    });
    addResult('Limit change works (changed to 200)', newLimit === '200');

    // Restore to 100
    await page.select('#limitSelect', '100');
    await sleep(1000);

    // 8. Test sorting
    console.log('\n7️⃣ Testing sorting...');
    await page.click('th[onclick*="sortTable(\'dr\')"]');
    await sleep(500);

    const sortIndicator = await page.evaluate(() => {
      const indicator = document.getElementById('sort-dr');
      return indicator ? indicator.innerHTML : '';
    });
    addResult('Sorting works (DR column)', sortIndicator.includes('bi-arrow'));

    // 9. Check bulk selection
    console.log('\n8️⃣ Testing bulk selection...');
    const selectAllCheckbox = await page.$('#selectAllSites');
    if (selectAllCheckbox) {
      await selectAllCheckbox.click();
      await sleep(500);

      const bulkBarVisible = await page.evaluate(() => {
        const bar = document.getElementById('bulkActionsBar');
        return bar && !bar.classList.contains('d-none');
      });
      addResult('Bulk actions bar appears on select all', bulkBarVisible);

      // Deselect all
      await selectAllCheckbox.click();
      await sleep(300);
    } else {
      addResult('Select all checkbox exists', false, 'Checkbox not found');
    }

    // Take final screenshot
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-table-full.png',
      fullPage: true
    });
    console.log('   📸 Full page screenshot saved: sites-table-full.png');
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-table-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   PASSED: ${results.passed}`);
  console.log(`   FAILED: ${results.failed}`);
  console.log('═══════════════════════════════════════════════════════════');

  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Sites table now matches dashboard style.');
  } else {
    console.log('\n⚠️ Some tests failed. Check details above.');
  }

  console.log('\n🏁 Test completed');
}

testSitesTable().catch(console.error);
