/**
 * Visual test for referrals page redesign
 */
const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

async function testReferralsPage() {
  console.log('='.repeat(60));
  console.log('REFERRALS PAGE REDESIGN TEST');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Capture console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    errors.push('Page Error: ' + err.message);
  });

  try {
    // Login via API
    console.log('\n1. Logging in via API...');
    await page.goto(`${CONFIG.baseUrl}/login.html`, { waitUntil: 'networkidle0' });

    const loginResponse = await page.evaluate(async (credentials) => {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password
        })
      });
      return await resp.json();
    }, CONFIG.credentials);

    if (loginResponse.token) {
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
      }, loginResponse.token);
      console.log('   Login successful');
    } else {
      throw new Error('Login failed: ' + JSON.stringify(loginResponse));
    }

    // Go to referrals page
    console.log('\n2. Opening referrals page...');
    await page.goto(`${CONFIG.baseUrl}/referrals.html`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 3000));

    // Check page title
    const pageTitle = await page.title();
    console.log('   Page title:', pageTitle);

    // Check for main elements
    console.log('\n3. Checking page structure...');

    // Check header
    const headerExists = await page.$('.ref-header');
    console.log('   Header (.ref-header):', headerExists ? '✅ Found' : '❌ Missing');

    // Check referral link card
    const linkCardExists = await page.$('.ref-link-card');
    console.log('   Link card (.ref-link-card):', linkCardExists ? '✅ Found' : '❌ Missing');

    // Check stats grid
    const statsGridExists = await page.$('.ref-stats-grid');
    console.log('   Stats grid (.ref-stats-grid):', statsGridExists ? '✅ Found' : '❌ Missing');

    // Check stat cards (4 expected)
    const statCards = await page.$$('.ref-stat-card');
    console.log('   Stat cards (.ref-stat-card):', statCards.length === 4 ? `✅ Found ${statCards.length}` : `❌ Expected 4, found ${statCards.length}`);

    // Check each color variant
    const greenCard = await page.$('.ref-stat-card.green');
    const blueCard = await page.$('.ref-stat-card.blue');
    const cyanCard = await page.$('.ref-stat-card.cyan');
    const amberCard = await page.$('.ref-stat-card.amber');
    console.log('   Color cards: green:', !!greenCard, 'blue:', !!blueCard, 'cyan:', !!cyanCard, 'amber:', !!amberCard);

    // Check wallet card
    const walletCardExists = await page.$('.ref-wallet-card');
    console.log('   Wallet card (.ref-wallet-card):', walletCardExists ? '✅ Found' : '❌ Missing');

    // Check withdraw card
    const withdrawCardExists = await page.$('.ref-withdraw-card');
    console.log('   Withdraw card (.ref-withdraw-card):', withdrawCardExists ? '✅ Found' : '❌ Missing');

    // Check tables
    const tableCards = await page.$$('.ref-table-card');
    console.log('   Table cards (.ref-table-card):', tableCards.length === 2 ? `✅ Found ${tableCards.length}` : `❌ Expected 2, found ${tableCards.length}`);

    // Check data loaded
    console.log('\n4. Checking data loading...');

    const referralCode = await page.$eval('#referralCode', el => el.value).catch(() => '');
    console.log('   Referral code:', referralCode || '(empty)');

    const referralBalance = await page.$eval('#referralBalance', el => el.textContent).catch(() => 'N/A');
    console.log('   Referral balance: $' + referralBalance);

    const totalEarnings = await page.$eval('#totalEarnings', el => el.textContent).catch(() => 'N/A');
    console.log('   Total earnings: $' + totalEarnings);

    const totalReferrals = await page.$eval('#totalReferrals', el => el.textContent).catch(() => 'N/A');
    console.log('   Total referrals:', totalReferrals);

    // Test copy button click
    console.log('\n5. Testing copy button...');
    try {
      await page.click('.ref-link-btn.copy');
      await new Promise(r => setTimeout(r, 500));
      console.log('   Copy button clicked: ✅');
    } catch (e) {
      console.log('   Copy button error:', e.message);
    }

    // Take screenshot
    await page.screenshot({ path: 'tests/visual/screenshots/referrals-redesign.png', fullPage: true });
    console.log('\n6. Screenshot saved to tests/visual/screenshots/referrals-redesign.png');

    // Report console errors
    console.log('\n' + '='.repeat(60));
    if (errors.length > 0) {
      console.log('❌ Console errors found:');
      errors.forEach(e => console.log('   -', e));
    } else {
      console.log('✅ No console errors detected');
    }
    console.log('='.repeat(60));

  } catch (e) {
    console.error('Test failed:', e.message);
  } finally {
    await browser.close();
  }
}

testReferralsPage();
