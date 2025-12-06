#!/usr/bin/env node
/**
 * Browser Testing for Price Editing Features
 * Uses Puppeteer to test inline editing and bulk price updates
 */

const puppeteer = require('puppeteer');

async function testPriceEditing() {
    console.log('\n🌐 Starting browser testing...\n');

    const browser = await puppeteer.launch({
        headless: false, // Show browser for debugging
        devtools: true,  // Open DevTools automatically
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Listen to console messages from the page
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        console.log(`[Browser ${type}]:`, text);
    });

    // Listen to page errors
    page.on('pageerror', error => {
        console.error('❌ [Browser Error]:', error.message);
    });

    // Listen to failed requests
    page.on('requestfailed', request => {
        console.error('❌ [Failed Request]:', request.url(), request.failure().errorText);
    });

    try {
        console.log('1️⃣ Navigating to login page...');
        await page.goto('http://localhost:3003/login.html', { waitUntil: 'networkidle2' });

        console.log('2️⃣ Logging in...');
        await page.type('#username', 'maximator');
        await page.type('#password', '*8NKDb6fXXLVu1h*');
        await page.click('button[type="submit"]');

        // Wait for navigation after login
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('✅ Logged in successfully');

        console.log('3️⃣ Navigating to sites page...');
        await page.goto('http://localhost:3003/sites.html', { waitUntil: 'networkidle2' });
        console.log('✅ Sites page loaded');

        // Wait for sites table to load
        await page.waitForSelector('#sitesTableBody', { timeout: 10000 });
        console.log('✅ Sites table rendered');

        // Check if price cells exist
        const priceCells = await page.$$('.price-cell');
        console.log(`\n📊 Found ${priceCells.length} price cells`);

        if (priceCells.length === 0) {
            console.error('❌ No price cells found! Table may not have rendered correctly.');
            await page.screenshot({ path: '/tmp/no-price-cells.png', fullPage: true });
            console.log('📸 Screenshot saved to /tmp/no-price-cells.png');
            await browser.close();
            return;
        }

        // Get first price cell details
        const firstCellInfo = await page.evaluate(() => {
            const cell = document.querySelector('.price-cell');
            if (!cell) return null;

            return {
                siteId: cell.dataset.siteId,
                field: cell.dataset.field,
                hasDoubleClickListener: cell.ondblclick !== null,
                innerHTML: cell.innerHTML.substring(0, 100)
            };
        });

        console.log('\n🔍 First price cell info:', JSON.stringify(firstCellInfo, null, 2));

        // Test 1: Check if event listeners are attached
        console.log('\n4️⃣ Testing event delegation...');
        const hasTableListener = await page.evaluate(() => {
            const tbody = document.getElementById('sitesTableBody');
            // Check if event listeners exist (we can't directly access them, so we'll test by triggering)
            return tbody !== null;
        });
        console.log(`Event delegation check: ${hasTableListener ? '✅' : '❌'}`);

        // Test 2: Simulate double-click on first price cell
        console.log('\n5️⃣ Simulating double-click on first price cell...');

        await page.evaluate(() => {
            const cell = document.querySelector('.price-cell');
            if (cell) {
                const event = new MouseEvent('dblclick', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                cell.dispatchEvent(event);
                console.log('🖱️ Double-click event dispatched to cell');
            } else {
                console.error('❌ No price cell found to click');
            }
        });

        // Wait a bit for the edit mode to activate
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if input appeared
        const hasInput = await page.evaluate(() => {
            const input = document.querySelector('.price-input');
            return input !== null;
        });

        console.log(`Inline editing activated: ${hasInput ? '✅' : '❌'}`);

        if (!hasInput) {
            console.error('\n❌ PROBLEM: Double-click did NOT activate inline editing!');
            console.log('Checking if enablePriceEdit function exists...');

            const functionCheck = await page.evaluate(() => {
                return {
                    enablePriceEditExists: typeof enablePriceEdit === 'function',
                    showBulkPriceModalExists: typeof showBulkPriceModal === 'function',
                    sitesArrayExists: typeof sites !== 'undefined',
                    sitesCount: typeof sites !== 'undefined' ? sites.length : 0
                };
            });

            console.log('Function check:', JSON.stringify(functionCheck, null, 2));
        } else {
            console.log('\n✅ SUCCESS: Inline editing is working!');

            // Get input details
            const inputInfo = await page.evaluate(() => {
                const input = document.querySelector('.price-input');
                return {
                    value: input.value,
                    placeholder: input.placeholder,
                    visible: window.getComputedStyle(input).display !== 'none'
                };
            });
            console.log('Input field info:', JSON.stringify(inputInfo, null, 2));
        }

        // Test 3: Check bulk price buttons
        console.log('\n6️⃣ Checking bulk price buttons...');
        const bulkButtons = await page.$$('.bulk-price-btn');
        console.log(`Found ${bulkButtons.length} bulk price buttons`);

        if (bulkButtons.length > 0) {
            console.log('Testing first bulk price button click...');

            await page.evaluate(() => {
                const btn = document.querySelector('.bulk-price-btn');
                if (btn) {
                    btn.click();
                    console.log('🖱️ Bulk price button clicked');
                }
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const modalVisible = await page.evaluate(() => {
                const modal = document.getElementById('bulkPriceModal');
                return modal && modal.classList.contains('show');
            });

            console.log(`Bulk price modal opened: ${modalVisible ? '✅' : '❌'}`);
        }

        // Take final screenshot
        await page.screenshot({ path: '/tmp/sites-page-test.png', fullPage: true });
        console.log('\n📸 Final screenshot saved to /tmp/sites-page-test.png');

        console.log('\n⏸️ Keeping browser open for 30 seconds for manual inspection...');
        await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);

        await page.screenshot({ path: '/tmp/error-screenshot.png', fullPage: true });
        console.log('📸 Error screenshot saved to /tmp/error-screenshot.png');
    } finally {
        await browser.close();
        console.log('\n✅ Browser closed');
    }
}

testPriceEditing().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
