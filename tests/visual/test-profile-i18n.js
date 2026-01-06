/**
 * Visual test for Profile page i18n (RU/EN)
 * Tests multilingual support on profile/account settings page
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  screenshotDir: path.join(__dirname, 'screenshots'),
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

// Ensure screenshots directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

async function testProfileI18n() {
  console.log('Starting Profile i18n Tests...\n');

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

  // Login first
  console.log('Logging in...');
  try {
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard (SPA-style navigation)
    await page.waitForFunction(() => window.location.pathname.includes('dashboard'), {
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 1000)); // Wait for page to settle
    console.log('   Logged in successfully\n');
  } catch (error) {
    console.log(`   Login failed: ${error.message}\n`);
    await browser.close();
    return results;
  }

  // Test 1: Russian Profile Page (default)
  console.log('Test 1: Russian Profile Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/profile.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for Russian text elements
    const profileInfoTitle = await page
      .$eval('[data-i18n="profileInfoTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const changePasswordTitle = await page
      .$eval('[data-i18n="changePasswordTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Profile info title: ${profileInfoTitle}`);
    console.log(`   Change password title: ${changePasswordTitle}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'profile-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: profile-ru.png');

    if (profileInfoTitle.includes('Информация') && changePasswordTitle.includes('Смена')) {
      results.passed++;
      results.tests.push({ name: 'Russian Profile Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Profile Page',
        status: 'FAIL',
        profileInfoTitle,
        changePasswordTitle
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Profile Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Profile Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for English text elements
    const profileInfoTitle = await page
      .$eval('[data-i18n="profileInfoTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const changePasswordTitle = await page
      .$eval('[data-i18n="changePasswordTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const saveChangesBtn = await page
      .$eval('[data-i18n="saveChangesBtn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Profile info title: ${profileInfoTitle}`);
    console.log(`   Change password title: ${changePasswordTitle}`);
    console.log(`   Save changes button: ${saveChangesBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'profile-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: profile-en.png');

    if (
      profileInfoTitle.includes('Profile') &&
      changePasswordTitle.includes('Change password') &&
      saveChangesBtn.includes('Save')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Profile Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Profile Page',
        status: 'FAIL',
        profileInfoTitle,
        changePasswordTitle
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Profile Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Form Labels in English
  console.log('Test 3: Form Labels (English)');
  try {
    const usernameLabel = await page
      .$eval('[data-i18n="usernameLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const emailLabel = await page
      .$eval('[data-i18n="emailLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const displayNameLabel = await page
      .$eval('[data-i18n="displayNameLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Username label: ${usernameLabel}`);
    console.log(`   Email label: ${emailLabel}`);
    console.log(`   Display name label: ${displayNameLabel}`);

    if (
      usernameLabel.includes('Username') &&
      emailLabel.includes('Email') &&
      displayNameLabel.includes('Display name')
    ) {
      results.passed++;
      results.tests.push({ name: 'Form Labels EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Form Labels EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Form Labels EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Account Info Section in English
  console.log('Test 4: Account Info Section (English)');
  try {
    const accountInfoTitle = await page
      .$eval('[data-i18n="accountInfoTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const userIdLabel = await page
      .$eval('[data-i18n="userIdLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Account info title: ${accountInfoTitle}`);
    console.log(`   User ID label: ${userIdLabel}`);

    if (accountInfoTitle.includes('Account') && userIdLabel.includes('User ID')) {
      results.passed++;
      results.tests.push({ name: 'Account Info Section EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Account Info Section EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Account Info Section EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Logout Button in English
  console.log('Test 5: Logout Button (English)');
  try {
    const logoutBtn = await page
      .$eval('[data-i18n="logoutBtn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Logout button: ${logoutBtn}`);

    if (logoutBtn.includes('Log out')) {
      results.passed++;
      results.tests.push({ name: 'Logout Button EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Logout Button EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Logout Button EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Switch back to Russian
  console.log('Test 6: Switch Back to Russian');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const profileInfoTitle = await page
      .$eval('[data-i18n="profileInfoTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const accountInfoTitle = await page
      .$eval('[data-i18n="accountInfoTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Profile info title: ${profileInfoTitle}`);
    console.log(`   Account info title: ${accountInfoTitle}`);

    if (profileInfoTitle.includes('Информация') && accountInfoTitle.includes('Информация')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch to Russian',
        status: 'FAIL',
        profileInfoTitle,
        accountInfoTitle
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Switch to Russian', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  await browser.close();

  // Print summary
  console.log('='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`   Passed: ${results.passed}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Total:  ${results.tests.length}`);
  console.log('='.repeat(50));

  results.tests.forEach(t => {
    const icon = t.status === 'PASS' ? '\u2705' : t.status === 'FAIL' ? '\u274C' : '\u26A0\uFE0F';
    console.log(`   ${icon} ${t.name}: ${t.status}`);
  });

  console.log('\nScreenshots saved to:', CONFIG.screenshotDir);

  return results;
}

testProfileI18n().catch(console.error);
