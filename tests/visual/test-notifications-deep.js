/**
 * Deep test for notifications persistence after page reload
 * Tests that mark-all-read actually persists to database
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deepTest() {
  console.log('🔍 DEEP TEST: Notification persistence after reload\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Track API responses
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/notifications')) {
      console.log(`📡 ${response.request().method()} ${url}`);
      console.log(`   Status: ${response.status()}`);
      try {
        const body = await response.text();
        if (body.length < 500) {
          console.log(`   Body: ${body}`);
        } else {
          // Parse and show summary
          const json = JSON.parse(body);
          if (json.data) {
            console.log(`   Data count: ${json.data.length}`);
            console.log(`   Unread count (pagination): ${json.pagination?.unread || 'N/A'}`);
            if (json.data.length > 0) {
              console.log(`   First notification read status: ${json.data[0].read}`);
            }
          }
        }
      } catch (e) {
        console.log(`   Body: (parse error)`);
      }
      console.log('');
    }
  });

  try {
    // STEP 1: Login
    console.log('═══════════════════════════════════════════');
    console.log('STEP 1: Login');
    console.log('═══════════════════════════════════════════\n');
    await page.goto(`${CONFIG.baseUrl}/login.html`, { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('✅ Login successful\n');

    await sleep(2000);

    // STEP 2: Check initial badge state
    console.log('═══════════════════════════════════════════');
    console.log('STEP 2: Check initial state');
    console.log('═══════════════════════════════════════════\n');
    let badge = await page.$('#notificationBadge');
    let badgeVisible = badge
      ? await badge.evaluate(el => window.getComputedStyle(el).display !== 'none')
      : false;
    let badgeCount = badge ? await badge.evaluate(el => el.textContent) : '0';
    console.log(`Badge visible: ${badgeVisible}`);
    console.log(`Badge count: ${badgeCount}\n`);

    if (!badgeVisible || badgeCount === '0') {
      console.log('⚠️  No unread notifications to test. Creating some first...');
      // Cannot proceed without notifications
      await browser.close();
      return;
    }

    // STEP 3: Mark all as read
    console.log('═══════════════════════════════════════════');
    console.log('STEP 3: Mark all as read');
    console.log('═══════════════════════════════════════════\n');

    // Open dropdown
    await page.click('#notificationsDropdown');
    await sleep(500);

    // Click mark all as read and wait for API response
    const markAllBtn = await page.$('.notification-mark-all-btn');
    if (markAllBtn) {
      // Click and wait for the API call to complete
      await Promise.all([
        page.waitForResponse(
          response =>
            response.url().includes('/api/notifications/mark-all-read') &&
            response.status() === 200,
          { timeout: 10000 }
        ),
        markAllBtn.click()
      ]);
      await sleep(500); // Wait for UI to update
      console.log('✅ Clicked mark all as read\n');
    } else {
      console.log('❌ Mark all button not found!\n');
    }

    // STEP 4: Check badge after mark
    console.log('═══════════════════════════════════════════');
    console.log('STEP 4: Check state after marking');
    console.log('═══════════════════════════════════════════\n');
    badge = await page.$('#notificationBadge');
    badgeVisible = badge
      ? await badge.evaluate(el => window.getComputedStyle(el).display !== 'none')
      : false;
    console.log(`Badge visible after mark: ${badgeVisible}`);
    console.log(`Expected: false (badge should be hidden)\n`);

    // STEP 5: Reload page
    console.log('═══════════════════════════════════════════');
    console.log('STEP 5: Reload page and check persistence');
    console.log('═══════════════════════════════════════════\n');
    console.log('Reloading page...\n');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // STEP 6: Check badge after reload
    console.log('═══════════════════════════════════════════');
    console.log('STEP 6: Check state after reload');
    console.log('═══════════════════════════════════════════\n');
    badge = await page.$('#notificationBadge');
    badgeVisible = badge
      ? await badge.evaluate(el => window.getComputedStyle(el).display !== 'none')
      : false;
    badgeCount = badge ? await badge.evaluate(el => el.textContent) : '0';
    console.log(`Badge visible after reload: ${badgeVisible}`);
    console.log(`Badge count after reload: ${badgeCount}`);
    console.log(`Expected: false (notifications should stay read)\n`);

    // SUMMARY
    console.log('═══════════════════════════════════════════');
    console.log('📊 DEEP TEST SUMMARY');
    console.log('═══════════════════════════════════════════');
    if (!badgeVisible || badgeCount === '0') {
      console.log('✅ PASS: Notifications stayed marked as read after reload!');
    } else {
      console.log('❌ FAIL: Notifications reappeared as unread after reload!');
      console.log('   This means the database update is not working properly.');
      console.log('   Check:');
      console.log('   1. API /api/notifications/mark-all-read returns success');
      console.log('   2. Database actually updates read=true');
      console.log('   3. API /api/notifications?unread=true filters correctly');
    }
    console.log('═══════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('🏁 Deep test completed');
  }
}

deepTest().catch(console.error);
