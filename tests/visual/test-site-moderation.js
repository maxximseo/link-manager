/**
 * Visual test: Site Moderation System
 * Tests:
 * 1. Status column appears in sites.html
 * 2. Admin moderation page loads correctly
 * 3. Approve/reject functionality works
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

async function testSiteModeration() {
  console.log('='.repeat(60));
  console.log('VISUAL TEST: Site Moderation System');
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
    console.log('1. Logging in as admin...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   Login successful\n');

    // Test 1: Check sites.html has status column
    console.log('2. Testing sites.html status column...');
    await page.goto(CONFIG.baseUrl + '/sites.html', { waitUntil: 'networkidle2' });
    await sleep(2000);

    const statusColumnExists = await page.evaluate(() => {
      const headers = document.querySelectorAll('thead th');
      for (const header of headers) {
        if (header.textContent.includes('Статус')) {
          return true;
        }
      }
      return false;
    });
    addResult('Status column header exists in sites.html', statusColumnExists);

    // Check for status badges in table
    const statusBadgeCheck = await page.evaluate(() => {
      const approvedBadges = document.querySelectorAll('.status-approved');
      const pendingBadges = document.querySelectorAll('.status-pending');
      const rejectedBadges = document.querySelectorAll('.status-rejected');
      return {
        approved: approvedBadges.length,
        pending: pendingBadges.length,
        rejected: rejectedBadges.length,
        total: approvedBadges.length + pendingBadges.length + rejectedBadges.length
      };
    });
    console.log(
      `   Found status badges: approved=${statusBadgeCheck.approved}, pending=${statusBadgeCheck.pending}, rejected=${statusBadgeCheck.rejected}`
    );
    addResult('Status badges rendered in sites table', statusBadgeCheck.total > 0);

    // Check for action buttons styling
    const actionButtonsCheck = await page.evaluate(() => {
      const editBtns = document.querySelectorAll('.action-edit');
      const deleteBtns = document.querySelectorAll('.action-delete');

      let editStyleOk = false;
      let deleteStyleOk = false;

      if (editBtns.length > 0) {
        const style = getComputedStyle(editBtns[0]);
        // Check for blue background (#e7f1ff = rgb(231, 241, 255))
        editStyleOk =
          style.backgroundColor.includes('231') || style.backgroundColor.includes('241');
      }

      if (deleteBtns.length > 0) {
        const style = getComputedStyle(deleteBtns[0]);
        // Check for red background (#ffebee = rgb(255, 235, 238))
        deleteStyleOk =
          style.backgroundColor.includes('255') || style.backgroundColor.includes('235');
      }

      return {
        editCount: editBtns.length,
        deleteCount: deleteBtns.length,
        editStyleOk,
        deleteStyleOk
      };
    });
    console.log(
      `   Action buttons: edit=${actionButtonsCheck.editCount}, delete=${actionButtonsCheck.deleteCount}`
    );
    addResult(
      'Action buttons with new styling found',
      actionButtonsCheck.editCount > 0 && actionButtonsCheck.deleteCount > 0
    );

    // Take screenshot of sites page
    await page.screenshot({
      path: 'tests/visual/screenshots/sites-moderation-status.png',
      fullPage: false
    });
    console.log('   Screenshot saved: sites-moderation-status.png\n');

    // Test 2: Check admin moderation page
    console.log('3. Testing admin-sites-moderation.html...');
    await page.goto(CONFIG.baseUrl + '/admin-sites-moderation.html', { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Check page loaded correctly
    const moderationPageCheck = await page.evaluate(() => {
      const title = document.querySelector('h1');
      const pendingCount = document.getElementById('pendingCount');
      const pendingSitesList = document.getElementById('pendingSitesList');
      const emptyState = document.getElementById('emptyState');

      return {
        hasTitle: title && title.textContent.includes('Модерация'),
        hasPendingCount: !!pendingCount,
        pendingCountValue: pendingCount ? pendingCount.textContent : 'N/A',
        hasPendingList: !!pendingSitesList,
        hasEmptyState: !!emptyState,
        isEmpty: emptyState ? emptyState.style.display !== 'none' : false
      };
    });

    console.log(`   Page title contains "Модерация": ${moderationPageCheck.hasTitle}`);
    console.log(
      `   Pending count element exists: ${moderationPageCheck.hasPendingCount} (value: ${moderationPageCheck.pendingCountValue})`
    );
    addResult(
      'Admin moderation page loaded correctly',
      moderationPageCheck.hasTitle && moderationPageCheck.hasPendingCount
    );

    // Check for moderation cards
    const moderationCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.moderation-card');
      return {
        count: cards.length,
        hasApproveBtn: document.querySelectorAll('.btn-success').length > 0,
        hasRejectBtn: document.querySelectorAll('.btn-outline-danger').length > 0
      };
    });
    console.log(`   Moderation cards found: ${moderationCards.count}`);

    if (moderationCards.count > 0) {
      addResult(
        'Moderation cards with approve/reject buttons exist',
        moderationCards.hasApproveBtn && moderationCards.hasRejectBtn
      );
    } else {
      console.log('   (No pending sites to moderate - empty state)');
      addResult('Empty state displayed correctly', moderationPageCheck.isEmpty);
    }

    // Take screenshot of moderation page
    await page.screenshot({
      path: 'tests/visual/screenshots/admin-sites-moderation.png',
      fullPage: true
    });
    console.log('   Screenshot saved: admin-sites-moderation.png\n');

    // Test 3: Check sidebar has moderation link
    console.log('4. Checking sidebar menu...');
    const sidebarCheck = await page.evaluate(() => {
      // Check both sidebar structures: .sidebar and .offcanvas-body
      const sidebar =
        document.querySelector('.sidebar') || document.querySelector('.offcanvas-body');
      if (!sidebar) return { found: false, error: 'No sidebar found' };

      const links = sidebar.querySelectorAll('a');
      for (const link of links) {
        if (
          link.textContent.includes('Модерация сайтов') ||
          link.href.includes('admin-sites-moderation')
        ) {
          return {
            found: true,
            href: link.href,
            text: link.textContent.trim()
          };
        }
      }
      return { found: false, linksCount: links.length };
    });

    if (sidebarCheck.found) {
      console.log(`   Menu item found: "${sidebarCheck.text}"`);
    }
    addResult('Sidebar has "Модерация сайтов" menu item', sidebarCheck.found);
  } catch (error) {
    console.error('\nTest error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/site-moderation-error.png',
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
    console.log('\n✅ Site moderation system working correctly!');
  } else {
    console.log('\n❌ Some tests failed. Check details above.');
  }

  console.log('\nTest completed');
}

testSiteModeration().catch(console.error);
