/**
 * DEEP TEST: project-detail page REDESIGN with rezat.ru project (id=1218)
 * Testing prototype-accurate UI: pill tabs, emerald button, upload icon
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  },
  projectId: 1218 // rezat.ru
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRezatProject() {
  console.log('🔍 DEEP TEST: project-detail page UI (prototype match)...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const results = { passed: [], failed: [] };

  function check(name, condition) {
    if (condition) {
      results.passed.push(name);
      console.log(`   ✅ ${name}`);
    } else {
      results.failed.push(name);
      console.log(`   ❌ ${name}`);
    }
  }

  try {
    // Login
    console.log('1️⃣ Logging in...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Login successful\n');

    // Load page
    console.log('2️⃣ Loading rezat.ru project...');
    await page.goto(CONFIG.baseUrl + '/project-detail.html?id=' + CONFIG.projectId, {
      waitUntil: 'networkidle2'
    });
    await sleep(3000);
    console.log('   ✅ Page loaded\n');

    // ========================================
    // SECTION 1: PILL TABS (PROTOTYPE STYLE)
    // ========================================
    console.log('3️⃣ Checking PILL TABS (prototype style)...');

    // Check pill tabs exist
    const hasPillTabs = await page.evaluate(() => document.querySelector('.pill-tabs') !== null);
    check('Pill tabs container exists', hasPillTabs);

    // Check NO gray background on .pill-tabs
    const pillTabsBg = await page.evaluate(() => {
      const el = document.querySelector('.pill-tabs');
      if (!el) return null;
      return window.getComputedStyle(el).backgroundColor;
    });
    const hasNoGrayBg = pillTabsBg === 'rgba(0, 0, 0, 0)' || pillTabsBg === 'transparent';
    check('Pill tabs has NO gray background (transparent)', hasNoGrayBg);
    console.log(`      Pill tabs background: ${pillTabsBg}`);

    // Check active tab style (light blue)
    const activeTabStyle = await page.evaluate(() => {
      const tab = document.querySelector('.pill-tab.active');
      if (!tab) return null;
      const style = window.getComputedStyle(tab);
      return {
        background: style.backgroundColor,
        color: style.color
      };
    });
    const hasBlueActiveBg = activeTabStyle?.background === 'rgb(239, 246, 255)'; // #eff6ff
    check('Active tab has light blue background (#eff6ff)', hasBlueActiveBg);
    console.log(
      `      Active tab bg: ${activeTabStyle?.background}, color: ${activeTabStyle?.color}`
    );

    // Check tab count format - just number, not in badge
    const tabText = await page
      .$eval('.pill-tab.active', el => el.textContent.trim())
      .catch(() => '');
    const hasCorrectFormat = tabText.includes('(') && tabText.includes(')');
    check('Tab shows count in (N) format', hasCorrectFormat);
    console.log(`      Tab text: "${tabText}"`);

    // ========================================
    // SECTION 2: TOOLBAR BUTTONS
    // ========================================
    console.log('\n4️⃣ Checking TOOLBAR BUTTONS...');

    // Check upload icon (bi-upload, not bi-cloud-upload)
    const hasUploadIcon = await page.evaluate(() => {
      const btn = document.querySelector('.toolbar-btn.secondary');
      return btn && btn.querySelector('.bi-upload') !== null;
    });
    check('Bulk button has bi-upload icon (not cloud)', hasUploadIcon);

    // Check NO cloud icon
    const hasCloudIcon = await page.evaluate(() => {
      const btn = document.querySelector('.toolbar-btn.secondary');
      return btn && btn.querySelector('.bi-cloud-upload') !== null;
    });
    check('NO bi-cloud-upload icon (should be false)', !hasCloudIcon);

    // Check primary button (purple-pink gradient)
    const primaryBtnBg = await page.evaluate(() => {
      const btn = document.querySelector('.toolbar-btn.primary');
      if (!btn) return null;
      return window.getComputedStyle(btn).backgroundImage;
    });
    const hasPurplePinkGradient =
      primaryBtnBg && (primaryBtnBg.includes('139, 92, 246') || primaryBtnBg.includes('8b5cf6'));
    check('Primary button has purple-pink gradient (#8b5cf6)', hasPurplePinkGradient);
    console.log(`      Primary button bg: ${primaryBtnBg?.substring(0, 80)}...`);

    // ========================================
    // SECTION 3: TABLE COLUMN
    // ========================================
    console.log('\n5️⃣ Checking TABLE COLUMNS...');

    // Check "Использований" column header
    const hasUsageHeader = await page.evaluate(() => {
      const headers = document.querySelectorAll('.modern-table th');
      for (const h of headers) {
        if (h.textContent.includes('Использований')) return true;
      }
      return false;
    });
    check('Table has "Использований" column header', hasUsageHeader);

    // Check NO "Статус" column header
    const hasStatusHeader = await page.evaluate(() => {
      const headers = document.querySelectorAll('.modern-table th');
      for (const h of headers) {
        if (h.textContent.includes('Статус')) return true;
      }
      return false;
    });
    check('NO "Статус" column header', !hasStatusHeader);

    // Check usage format (N/N) in table cells
    const usageFormat = await page.evaluate(() => {
      const cells = document.querySelectorAll('.modern-table tbody td');
      for (const cell of cells) {
        const text = cell.textContent.trim();
        if (/^\d+\/\d+$/.test(text)) return text;
      }
      return null;
    });
    check('Usage shown in N/N format', usageFormat !== null);
    console.log(`      Sample usage: ${usageFormat}`);

    // ========================================
    // SECTION 4: TABLE CELL STYLING
    // ========================================
    console.log('\n6️⃣ Checking TABLE CELL STYLING...');

    // Check ID column is blue (no # prefix in React reference)
    const idCellColor = await page.evaluate(() => {
      const idCell = document.querySelector('.modern-table tbody td:nth-child(2) span');
      if (!idCell) return null;
      return window.getComputedStyle(idCell).color;
    });
    const hasBlueId = idCellColor === 'rgb(37, 99, 235)'; // #2563eb
    check('ID column is blue (#2563eb)', hasBlueId);
    console.log(`      ID cell color: ${idCellColor}`);

    // Check Anchor is medium weight (500)
    const anchorStyle = await page.evaluate(() => {
      const anchorCell = document.querySelector('.modern-table tbody td:nth-child(3) span');
      if (!anchorCell) return null;
      const style = window.getComputedStyle(anchorCell);
      return {
        fontWeight: style.fontWeight,
        color: style.color
      };
    });
    const hasMediumAnchor =
      anchorStyle && (anchorStyle.fontWeight === '500' || anchorStyle.fontWeight === '600');
    check('Anchor has medium weight (font-weight: 500)', hasMediumAnchor);
    console.log(
      `      Anchor style: weight=${anchorStyle?.fontWeight}, color=${anchorStyle?.color}`
    );

    // Check HTML context has highlighted anchor with .anchor-highlight class
    const hasHighlightedAnchor = await page.evaluate(() => {
      const contextCell = document.querySelector('.modern-table tbody td:nth-child(4) div');
      if (!contextCell) return false;
      // Look for anchor-highlight class
      const highlight = contextCell.querySelector('.anchor-highlight');
      return highlight !== null;
    });
    check('HTML context has highlighted anchor (.anchor-highlight)', hasHighlightedAnchor);

    // ========================================
    // SECTION 5: ACTION BUTTONS
    // ========================================
    console.log('\n7️⃣ Checking ACTION BUTTONS...');

    const hasActionBtns = await page.evaluate(
      () => document.querySelector('.action-btns') !== null
    );
    check('Compact action buttons present', hasActionBtns);

    const hasEditBtn = await page.evaluate(
      () => document.querySelector('.action-btn.edit') !== null
    );
    check('Edit button (.action-btn.edit)', hasEditBtn);

    const hasDeleteBtn = await page.evaluate(
      () => document.querySelector('.action-btn.delete') !== null
    );
    check('Delete button (.action-btn.delete)', hasDeleteBtn);

    // ========================================
    // SCREENSHOT
    // ========================================
    console.log('\n📸 Taking screenshot...');
    await page.screenshot({
      path: 'tests/visual/screenshots/rezat-project-full.png',
      fullPage: true
    });
    console.log('   ✅ Screenshot saved');

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   ✅ PASSED: ${results.passed.length}`);
    console.log(`   ❌ FAILED: ${results.failed.length}`);

    if (results.failed.length > 0) {
      console.log('\nFailed:');
      results.failed.forEach(f => console.log(`   • ${f}`));
    }

    console.log('\nPrototype match:');
    console.log(
      '  • Pill tabs (no gray bg, blue active): ' + (hasNoGrayBg && hasBlueActiveBg ? 'YES' : 'NO')
    );
    console.log('  • Upload icon (not cloud): ' + (hasUploadIcon && !hasCloudIcon ? 'YES' : 'NO'));
    console.log('  • Purple-pink button: ' + (hasPurplePinkGradient ? 'YES' : 'NO'));
    console.log('  • Usage column (N/N): ' + (hasUsageHeader && usageFormat ? 'YES' : 'NO'));
    console.log('═══════════════════════════════════════════════════════════');

    if (results.failed.length === 0) {
      console.log('\n🎉 ALL TESTS PASSED! UI matches prototype.');
    } else {
      console.log('\n⚠️ SOME TESTS FAILED.');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Test completed');
  }
}

testRezatProject().catch(console.error);
