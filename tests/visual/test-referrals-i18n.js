/**
 * Visual test for Referrals page i18n (RU/EN)
 * Tests multilingual support on referrals/affiliate program page
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { loadCredentials } = require('../utils/credentials');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  screenshotDir: path.join(__dirname, 'screenshots'),
  credentials: loadCredentials()
};

// Ensure screenshots directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

async function testReferralsI18n() {
  console.log('Starting Referrals i18n Tests...\n');

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

  // Test 1: Russian Referrals Page (default)
  console.log('Test 1: Russian Referrals Page (default)');
  try {
    // Clear localStorage lang to test default
    await page.evaluate(() => {
      localStorage.removeItem('lang');
    });

    await page.goto(`${CONFIG.baseUrl}/referrals.html`, {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for Russian text elements
    const referralsTitle = await page
      .$eval('[data-i18n="referralsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const yourReferralLink = await page
      .$eval('[data-i18n="yourReferralLink"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Referrals title: ${referralsTitle}`);
    console.log(`   Your referral link: ${yourReferralLink}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'referrals-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: referrals-ru.png');

    if (referralsTitle.includes('Партнёрская') && yourReferralLink.includes('реферальная')) {
      results.passed++;
      results.tests.push({ name: 'Russian Referrals Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian Referrals Page',
        status: 'FAIL',
        referralsTitle,
        yourReferralLink
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian Referrals Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Switch to English via localStorage
  console.log('Test 2: English Referrals Page (via localStorage)');
  try {
    // Set language to English in localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });

    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for translations to apply

    // Check for English text elements
    const referralsTitle = await page
      .$eval('[data-i18n="referralsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const yourReferralLink = await page
      .$eval('[data-i18n="yourReferralLink"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const copyBtn = await page
      .$eval('[data-i18n="copyBtn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Referrals title: ${referralsTitle}`);
    console.log(`   Your referral link: ${yourReferralLink}`);
    console.log(`   Copy button: ${copyBtn}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'referrals-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: referrals-en.png');

    if (
      referralsTitle.includes('Affiliate') &&
      yourReferralLink.includes('referral') &&
      copyBtn.includes('Copy')
    ) {
      results.passed++;
      results.tests.push({ name: 'English Referrals Page', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English Referrals Page',
        status: 'FAIL',
        referralsTitle,
        yourReferralLink
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English Referrals Page', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Stats Cards in English
  console.log('Test 3: Stats Cards (English)');
  try {
    const availableForWithdrawal = await page
      .$eval('[data-i18n="availableForWithdrawal"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const totalEarned = await page
      .$eval('[data-i18n="totalEarned"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const withdrawn = await page
      .$eval('[data-i18n="withdrawn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Available for withdrawal: ${availableForWithdrawal}`);
    console.log(`   Total earned: ${totalEarned}`);
    console.log(`   Withdrawn: ${withdrawn}`);

    if (
      availableForWithdrawal.includes('Available') &&
      totalEarned.includes('Total earned') &&
      withdrawn.includes('Withdrawn')
    ) {
      results.passed++;
      results.tests.push({ name: 'Stats Cards EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Stats Cards EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Stats Cards EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: USDT Wallet Section in English
  console.log('Test 4: USDT Wallet Section (English)');
  try {
    const usdtWalletTitle = await page
      .$eval('[data-i18n="usdtWalletTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const saveWalletBtn = await page
      .$eval('[data-i18n="saveWalletBtn"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   USDT Wallet title: ${usdtWalletTitle}`);
    console.log(`   Save wallet button: ${saveWalletBtn}`);

    if (usdtWalletTitle.includes('USDT TRC20') && saveWalletBtn.includes('Save')) {
      results.passed++;
      results.tests.push({ name: 'USDT Wallet Section EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'USDT Wallet Section EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'USDT Wallet Section EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Tables Headers in English
  console.log('Test 5: Tables Headers (English)');
  try {
    const referredUsersTitle = await page
      .$eval('[data-i18n="referredUsersTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const commissionHistoryTitle = await page
      .$eval('[data-i18n="commissionHistoryTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Referred users title: ${referredUsersTitle}`);
    console.log(`   Commission history title: ${commissionHistoryTitle}`);

    if (
      referredUsersTitle.includes('Referred') &&
      commissionHistoryTitle.includes('Commission history')
    ) {
      results.passed++;
      results.tests.push({ name: 'Tables Headers EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Tables Headers EN', status: 'FAIL' });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Tables Headers EN', status: 'ERROR', error: error.message });
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

    const referralsTitle = await page
      .$eval('[data-i18n="referralsTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');
    const usdtWalletTitle = await page
      .$eval('[data-i18n="usdtWalletTitle"]', el => el.textContent)
      .catch(() => 'NOT FOUND');

    console.log(`   Referrals title: ${referralsTitle}`);
    console.log(`   USDT Wallet title: ${usdtWalletTitle}`);

    if (referralsTitle.includes('Партнёрская') && usdtWalletTitle.includes('Кошелёк')) {
      results.passed++;
      results.tests.push({ name: 'Switch to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch to Russian',
        status: 'FAIL',
        referralsTitle,
        usdtWalletTitle
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

testReferralsI18n().catch(console.error);
