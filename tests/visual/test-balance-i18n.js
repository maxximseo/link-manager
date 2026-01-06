/**
 * Visual test for Balance page i18n (RU/EN)
 * Tests multilingual support on balance page
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

async function testBalanceI18n() {
  console.log('Starting Balance i18n Tests...\n');

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

  // Test 1: Russian Balance Page (default)
  console.log('Test 1: Russian Balance Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/balance.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'ru');

    // Check for Russian text elements
    const currentBalanceLabel = await page
      .$eval('[data-i18n="currentBalanceLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const totalSpentLabel = await page
      .$eval('[data-i18n="totalSpentLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Current balance label: ${currentBalanceLabel}`);
    console.log(`   Total spent label: ${totalSpentLabel}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'balance-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: balance-ru.png');

    if (currentBalanceLabel.includes('Текущий') && totalSpentLabel.includes('Потрачено')) {
      results.passed++;
      results.tests.push({ name: 'Russian Balance Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Balance Page',
        status: 'FAIL',
        currentBalanceLabel,
        totalSpentLabel
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Balance Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Balance Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for translations to apply

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'en');

    // Check for English text elements
    const currentBalanceLabel = await page
      .$eval('[data-i18n="currentBalanceLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const depositBtn = await page
      .$eval('[data-i18n="depositBtn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const totalSpentLabel = await page
      .$eval('[data-i18n="totalSpentLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Current balance label: ${currentBalanceLabel}`);
    console.log(`   Deposit button: ${depositBtn}`);
    console.log(`   Total spent label: ${totalSpentLabel}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'balance-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: balance-en.png');

    if (
      currentBalanceLabel.includes('Current') &&
      depositBtn.includes('Deposit') &&
      totalSpentLabel.includes('Total')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Balance Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Balance Page',
        status: 'FAIL',
        currentBalanceLabel,
        depositBtn
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Balance Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Discount Progress Section in English
  console.log('Test 3: Discount Progress Section (English)');
  try {
    const yourDiscount = await page
      .$eval('[data-i18n="yourDiscount"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const discountTiersTitle = await page
      .$eval('[data-i18n="discountTiersTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const goal = await page
      .$eval('[data-i18n="goal"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Your discount: ${yourDiscount}`);
    console.log(`   Discount tiers title: ${discountTiersTitle}`);
    console.log(`   Goal label: ${goal}`);

    if (
      yourDiscount.includes('discount') &&
      discountTiersTitle.includes('Discount') &&
      goal.includes('Goal')
    ) {
      results.passed++;
      results.tests.push({ name: 'Discount Progress EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Discount Progress EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Discount Progress EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Transactions Table Headers in English
  console.log('Test 4: Transactions Table Headers (English)');
  try {
    const transactionsHistory = await page
      .$eval('[data-i18n="transactionsHistory"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const thDate = await page
      .$eval('[data-i18n="thDate"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const thType = await page
      .$eval('[data-i18n="thType"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const thAmount = await page
      .$eval('[data-i18n="thAmount"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Transactions history: ${transactionsHistory}`);
    console.log(`   Date header: ${thDate}`);
    console.log(`   Type header: ${thType}`);
    console.log(`   Amount header: ${thAmount}`);

    if (
      transactionsHistory.includes('Transaction') &&
      thDate === 'Date' &&
      thType === 'Type' &&
      thAmount === 'Amount'
    ) {
      results.passed++;
      results.tests.push({ name: 'Transactions Table EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Transactions Table EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Transactions Table EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Tier Table in English
  console.log('Test 5: Discount Tiers Table (English)');
  try {
    const tierLevel = await page
      .$eval('[data-i18n="tierLevel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const tierMinAmount = await page
      .$eval('[data-i18n="tierMinAmount"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const tierDiscount = await page
      .$eval('[data-i18n="tierDiscount"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const tierStatus = await page
      .$eval('[data-i18n="tierStatus"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Tier level: ${tierLevel}`);
    console.log(`   Min amount: ${tierMinAmount}`);
    console.log(`   Discount: ${tierDiscount}`);
    console.log(`   Status: ${tierStatus}`);

    if (
      tierLevel === 'Tier' &&
      tierMinAmount.includes('Minimum') &&
      tierDiscount === 'Discount' &&
      tierStatus === 'Status'
    ) {
      results.passed++;
      results.tests.push({ name: 'Discount Tiers Table EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Discount Tiers Table EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Discount Tiers Table EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Switch back to Russian
  console.log('Test 6: Switch Back to Russian');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));

    const lang = await page.$eval('html', el => el.getAttribute('lang') || 'ru');
    const currentBalanceLabel = await page
      .$eval('[data-i18n="currentBalanceLabel"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const transactionsHistory = await page
      .$eval('[data-i18n="transactionsHistory"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Lang attribute: ${lang}`);
    console.log(`   Current balance label: ${currentBalanceLabel}`);
    console.log(`   Transactions history: ${transactionsHistory}`);

    if (currentBalanceLabel.includes('Текущий') && transactionsHistory.includes('История')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch to Russian',
        status: 'FAIL',
        currentBalanceLabel,
        transactionsHistory
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

testBalanceI18n().catch(console.error);
