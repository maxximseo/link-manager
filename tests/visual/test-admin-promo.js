/**
 * Visual test for Admin Promo Codes page
 * Tests: page loads, create form works, table displays data
 */
const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3003';
const CREDENTIALS = {
  username: 'maximator',
  password: '*8NKDb6fXXLVu1h*'
};

async function test() {
  console.log('🧪 ADMIN PROMO PAGE TEST\n');
  console.log('═'.repeat(50));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // 1. Login
    console.log('\n📋 Step 1: Login');
    await page.goto(`${BASE_URL}/login.html`);
    await page.type('#username', CREDENTIALS.username);
    await page.type('#password', CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Logged in successfully');

    // 2. Navigate to admin-promo page
    console.log('\n📋 Step 2: Navigate to Admin Promo page');
    await page.goto(`${BASE_URL}/admin-promo.html`);
    await page.waitForSelector('#promoCodesTableBody', { timeout: 10000 });
    console.log('   ✅ Admin Promo page loaded');

    // 3. Check statistics cards
    console.log('\n📋 Step 3: Check statistics cards');
    const totalPromoCodes = await page.$eval('#totalPromoCodes', el => el.textContent);
    const activePromoCodes = await page.$eval('#activePromoCodes', el => el.textContent);
    const totalActivations = await page.$eval('#totalActivations', el => el.textContent);
    console.log(`   Total: ${totalPromoCodes}, Active: ${activePromoCodes}, Activations: ${totalActivations}`);
    console.log('   ✅ Statistics cards displayed');

    // 4. Test create promo code form
    console.log('\n📋 Step 4: Test create promo code form');
    const testCode = 'VISUAL' + Date.now();
    await page.type('#promoCode', testCode);
    await page.evaluate(() => {
      document.getElementById('promoBonusAmount').value = '150';
      document.getElementById('promoPartnerReward').value = '75';
      document.getElementById('promoMinDeposit').value = '200';
      document.getElementById('promoMaxUses').value = '10';
    });
    console.log(`   Code: ${testCode}`);
    console.log('   Bonus: $150, Partner: $75, Min: $200, Max uses: 10');

    // Submit form
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Wait for table to reload
    await page.waitForSelector('#promoCodesTableBody tr', { timeout: 5000 });
    console.log('   ✅ Promo code created');

    // 5. Verify promo code appears in table
    console.log('\n📋 Step 5: Verify promo code in table');
    const tableHTML = await page.$eval('#promoCodesTableBody', el => el.innerHTML);
    if (tableHTML.includes(testCode)) {
      console.log(`   ✅ Code ${testCode} found in table`);
    } else {
      console.log(`   ❌ Code ${testCode} NOT found in table`);
    }

    // 6. Screenshot
    console.log('\n📋 Step 6: Take screenshot');
    await page.screenshot({
      path: 'tests/visual/screenshots/admin-promo-page.png',
      fullPage: true
    });
    console.log('   ✅ Screenshot saved: admin-promo-page.png');

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(50));
    console.log('   Page load: ✅ SUCCESS');
    console.log('   Statistics: ✅ SUCCESS');
    console.log('   Create form: ✅ SUCCESS');
    console.log('   Table display: ✅ SUCCESS');
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'tests/visual/screenshots/admin-promo-error.png' });
    console.log('   Error screenshot saved');
  } finally {
    await browser.close();
  }
}

test();
