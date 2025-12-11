/**
 * Test modal gradient header
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

async function testModalGradient() {
  console.log('🔍 Testing modal gradient header...\n');

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

    // Go to dashboard to find a real project
    console.log('2️⃣ Finding a real project...');
    await page.goto(`${CONFIG.baseUrl}/dashboard.html`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Get first project link
    const projectLink = await page.$eval('a[href*="project-detail.html"]', el => el.href).catch(() => null);

    if (!projectLink) {
      console.log('   ⚠️ No projects found');
      await browser.close();
      return;
    }

    console.log('   ✅ Found project link:', projectLink);

    // Go to project detail
    console.log('\n3️⃣ Loading project detail...');
    await page.goto(projectLink, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Take screenshot of the page
    await page.screenshot({
      path: 'tests/visual/screenshots/project-detail-with-data.png',
      fullPage: true
    });
    console.log('   ✅ Page screenshot saved');

    // Click "Добавить ссылку" button to open modal
    console.log('\n4️⃣ Opening Add Link modal...');
    const addLinkBtn = await page.$('button.btn-gradient');
    if (addLinkBtn) {
      await addLinkBtn.click();
      await sleep(500);

      // Take screenshot with modal open
      await page.screenshot({
        path: 'tests/visual/screenshots/modal-gradient-header.png',
        fullPage: false
      });
      console.log('   ✅ Modal screenshot saved');

      // Check modal header gradient
      const modalHeaderStyle = await page.evaluate(() => {
        const header = document.querySelector('.modal-header');
        if (header) {
          const style = window.getComputedStyle(header);
          return {
            exists: true,
            background: style.background || style.backgroundImage,
            color: style.color
          };
        }
        return { exists: false };
      });

      console.log('\n5️⃣ Modal header check:');
      console.log('   Background:', modalHeaderStyle.background?.substring(0, 60) + '...');
      console.log('   Has gradient:', modalHeaderStyle.background?.includes('gradient') || false);

    } else {
      console.log('   ⚠️ Add Link button not found');
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 DONE');
    console.log('═══════════════════════════════════════════');
    console.log('Screenshots saved to tests/visual/screenshots/');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
}

testModalGradient().catch(console.error);
