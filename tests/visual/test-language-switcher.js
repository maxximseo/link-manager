/**
 * Visual test for Language Switcher (RU/EN)
 * Tests language toggle functionality across dashboard pages
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

async function testLanguageSwitcher() {
  console.log('Starting Language Switcher Tests...\n');

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
    await new Promise(r => setTimeout(r, 2000)); // Wait for page to settle
    console.log('   Logged in successfully\n');
  } catch (error) {
    console.log(`   Login failed: ${error.message}\n`);
    await browser.close();
    return results;
  }

  // Test 1: Check language switcher button exists on dashboard
  console.log('Test 1: Language switcher button exists on dashboard');
  try {
    const langSwitcher = await page.$('.lang-switcher');
    if (langSwitcher) {
      const buttonText = await page.$eval('.lang-switcher .lang-code', el => el.textContent);
      console.log(`   Found language switcher button with text: ${buttonText}`);

      await page.screenshot({
        path: path.join(CONFIG.screenshotDir, 'lang-switcher-dashboard.png'),
        fullPage: false
      });
      console.log('   Screenshot saved: lang-switcher-dashboard.png');

      results.passed++;
      results.tests.push({ name: 'Language switcher exists', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Language switcher exists', status: 'FAIL' });
      console.log('   FAIL - Language switcher button not found\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Language switcher exists', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 2: Check Russian sidebar menu items (default)
  console.log('Test 2: Russian sidebar menu items (default)');
  try {
    // Set language to Russian
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const menuItemText = await page.$eval(
      '.nav-menu .menu-item:first-child .menu-label',
      el => el.textContent
    );
    console.log(`   First menu item: ${menuItemText}`);

    const balanceLabel = await page
      .$eval('.balance-box .balance-label', el => el.textContent)
      .catch(() => 'NOT FOUND');
    console.log(`   Balance label: ${balanceLabel}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'lang-switcher-ru.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: lang-switcher-ru.png');

    if (menuItemText === 'Проекты' && balanceLabel === 'Баланс') {
      results.passed++;
      results.tests.push({ name: 'Russian sidebar menu', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Russian sidebar menu',
        status: 'FAIL',
        menuItemText,
        balanceLabel
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Russian sidebar menu', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 3: Switch to English and verify menu items
  console.log('Test 3: Switch to English and verify menu items');
  try {
    // Set language to English
    await page.evaluate(() => {
      localStorage.setItem('lang', 'en');
    });
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const menuItemText = await page.$eval(
      '.nav-menu .menu-item:first-child .menu-label',
      el => el.textContent
    );
    console.log(`   First menu item: ${menuItemText}`);

    const balanceLabel = await page
      .$eval('.balance-box .balance-label', el => el.textContent)
      .catch(() => 'NOT FOUND');
    console.log(`   Balance label: ${balanceLabel}`);

    const langCode = await page.$eval('.lang-switcher .lang-code', el => el.textContent);
    console.log(`   Language code shown: ${langCode}`);

    await page.screenshot({
      path: path.join(CONFIG.screenshotDir, 'lang-switcher-en.png'),
      fullPage: true
    });
    console.log('   Screenshot saved: lang-switcher-en.png');

    if (menuItemText === 'Projects' && balanceLabel === 'Balance' && langCode === 'EN') {
      results.passed++;
      results.tests.push({ name: 'English sidebar menu', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'English sidebar menu',
        status: 'FAIL',
        menuItemText,
        balanceLabel,
        langCode
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'English sidebar menu', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 4: Check "Add link" button translation
  console.log('Test 4: Check "Add link" button translation');
  try {
    const addLinkText = await page.$eval('.add-link-btn span', el => el.textContent);
    console.log(`   Add link button: ${addLinkText}`);

    if (addLinkText === 'Add link') {
      results.passed++;
      results.tests.push({ name: 'Add link button EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Add link button EN', status: 'FAIL', addLinkText });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Add link button EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 5: Check notifications button translation
  console.log('Test 5: Check notifications title translation');
  try {
    // Hover or click notifications to see title
    const notifBtn = await page.$('.notification-btn');
    const notifTitle = await notifBtn.evaluate(el => el.getAttribute('title'));
    console.log(`   Notifications button title: ${notifTitle}`);

    if (notifTitle === 'Notifications') {
      results.passed++;
      results.tests.push({ name: 'Notifications title EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({ name: 'Notifications title EN', status: 'FAIL', notifTitle });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Notifications title EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 6: Check sidebar footer translations (expand/collapse, settings)
  console.log('Test 6: Check sidebar footer translations');
  try {
    const collapseBtn = await page.$('.collapse-btn');
    const collapseTitle = await collapseBtn.evaluate(el => el.getAttribute('title'));
    console.log(`   Collapse button title: ${collapseTitle}`);

    const settingsLink = await page.$('.settings-link');
    const settingsText = await settingsLink.evaluate(el => el.textContent.trim());
    console.log(`   Settings link text: ${settingsText}`);

    if (collapseTitle === 'Collapse' && settingsText === 'Settings') {
      results.passed++;
      results.tests.push({ name: 'Sidebar footer EN', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Sidebar footer EN',
        status: 'FAIL',
        collapseTitle,
        settingsText
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Sidebar footer EN', status: 'ERROR', error: error.message });
    console.log(`   ERROR: ${error.message}\n`);
  }

  // Test 7: Switch back to Russian and verify
  console.log('Test 7: Switch back to Russian and verify');
  try {
    await page.evaluate(() => {
      localStorage.setItem('lang', 'ru');
    });
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const langCode = await page.$eval('.lang-switcher .lang-code', el => el.textContent);
    const menuItemText = await page.$eval(
      '.nav-menu .menu-item:first-child .menu-label',
      el => el.textContent
    );

    console.log(`   Language code shown: ${langCode}`);
    console.log(`   First menu item: ${menuItemText}`);

    if (langCode === 'RU' && menuItemText === 'Проекты') {
      results.passed++;
      results.tests.push({ name: 'Switch back to Russian', status: 'PASS' });
      console.log('   PASS\n');
    } else {
      results.failed++;
      results.tests.push({
        name: 'Switch back to Russian',
        status: 'FAIL',
        langCode,
        menuItemText
      });
      console.log('   FAIL\n');
    }
  } catch (error) {
    results.failed++;
    results.tests.push({ name: 'Switch back to Russian', status: 'ERROR', error: error.message });
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

testLanguageSwitcher().catch(console.error);
