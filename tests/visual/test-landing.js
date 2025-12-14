/**
 * Visual test for Landing and Login pages
 * Tests multilingual support and page rendering
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  screenshotDir: path.join(__dirname, 'screenshots')
};

// Ensure screenshots directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

async function testLandingPages() {
  console.log('🚀 Starting Landing Page Visual Tests...\n');

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

  // Test 1: Russian Landing Page (/)
  console.log('📄 Test 1: Russian Landing Page (/)');
  try {
    await page.goto(`${CONFIG.baseUrl}/`, { waitUntil: 'networkidle0', timeout: 10000 });

    const title = await page.title();
    const heroText = await page.$eval('.hero-title', el => el.textContent);
    const lang = await page.$eval('html', el => el.getAttribute('lang'));

    console.log(`   Title: ${title}`);
    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Hero text contains Russian: ${heroText.includes('Управляйте')}`);

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'landing-ru.png'), fullPage: true });
    console.log('   📸 Screenshot saved: landing-ru.png');

    if (heroText.includes('Управляйте') && lang === 'ru') {
      results.passed++;
      results.tests.push({ name: 'Russian Landing', status: 'PASS' });
      console.log('   ✅ PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Russian Landing', status: 'FAIL' });
      console.log('   ❌ FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Landing', status: 'ERROR', error: error.message });
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }

  // Test 2: English Landing Page (/en)
  console.log('📄 Test 2: English Landing Page (/en)');
  try {
    await page.goto(`${CONFIG.baseUrl}/en`, { waitUntil: 'networkidle0', timeout: 10000 });

    // Wait for translations to apply
    await page.waitForFunction(() => {
      const hero = document.querySelector('.hero-title');
      return hero && hero.textContent.includes('Manage');
    }, { timeout: 5000 }).catch(() => {});

    const heroText = await page.$eval('.hero-title', el => el.textContent);
    const lang = await page.$eval('html', el => el.getAttribute('lang'));

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Hero text contains English: ${heroText.includes('Manage')}`);

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'landing-en.png'), fullPage: true });
    console.log('   📸 Screenshot saved: landing-en.png');

    if (heroText.includes('Manage') && lang === 'en') {
      results.passed++;
      results.tests.push({ name: 'English Landing', status: 'PASS' });
      console.log('   ✅ PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'English Landing', status: 'FAIL', heroText, lang });
      console.log('   ❌ FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Landing', status: 'ERROR', error: error.message });
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }

  // Test 3: Russian Login Page (/login)
  console.log('📄 Test 3: Russian Login Page (/login)');
  try {
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0', timeout: 10000 });

    const title = await page.title();
    const hasUsernameField = await page.$('#username') !== null;
    const hasPasswordField = await page.$('#password') !== null;
    const submitText = await page.$eval('.login-form button[type="submit"]', el => el.textContent);

    console.log(`   Title: ${title}`);
    console.log(`   Has username field: ${hasUsernameField}`);
    console.log(`   Has password field: ${hasPasswordField}`);
    console.log(`   Submit button text: ${submitText.trim()}`);

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'login-ru.png'), fullPage: true });
    console.log('   📸 Screenshot saved: login-ru.png');

    if (hasUsernameField && hasPasswordField && submitText.includes('Войти')) {
      results.passed++;
      results.tests.push({ name: 'Russian Login', status: 'PASS' });
      console.log('   ✅ PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Russian Login', status: 'FAIL' });
      console.log('   ❌ FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Login', status: 'ERROR', error: error.message });
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }

  // Test 4: English Login Page (/en/login)
  console.log('📄 Test 4: English Login Page (/en/login)');
  try {
    await page.goto(`${CONFIG.baseUrl}/en/login`, { waitUntil: 'networkidle0', timeout: 10000 });

    // Wait for translations to apply
    await page.waitForFunction(() => {
      const btn = document.querySelector('.login-form button[type="submit"]');
      return btn && btn.textContent.includes('Login');
    }, { timeout: 5000 }).catch(() => {});

    const submitText = await page.$eval('.login-form button[type="submit"]', el => el.textContent);
    const lang = await page.$eval('html', el => el.getAttribute('lang'));

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Submit button text: ${submitText}`);

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'login-en.png'), fullPage: true });
    console.log('   📸 Screenshot saved: login-en.png');

    if (submitText.includes('Login') && lang === 'en') {
      results.passed++;
      results.tests.push({ name: 'English Login', status: 'PASS' });
      console.log('   ✅ PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'English Login', status: 'FAIL', submitText, lang });
      console.log('   ❌ FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Login', status: 'ERROR', error: error.message });
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }

  // Test 5: Language Switcher
  console.log('📄 Test 5: Language Switcher Functionality');
  try {
    await page.goto(`${CONFIG.baseUrl}/`, { waitUntil: 'networkidle0', timeout: 10000 });

    // Check if language switcher exists (using class .lang-btn)
    const langSwitcher = await page.$('.lang-btn');

    if (langSwitcher) {
      console.log('   Language switcher found');
      await langSwitcher.click();
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});

      const newUrl = page.url();
      console.log(`   After switch URL: ${newUrl}`);

      if (newUrl.includes('/en')) {
        results.passed++;
        results.tests.push({ name: 'Language Switcher', status: 'PASS' });
        console.log('   ✅ PASS\n');
      } else {
        results.failed++;
        results.tests.push({ name: 'Language Switcher', status: 'FAIL' });
        console.log('   ❌ FAIL\n');
      }
    } else {
      console.log('   ⚠️ Language switcher not found');
      results.tests.push({ name: 'Language Switcher', status: 'SKIP' });
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Language Switcher', status: 'ERROR', error: error.message });
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }

  // Test 6: Blob Animations on Login
  console.log('📄 Test 6: Blob Animations Present');
  try {
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0', timeout: 10000 });

    const blobs = await page.$$('.login-blob');
    console.log(`   Number of blob elements: ${blobs.length}`);

    if (blobs.length >= 3) {
      results.passed++;
      results.tests.push({ name: 'Blob Animations', status: 'PASS' });
      console.log('   ✅ PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Blob Animations', status: 'FAIL' });
      console.log('   ❌ FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Blob Animations', status: 'ERROR', error: error.message });
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }

  await browser.close();

  // Print summary
  console.log('═══════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`   Passed: ${results.passed}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Total:  ${results.tests.length}`);
  console.log('═══════════════════════════════════════════');

  results.tests.forEach(t => {
    const icon = t.status === 'PASS' ? '✅' : t.status === 'FAIL' ? '❌' : t.status === 'ERROR' ? '⚠️' : '⏭️';
    console.log(`   ${icon} ${t.name}: ${t.status}`);
  });

  console.log('\n📁 Screenshots saved to:', CONFIG.screenshotDir);

  return results;
}

testLandingPages().catch(console.error);
