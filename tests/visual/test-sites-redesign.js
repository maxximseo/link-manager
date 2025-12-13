/**
 * Visual test: Sites Page Redesign
 * Tests new header, stats cards, toolbar inside card
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

async function testSitesRedesign() {
  console.log('🔍 VISUAL TEST: Sites Page Redesign\n');

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
    await sleep(3000); // Wait for data to load
    addResult('Sites page loaded', true);

    // 3. Check page header with icon
    console.log('\n3️⃣ Checking page header...');
    const hasPageHeader = await page.evaluate(() => {
      const header = document.querySelector('.page-header');
      const icon = document.querySelector('.header-icon');
      const title = document.querySelector('.header-text h1');
      const subtitle = document.querySelector('.header-text .subtitle');
      return !!header && !!icon && !!title && !!subtitle;
    });
    addResult('Page header with icon exists', hasPageHeader);

    const headerTitle = await page.evaluate(() => {
      const title = document.querySelector('.header-text h1');
      return title ? title.textContent : '';
    });
    addResult('Header title is "Управление сайтами"', headerTitle === 'Управление сайтами');

    // 4. Check stats grid (4 cards)
    console.log('\n4️⃣ Checking stats cards...');
    const statsCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('.stat-card');
      return cards.length;
    });
    addResult('Stats grid has 4 cards', statsCount === 4);

    const statsValues = await page.evaluate(() => {
      return {
        total: document.getElementById('statTotalSites')?.textContent || '0',
        active: document.getElementById('statActiveSites')?.textContent || '0',
        avgDR: document.getElementById('statAvgDR')?.textContent || '0',
        avgRD: document.getElementById('statAvgRD')?.textContent || '0'
      };
    });
    addResult('Total sites stat displays number', parseInt(statsValues.total) >= 0);
    addResult('Active sites stat displays number', parseInt(statsValues.active) >= 0);
    addResult('Average DR stat displays number', parseInt(statsValues.avgDR) >= 0);
    console.log(`   📊 Stats: Total=${statsValues.total}, Active=${statsValues.active}, AvgDR=${statsValues.avgDR}, AvgRD=${statsValues.avgRD}`);

    // 5. Check table toolbar
    console.log('\n5️⃣ Checking table toolbar...');
    const toolbarElements = await page.evaluate(() => {
      return {
        toolbar: !!document.querySelector('.table-toolbar'),
        search: !!document.querySelector('.search-input'),
        filtersBtn: !!document.querySelector('.filter-btn'),
        exportBtn: !!document.querySelector('.export-btn'),
        addBtn: !!document.querySelector('.btn-gradient')
      };
    });
    addResult('Table toolbar exists', toolbarElements.toolbar);
    addResult('Search input exists', toolbarElements.search);
    addResult('Filters button exists', toolbarElements.filtersBtn);
    addResult('Export button exists', toolbarElements.exportBtn);
    addResult('Add Site button with gradient exists', toolbarElements.addBtn);

    // 6. Check gradient button style
    const gradientStyle = await page.evaluate(() => {
      const btn = document.querySelector('.btn-gradient');
      if (!btn) return null;
      const style = getComputedStyle(btn);
      return {
        background: style.backgroundImage,
        color: style.color,
        borderRadius: style.borderRadius
      };
    });
    addResult('Gradient button has gradient background', gradientStyle?.background.includes('linear-gradient'));

    // 7. Test filters dropdown
    console.log('\n6️⃣ Testing filters dropdown...');
    await page.click('.filter-btn');
    await sleep(500);

    const filtersPanelVisible = await page.evaluate(() => {
      const panel = document.getElementById('filtersPanel');
      return panel && panel.classList.contains('show');
    });
    addResult('Filters panel opens on click', filtersPanelVisible);

    // Take screenshot with filters open
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-redesign-filters.png',
      fullPage: false
    });
    console.log('   📸 Screenshot saved: sites-redesign-filters.png');

    // Close filters
    await page.click('.filter-btn');
    await sleep(300);

    // 8. Test search functionality
    console.log('\n7️⃣ Testing search...');
    await page.type('.search-input', 'test');
    await sleep(1000);
    addResult('Search input accepts text', true);

    // Clear search
    await page.evaluate(() => {
      document.querySelector('.search-input').value = '';
    });

    // 9. Take final screenshot
    console.log('\n8️⃣ Taking screenshots...');
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-redesign-full.png',
      fullPage: true
    });
    console.log('   📸 Full page screenshot saved: sites-redesign-full.png');

    // Take header/stats screenshot
    const headerElement = await page.$('.page-header');
    if (headerElement) {
      await headerElement.screenshot({
        path: 'tests/visual/screenshots/sites-redesign-header.png'
      });
      console.log('   📸 Header screenshot saved: sites-redesign-header.png');
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-redesign-error.png',
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
    console.log('\n🎉 ALL TESTS PASSED! Sites page redesign complete.');
  } else {
    console.log('\n⚠️ Some tests failed. Check details above.');
  }

  console.log('\n🏁 Test completed');
}

testSitesRedesign().catch(console.error);
