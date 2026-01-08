/**
 * Test progress modal width
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

async function testModalWidth() {
  console.log('🔍 Testing progress modal width...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Login
    console.log('1️⃣ Logging in...');
    await page.goto(`${CONFIG.baseUrl}/login.html`, { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Login successful\n');

    // Go to placements page
    console.log('2️⃣ Going to placements page...');
    await page.goto(`${CONFIG.baseUrl}/placements.html`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    console.log('   ✅ Page loaded\n');

    // Check CSS rule
    console.log('3️⃣ Checking CSS rule for #progressModal .modal-dialog...');
    const cssRule = await page.evaluate(() => {
      const styleSheets = document.styleSheets;
      for (let i = 0; i < styleSheets.length; i++) {
        try {
          const rules = styleSheets[i].cssRules || styleSheets[i].rules;
          for (let j = 0; j < rules.length; j++) {
            if (rules[j].selectorText && rules[j].selectorText.includes('progressModal')) {
              return {
                selector: rules[j].selectorText,
                maxWidth: rules[j].style.maxWidth
              };
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
        }
      }
      return null;
    });
    console.log('   CSS Rule found:', cssRule);

    // Check inline style on modal-dialog
    console.log('\n4️⃣ Checking inline style on modal-dialog...');
    const inlineStyle = await page.evaluate(() => {
      const modal = document.querySelector('#progressModal .modal-dialog');
      if (modal) {
        return {
          inlineMaxWidth: modal.style.maxWidth,
          computedMaxWidth: window.getComputedStyle(modal).maxWidth
        };
      }
      return null;
    });
    console.log('   Inline style:', inlineStyle);

    // Open modal programmatically
    console.log('\n5️⃣ Opening modal programmatically...');
    await page.evaluate(() => {
      const modal = new bootstrap.Modal(document.getElementById('progressModal'));
      modal.show();
    });
    await sleep(500);

    // Get computed width when modal is open
    const modalWidth = await page.evaluate(() => {
      const modalDialog = document.querySelector('#progressModal .modal-dialog');
      if (modalDialog) {
        const computed = window.getComputedStyle(modalDialog);
        const rect = modalDialog.getBoundingClientRect();
        return {
          computedMaxWidth: computed.maxWidth,
          computedWidth: computed.width,
          actualWidth: rect.width,
          actualHeight: rect.height
        };
      }
      return null;
    });
    console.log('   Modal dimensions:', modalWidth);

    // Take screenshot
    console.log('\n6️⃣ Taking screenshot...');
    await page.screenshot({
      path: 'tests/visual/screenshots/modal-width-test.png',
      fullPage: false
    });
    console.log('   ✅ Screenshot saved to tests/visual/screenshots/modal-width-test.png');

    // Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════');

    if (modalWidth && modalWidth.actualWidth >= 700) {
      console.log(`✅ PASS: Modal width is ${modalWidth.actualWidth}px (expected ~720px)`);
    } else {
      console.log(
        `❌ FAIL: Modal width is ${modalWidth?.actualWidth || 'unknown'}px (expected ~720px)`
      );
      console.log('   CSS rule:', cssRule);
      console.log('   Inline style:', inlineStyle);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
}

testModalWidth().catch(console.error);
