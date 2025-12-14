/**
 * Test statistics page functionality
 */
const puppeteer = require('puppeteer');

const CONFIG = {
    baseUrl: 'http://localhost:3003',
    credentials: {
        username: 'maximator',
        password: '*8NKDb6fXXLVu1h*'
    }
};

async function testStatistics() {
    console.log('='.repeat(60));
    console.log('STATISTICS PAGE TEST');
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
        // Login first via API
        console.log('\n1. Logging in via API...');
        // Go to any page first to enable fetch
        await page.goto(`${CONFIG.baseUrl}/statistics.html`, { waitUntil: 'networkidle0' });

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

        // Go to statistics
        console.log('\n2. Opening statistics page...');
        await page.goto(`${CONFIG.baseUrl}/statistics.html`, { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 3000));

        // Check if page loaded properly
        const pageTitle = await page.title();
        console.log('   Page title:', pageTitle);

        // Check for period buttons
        const periodBtns = await page.$$('.stats-period-btn');
        console.log('   Period buttons found:', periodBtns.length);

        // Check for spending cards
        const spendingCards = await page.$$('.stats-spending-card');
        console.log('   Spending cards found:', spendingCards.length);

        // Check balance values
        const currentBalance = await page.$eval('#currentBalance', el => el.textContent).catch(() => 'NOT FOUND');
        console.log('   Current balance:', currentBalance);

        const totalSpent = await page.$eval('#totalSpent', el => el.textContent).catch(() => 'NOT FOUND');
        console.log('   Total spent:', totalSpent);

        // Check chart canvases
        const chartCanvas = await page.$$('canvas');
        console.log('   Chart canvases found:', chartCanvas.length);

        // Test clicking on period button
        console.log('\n3. Testing period button click (Day)...');
        try {
            await page.click('.stats-period-btn[data-period="day"]');
            await new Promise(r => setTimeout(r, 1000));

            // Check if button got active class
            const dayBtnActive = await page.$('.stats-period-btn[data-period="day"].active');
            console.log('   Day button active:', dayBtnActive !== null);

            const dayCardActive = await page.$('.stats-spending-card[data-period="day"].active');
            console.log('   Day card active:', dayCardActive !== null);
        } catch (e) {
            console.log('   Error clicking period button:', e.message);
        }

        // Test clicking on spending card
        console.log('\n4. Testing spending card click (Month)...');
        try {
            await page.click('.stats-spending-card[data-period="month"]');
            await new Promise(r => setTimeout(r, 1000));

            const monthBtnActive = await page.$('.stats-period-btn[data-period="month"].active');
            console.log('   Month button active:', monthBtnActive !== null);

            const monthCardActive = await page.$('.stats-spending-card[data-period="month"].active');
            console.log('   Month card active:', monthCardActive !== null);
        } catch (e) {
            console.log('   Error clicking spending card:', e.message);
        }

        // Take screenshot
        await page.screenshot({ path: 'tests/visual/screenshots/statistics-test.png', fullPage: true });
        console.log('\n5. Screenshot saved to tests/visual/screenshots/statistics-test.png');

        // Report errors
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

testStatistics();
