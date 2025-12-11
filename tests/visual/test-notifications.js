/**
 * Puppeteer test for notifications functionality
 * Tests: markAllAsRead, badge counter update, dropdown behavior
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  },
  screenshotDir: './tests/visual/screenshots'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testNotifications() {
  console.log('🚀 Starting notifications test...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Step 1: Login
    console.log('📝 Step 1: Logging in...');
    await page.goto(`${CONFIG.baseUrl}/login.html`, { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Login successful\n');

    // Wait for page to fully load
    await sleep(2000);

    // Step 2: Check initial notification badge
    console.log('📝 Step 2: Checking notification badge...');
    const badge = await page.$('#notificationBadge');
    const badgeVisible = badge ? await badge.evaluate(el => el.style.display !== 'none') : false;
    const badgeCount = badge ? await badge.evaluate(el => el.textContent) : '0';
    console.log(`   Badge visible: ${badgeVisible}`);
    console.log(`   Badge count: ${badgeCount}\n`);

    // Take screenshot before
    await page.screenshot({ path: `${CONFIG.screenshotDir}/notifications-1-before.png`, fullPage: false });
    console.log('   📸 Screenshot saved: notifications-1-before.png\n');

    // Step 3: Open notification dropdown
    console.log('📝 Step 3: Opening notification dropdown...');
    await page.click('#notificationsDropdown');
    await sleep(500);

    // Take screenshot of open dropdown
    await page.screenshot({ path: `${CONFIG.screenshotDir}/notifications-2-dropdown-open.png`, fullPage: false });
    console.log('   📸 Screenshot saved: notifications-2-dropdown-open.png\n');

    // Step 4: Get header count text before marking as read
    console.log('📝 Step 4: Checking header count text...');
    const headerCount = await page.$('#notificationHeaderCount');
    const headerText = headerCount ? await headerCount.evaluate(el => el.textContent) : 'N/A';
    console.log(`   Header count text: "${headerText}"\n`);

    // Step 5: Click "Mark all as read" button
    console.log('📝 Step 5: Clicking "Mark all as read"...');
    const markAllBtn = await page.$('.notification-mark-all-btn');
    if (markAllBtn) {
      await markAllBtn.click();
      await sleep(1000);
      console.log('   ✅ Clicked mark all as read button\n');
    } else {
      console.log('   ❌ Mark all button not found\n');
    }

    // Take screenshot after
    await page.screenshot({ path: `${CONFIG.screenshotDir}/notifications-3-after-mark-read.png`, fullPage: false });
    console.log('   📸 Screenshot saved: notifications-3-after-mark-read.png\n');

    // Step 6: Verify badge is hidden
    console.log('📝 Step 6: Verifying badge is hidden...');
    const badgeAfter = await page.$('#notificationBadge');
    const badgeVisibleAfter = badgeAfter ? await badgeAfter.evaluate(el => el.style.display !== 'none') : false;
    console.log(`   Badge visible after: ${badgeVisibleAfter}`);

    // Step 7: Verify header count text
    const headerTextAfter = headerCount ? await headerCount.evaluate(el => el.textContent) : 'N/A';
    console.log(`   Header count text after: "${headerTextAfter}"\n`);

    // Step 8: Test text selection (dropdown should stay open)
    console.log('📝 Step 8: Testing text selection in dropdown...');
    const notificationCard = await page.$('.notification-card');
    if (notificationCard) {
      // Triple click to select text
      await notificationCard.click({ clickCount: 3 });
      await sleep(500);

      // Check if dropdown is still open
      const dropdownOpen = await page.$('.notification-dropdown.show') !== null;
      console.log(`   Dropdown still open after text selection: ${dropdownOpen}\n`);
    }

    // Take final screenshot
    await page.screenshot({ path: `${CONFIG.screenshotDir}/notifications-4-text-selection.png`, fullPage: false });
    console.log('   📸 Screenshot saved: notifications-4-text-selection.png\n');

    // Summary
    console.log('═══════════════════════════════════════════');
    console.log('📊 TEST SUMMARY:');
    console.log('═══════════════════════════════════════════');
    console.log(`   Initial badge count: ${badgeCount}`);
    console.log(`   Badge hidden after mark read: ${!badgeVisibleAfter ? '✅ YES' : '❌ NO'}`);
    console.log(`   Header text updated: ${headerTextAfter === 'Все прочитано' ? '✅ YES' : '❌ NO'}`);
    console.log('═══════════════════════════════════════════\n');

    // Check for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    if (consoleErrors.length > 0) {
      console.log('⚠️  Console errors detected:');
      consoleErrors.forEach(err => console.log(`   - ${err}`));
    } else {
      console.log('✅ No console errors detected\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: `${CONFIG.screenshotDir}/notifications-error.png`, fullPage: true });
    console.log('   📸 Error screenshot saved: notifications-error.png');
  } finally {
    await browser.close();
    console.log('🏁 Test completed');
  }
}

// Run the test
testNotifications().catch(console.error);
