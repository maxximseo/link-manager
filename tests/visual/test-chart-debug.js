/**
 * Debug statistics chart visibility issue
 */
const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'https://shark-app-9kv6u.ondigitalocean.app',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  }
};

async function testChart() {
  console.log('='.repeat(60));
  console.log('STATISTICS CHART DEBUG');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Capture console
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    // Go to statistics
    await page.goto(`${CONFIG.baseUrl}/statistics.html`, { waitUntil: 'networkidle0' });

    // Login
    const loginResp = await page.evaluate(async creds => {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: creds.username, password: creds.password })
      });
      return await resp.json();
    }, CONFIG.credentials);

    if (loginResp.token) {
      await page.evaluate(token => localStorage.setItem('token', token), loginResp.token);
      console.log('Login successful');
    }

    // Reload page
    await page.goto(`${CONFIG.baseUrl}/statistics.html`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 3000));

    // Check chart canvas
    const chartInfo = await page.evaluate(() => {
      const canvas = document.getElementById('spendingByTypeChart');
      if (!canvas) return { exists: false };

      const styles = window.getComputedStyle(canvas);
      const parent = canvas.parentElement;
      const parentStyles = parent ? window.getComputedStyle(parent) : null;

      return {
        exists: true,
        width: canvas.width,
        height: canvas.height,
        displayWidth: styles.width,
        displayHeight: styles.height,
        visibility: styles.visibility,
        display: styles.display,
        opacity: styles.opacity,
        parentClass: parent?.className || 'no parent',
        parentWidth: parentStyles?.width,
        parentHeight: parentStyles?.height,
        parentDisplay: parentStyles?.display
      };
    });

    console.log('\nChart canvas info:', JSON.stringify(chartInfo, null, 2));

    // Check if Chart.js is loaded
    const chartJsLoaded = await page.evaluate(() => {
      return typeof Chart !== 'undefined';
    });
    console.log('\nChart.js loaded:', chartJsLoaded);

    // Check spendingByTypeChart variable
    const chartVarInfo = await page.evaluate(() => {
      return {
        exists: typeof spendingByTypeChart !== 'undefined',
        isNull: typeof spendingByTypeChart !== 'undefined' && spendingByTypeChart === null,
        type: typeof spendingByTypeChart
      };
    });
    console.log('spendingByTypeChart variable:', JSON.stringify(chartVarInfo));

    // Check API response for placements
    const apiData = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/billing/statistics/placements?period=week', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return await resp.json();
    });
    console.log('\nAPI placements response:', JSON.stringify(apiData, null, 2));

    // Screenshot
    await page.screenshot({
      path: 'tests/visual/screenshots/statistics-chart-debug.png',
      fullPage: true
    });
    console.log('\nScreenshot saved to tests/visual/screenshots/statistics-chart-debug.png');
  } catch (e) {
    console.error('Test failed:', e.message);
  } finally {
    await browser.close();
  }
}

testChart();
