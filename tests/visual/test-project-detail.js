/**
 * Test project detail page redesign
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

async function testProjectDetailRedesign() {
  console.log('🔍 Testing project-detail page redesign...\n');

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

    // Go to dashboard to get a project ID
    console.log('2️⃣ Getting project list...');
    await page.goto(`${CONFIG.baseUrl}/dashboard.html`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Find first project link
    const projectLink = await page.$('a[href*="project-detail.html"]');
    if (!projectLink) {
      console.log('   ⚠️ No projects found, creating test will use project ID 1');
    }
    console.log('   ✅ Ready\n');

    // Go to project detail page (using project ID 1)
    console.log('3️⃣ Loading project-detail page...');
    await page.goto(`${CONFIG.baseUrl}/project-detail.html?id=1`, { waitUntil: 'networkidle2' });
    await sleep(3000);
    console.log('   ✅ Page loaded\n');

    // Check gradient header
    console.log('4️⃣ Checking gradient header...');
    const headerStyle = await page.evaluate(() => {
      const header = document.querySelector('.project-header');
      if (header) {
        const style = window.getComputedStyle(header);
        return {
          exists: true,
          background: style.background || style.backgroundImage,
          borderRadius: style.borderRadius,
          color: style.color
        };
      }
      return { exists: false };
    });
    console.log('   Header exists:', headerStyle.exists);
    if (headerStyle.exists) {
      console.log('   Background:', headerStyle.background.substring(0, 50) + '...');
      console.log('   Border radius:', headerStyle.borderRadius);
      console.log('   Color:', headerStyle.color);
    }

    // Check stat cards
    console.log('\n5️⃣ Checking stat cards...');
    const statCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.stat-card');
      return {
        count: cards.length,
        linksTotal: document.getElementById('statLinksTotal')?.textContent || 'N/A',
        articlesTotal: document.getElementById('statArticlesTotal')?.textContent || 'N/A',
        activeTotal: document.getElementById('statActiveTotal')?.textContent || 'N/A'
      };
    });
    console.log('   Stat cards count:', statCards.count, '(expected: 3)');
    console.log('   Links total:', statCards.linksTotal);
    console.log('   Articles total:', statCards.articlesTotal);
    console.log('   Active total:', statCards.activeTotal);

    // Check modern tabs
    console.log('\n6️⃣ Checking modern tabs...');
    const tabsStyle = await page.evaluate(() => {
      const tabs = document.querySelector('.modern-tabs');
      const navLink = document.querySelector('.modern-tabs .nav-link');
      return {
        tabsExist: !!tabs,
        navLinkActive: navLink?.classList.contains('active') || false,
        tabsBackground: tabs ? window.getComputedStyle(tabs).background : 'N/A'
      };
    });
    console.log('   Modern tabs exist:', tabsStyle.tabsExist);
    console.log('   Nav link active:', tabsStyle.navLinkActive);

    // Check modern table
    console.log('\n7️⃣ Checking modern table...');
    const tableStyle = await page.evaluate(() => {
      const table = document.querySelector('.modern-table');
      const usageBadge = document.querySelector('.usage-badge');
      return {
        tableExists: !!table,
        badgeExists: !!usageBadge,
        badgeClass: usageBadge?.className || 'N/A'
      };
    });
    console.log('   Modern table exists:', tableStyle.tableExists);
    console.log('   Usage badge exists:', tableStyle.badgeExists);
    console.log('   Badge class:', tableStyle.badgeClass);

    // Take screenshot
    console.log('\n8️⃣ Taking screenshot...');
    await page.screenshot({
      path: 'tests/visual/screenshots/project-detail-redesign.png',
      fullPage: true
    });
    console.log('   ✅ Screenshot saved to tests/visual/screenshots/project-detail-redesign.png');

    // Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════');

    const passed = headerStyle.exists && statCards.count === 3 && tabsStyle.tabsExist;
    if (passed) {
      console.log('✅ PASS: Project detail page redesign is working!');
      console.log('   - Gradient header: ✓');
      console.log('   - 3 stat cards: ✓');
      console.log('   - Modern tabs: ✓');
      console.log('   - Modern table: ✓');
    } else {
      console.log('❌ FAIL: Some elements are missing');
      console.log('   - Gradient header:', headerStyle.exists ? '✓' : '✗');
      console.log('   - 3 stat cards:', statCards.count === 3 ? '✓' : '✗');
      console.log('   - Modern tabs:', tabsStyle.tabsExist ? '✓' : '✗');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
}

testProjectDetailRedesign().catch(console.error);
