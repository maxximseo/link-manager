/**
 * Puppeteer test for Notification UI design verification
 * Compares the notification dropdown with the target design
 */

const puppeteer = require('puppeteer');

async function testNotificationUI() {
    console.log('Starting Puppeteer test for notification UI...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        // Navigate to login page
        console.log('1. Navigating to login page...');
        await page.goto('http://localhost:3003/login.html', { waitUntil: 'networkidle0' });

        // Login as admin with correct credentials
        console.log('2. Logging in as maximator...');
        await page.type('#username', 'maximator');
        await page.type('#password', '*8NKDb6fXXLVu1h*');
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // Wait for navbar to load
        console.log('3. Waiting for navbar to load...');
        await page.waitForSelector('#notificationsDropdown', { timeout: 10000 });

        // Click on notification bell to open dropdown
        console.log('4. Opening notification dropdown...');
        await page.click('#notificationsDropdown');

        // Wait for dropdown to be visible
        await page.waitForSelector('.notification-dropdown', { visible: true, timeout: 5000 });

        // Wait for notifications to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get dropdown element for screenshot
        const dropdown = await page.$('.notification-dropdown');

        if (dropdown) {
            // Take screenshot of the dropdown
            console.log('5. Taking screenshot of notification dropdown...');
            await dropdown.screenshot({
                path: '/tmp/notification-ui-test.png',
                type: 'png'
            });
            console.log('   Screenshot saved to: /tmp/notification-ui-test.png');
        } else {
            console.log('   ⚠️ Could not find dropdown element, taking full page screenshot...');
            await page.screenshot({
                path: '/tmp/notification-ui-test.png',
                type: 'png'
            });
        }

        // Verify key elements exist
        console.log('\n6. Verifying UI elements...\n');

        const checks = [
            // Header
            {
                name: 'Header title "Уведомления"',
                selector: '.notification-header h6',
                expected: true
            },
            {
                name: '"Отметить все как прочитанные" link',
                selector: '.notification-header .mark-all-read',
                expected: true
            },
            // Footer
            {
                name: '"Показать все уведомления" footer link',
                selector: '.notification-footer a',
                expected: true
            },
            // Notification cards structure
            {
                name: 'Notification card container',
                selector: '.notification-card',
                expected: true
            },
            {
                name: 'Notification icon in circle',
                selector: '.notification-icon',
                expected: true
            },
            {
                name: 'Notification title',
                selector: '.notification-title',
                expected: true
            },
            {
                name: 'Notification time with clock icon',
                selector: '.notification-time',
                expected: true
            },
            {
                name: 'Clock icon in time',
                selector: '.notification-time i.bi-clock',
                expected: true
            },
            {
                name: 'Notification message',
                selector: '.notification-message',
                expected: true
            }
        ];

        let allPassed = true;
        for (const check of checks) {
            const element = await page.$(check.selector);
            const exists = !!element;
            const status = exists === check.expected ? '✅' : '❌';
            console.log(`   ${status} ${check.name}`);
            if (exists !== check.expected) allPassed = false;
        }

        // Verify CSS styles
        console.log('\n7. Verifying CSS styles...\n');

        const styleChecks = await page.evaluate(() => {
            const results = [];

            // Check dropdown styling
            const dropdown = document.querySelector('.notification-dropdown');
            if (dropdown) {
                const dropdownStyle = getComputedStyle(dropdown);
                results.push({
                    name: 'Dropdown border-radius',
                    value: dropdownStyle.borderRadius,
                    expected: '16px'
                });
                results.push({
                    name: 'Dropdown min-width',
                    value: dropdownStyle.minWidth,
                    expected: '400px'
                });
            }

            // Check notification card styling
            const card = document.querySelector('.notification-card');
            if (card) {
                const cardStyle = getComputedStyle(card);
                results.push({
                    name: 'Card border-left-width',
                    value: cardStyle.borderLeftWidth,
                    expected: '4px'
                });
                results.push({
                    name: 'Card border-radius',
                    value: cardStyle.borderRadius,
                    expected: '12px'
                });
            }

            // Check notification icon styling
            const icon = document.querySelector('.notification-icon');
            if (icon) {
                const iconStyle = getComputedStyle(icon);
                results.push({
                    name: 'Icon width',
                    value: iconStyle.width,
                    expected: '44px'
                });
                results.push({
                    name: 'Icon border-radius (circle)',
                    value: iconStyle.borderRadius,
                    expected: '50%'
                });
            }

            // Check time styling
            const time = document.querySelector('.notification-time');
            if (time) {
                const timeStyle = getComputedStyle(time);
                results.push({
                    name: 'Time display',
                    value: timeStyle.display,
                    expected: 'inline-flex'
                });
            }

            return results;
        });

        for (const check of styleChecks) {
            const match = check.value === check.expected ||
                          (check.expected === '50%' && check.value.includes('50')) ||
                          (check.expected === '16px' && check.value.includes('16'));
            const status = match ? '✅' : '⚠️';
            console.log(`   ${status} ${check.name}: ${check.value} (expected: ${check.expected})`);
        }

        // Check for colored backgrounds on type cards
        console.log('\n8. Verifying notification type colors...\n');

        const colorChecks = await page.evaluate(() => {
            const results = [];
            const types = ['warning', 'error', 'success', 'info'];

            types.forEach(type => {
                const card = document.querySelector(`.notification-card.type-${type}`);
                if (card) {
                    const style = getComputedStyle(card);
                    results.push({
                        type,
                        borderColor: style.borderLeftColor,
                        hasGradient: style.background.includes('gradient') || style.backgroundImage.includes('gradient')
                    });
                }
            });

            return results;
        });

        if (colorChecks.length > 0) {
            for (const check of colorChecks) {
                const gradientStatus = check.hasGradient ? '✅' : '⚠️';
                console.log(`   ✅ type-${check.type}: border=${check.borderColor}`);
                console.log(`      ${gradientStatus} Has gradient background: ${check.hasGradient}`);
            }
        } else {
            console.log('   ℹ️ No notification cards with type classes found (may be empty or different types)');
        }

        // Verify footer text
        console.log('\n9. Verifying footer text...\n');
        const footerText = await page.evaluate(() => {
            const footer = document.querySelector('.notification-footer a');
            return footer ? footer.textContent.trim() : null;
        });

        if (footerText === 'Показать все уведомления') {
            console.log('   ✅ Footer text is correct: "Показать все уведомления"');
        } else {
            console.log(`   ⚠️ Footer text: "${footerText}" (expected: "Показать все уведомления")`);
        }

        // Final result
        console.log('\n' + '='.repeat(60));
        if (allPassed) {
            console.log('✅ All UI element checks PASSED!');
        } else {
            console.log('❌ Some UI element checks FAILED');
        }
        console.log('='.repeat(60));
        console.log('\nScreenshot saved at: /tmp/notification-ui-test.png');
        console.log('Compare with target design at: /tmp/notification-design.jpeg\n');

    } catch (error) {
        console.error('Error during test:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

testNotificationUI().catch(console.error);
