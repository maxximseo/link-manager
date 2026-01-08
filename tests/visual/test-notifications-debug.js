/**
 * Debug test for notifications mark-all-read API
 */

const puppeteer = require('puppeteer');
const { loadCredentials } = require('../utils/credentials');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: loadCredentials()
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testNotificationsDebug() {
  console.log('🔍 Debug test for notifications mark-all-read...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Track network requests
  const apiCalls = [];
  page.on('request', request => {
    if (request.url().includes('/api/notifications')) {
      apiCalls.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    }
  });

  page.on('response', async response => {
    if (response.url().includes('/api/notifications')) {
      let body = '';
      try {
        body = await response.text();
      } catch (e) {
        body = 'Unable to get body';
      }
      console.log(`📡 API Response: ${response.url()}`);
      console.log(`   Status: ${response.status()}`);
      console.log(`   Body: ${body.substring(0, 200)}\n`);
    }
  });

  // Track console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`❌ Console error: ${msg.text()}`);
    }
  });

  try {
    // Login
    console.log('1️⃣ Logging in...');
    await page.goto(`${CONFIG.baseUrl}/login.html`, { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Login successful\n');

    await sleep(2000);

    // Open dropdown
    console.log('2️⃣ Opening notification dropdown...');
    await page.click('#notificationsDropdown');
    await sleep(500);

    // Check button exists
    console.log('3️⃣ Checking mark-all button...');
    const markAllBtn = await page.$('.notification-mark-all-btn');
    console.log(`   Button found: ${markAllBtn !== null}\n`);

    // Check onclick attribute
    if (markAllBtn) {
      const onclick = await markAllBtn.evaluate(el => el.getAttribute('onclick'));
      console.log(`   onclick attribute: ${onclick}\n`);
    }

    // Clear API calls before clicking
    apiCalls.length = 0;

    // Click mark all as read
    console.log('4️⃣ Clicking "Mark all as read"...');
    if (markAllBtn) {
      await markAllBtn.click();
      await sleep(2000);
    }

    // Check API calls made
    console.log('\n5️⃣ API calls made after click:');
    apiCalls.forEach((call, i) => {
      console.log(`   ${i + 1}. ${call.method} ${call.url}`);
    });

    if (apiCalls.length === 0) {
      console.log('   ⚠️  No API calls to /api/notifications detected!');
      console.log('   This means the click handler may not be working properly.');
    }

    // Check badge state
    console.log('\n6️⃣ Final badge state:');
    const badge = await page.$('#notificationBadge');
    if (badge) {
      const display = await badge.evaluate(el => el.style.display);
      const text = await badge.evaluate(el => el.textContent);
      console.log(`   Display: ${display}`);
      console.log(`   Text: ${text}`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Debug test completed');
  }
}

testNotificationsDebug().catch(console.error);
