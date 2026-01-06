/**
 * Visual test: Page Icons with Gradient Backgrounds
 * Verifies that all pages have styled icons in headers
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

const PAGES_TO_TEST = [
  {
    url: '/dashboard.html',
    name: 'Dashboard',
    expectedIcon: 'folder2',
    expectedGradient: 'gradient-blue-indigo'
  },
  {
    url: '/sites.html',
    name: 'Sites',
    expectedIcon: 'globe2',
    expectedGradient: 'gradient-green-teal'
  },
  {
    url: '/placements.html',
    name: 'Placements',
    expectedIcon: 'cart-check-fill',
    expectedGradient: 'gradient-purple-pink'
  },
  {
    url: '/placements-manager.html',
    name: 'Placements Manager',
    expectedIcon: 'link-45deg',
    expectedGradient: 'gradient-purple-pink'
  },
  {
    url: '/balance.html',
    name: 'Balance',
    expectedIcon: 'wallet2',
    expectedGradient: 'gradient-yellow-orange'
  },
  {
    url: '/profile.html',
    name: 'Profile',
    expectedIcon: 'person-circle',
    expectedGradient: 'gradient-blue-indigo'
  },
  {
    url: '/statistics.html',
    name: 'Statistics',
    expectedIcon: 'bar-chart-line',
    expectedGradient: 'gradient-green-teal'
  },
  {
    url: '/referrals.html',
    name: 'Referrals',
    expectedIcon: 'people',
    expectedGradient: 'gradient-purple-pink'
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPageIcons() {
  console.log('='.repeat(60));
  console.log('VISUAL TEST: Page Icons with Gradient Backgrounds');
  console.log('='.repeat(60));
  console.log('');

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

  function addResult(name, passed, details = '') {
    results.tests.push({ name, passed, details });
    if (passed) {
      results.passed++;
      console.log(`   [PASS] ${name}`);
    } else {
      results.failed++;
      console.log(`   [FAIL] ${name}${details ? ': ' + details : ''}`);
    }
  }

  try {
    // Login
    console.log('1. Logging in...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   Login successful\n');

    // Test each page
    for (const pageInfo of PAGES_TO_TEST) {
      console.log(`2. Testing ${pageInfo.name} (${pageInfo.url})...`);

      await page.goto(CONFIG.baseUrl + pageInfo.url, { waitUntil: 'networkidle2' });
      await sleep(1000);

      // Check for icon element
      const iconCheck = await page.evaluate(() => {
        const iconContainer = document.querySelector('.page-title-icon');
        const icon = iconContainer?.querySelector('i');

        if (!iconContainer || !icon) {
          return { found: false };
        }

        return {
          found: true,
          iconClass: icon.className,
          containerClasses: iconContainer.className,
          hasGradient: iconContainer.className.includes('gradient-'),
          computedBg: getComputedStyle(iconContainer).backgroundImage
        };
      });

      addResult(
        `${pageInfo.name}: Has icon container`,
        iconCheck.found,
        iconCheck.found ? '' : 'Icon container not found'
      );

      if (iconCheck.found) {
        addResult(
          `${pageInfo.name}: Has gradient background`,
          iconCheck.hasGradient,
          iconCheck.hasGradient ? iconCheck.containerClasses : 'No gradient class found'
        );

        const hasExpectedIcon = iconCheck.iconClass.includes(pageInfo.expectedIcon);
        addResult(
          `${pageInfo.name}: Correct icon (${pageInfo.expectedIcon})`,
          hasExpectedIcon,
          hasExpectedIcon ? '' : `Found: ${iconCheck.iconClass}`
        );
      }

      // Take screenshot of header
      const header = await page.$('.main-header');
      if (header) {
        await header.screenshot({
          path: `tests/visual/screenshots/icon-${pageInfo.name.toLowerCase().replace(/\s+/g, '-')}.png`
        });
        console.log(
          `   Screenshot saved: icon-${pageInfo.name.toLowerCase().replace(/\s+/g, '-')}.png`
        );
      }
      console.log('');
    }
  } catch (error) {
    console.error('\nTest error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/icons-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`   PASSED: ${results.passed}`);
  console.log(`   FAILED: ${results.failed}`);
  console.log('='.repeat(60));

  if (results.failed === 0) {
    console.log('\nAll pages have proper icons with gradient backgrounds!');
  } else {
    console.log('\nSome tests failed. Review details above.');
  }

  console.log('\nTest completed');
}

testPageIcons().catch(console.error);
