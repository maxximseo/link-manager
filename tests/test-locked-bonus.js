/**
 * Test script to verify locked bonus API and UI functionality
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3003';
const CREDENTIALS = {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
};

async function makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function main() {
    console.log('🧪 Testing Locked Bonus System\n');
    console.log('='.repeat(50));

    try {
        // 1. Login
        console.log('\n1️⃣  Logging in...');
        const loginResult = await makeRequest('POST', '/api/auth/login', CREDENTIALS);

        if (!loginResult.data.token) {
            console.error('❌ Login failed:', loginResult.data);
            process.exit(1);
        }
        console.log('✅ Login successful');
        const token = loginResult.data.token;

        // 2. Get balance with locked bonus fields
        console.log('\n2️⃣  Fetching balance with locked bonus info...');
        const balanceResult = await makeRequest('GET', '/api/billing/balance', null, token);

        if (balanceResult.status !== 200) {
            console.error('❌ Balance API failed:', balanceResult.data);
            process.exit(1);
        }

        const balanceData = balanceResult.data.data;
        console.log('✅ Balance API response:');
        console.log('   Balance:', balanceData.balance);
        console.log('   Total Spent:', balanceData.totalSpent);
        console.log('   Current Discount:', balanceData.currentDiscount + '%');
        console.log('   Locked Bonus:', balanceData.lockedBonus || 0);
        console.log('   Unlock Amount:', balanceData.unlockAmount || 'N/A');

        // 3. Check if locked bonus fields exist in response
        console.log('\n3️⃣  Checking locked bonus fields presence...');
        const hasLockedBonus = 'lockedBonus' in balanceData;
        const hasUnlockAmount = 'unlockAmount' in balanceData;

        console.log('   lockedBonus field present:', hasLockedBonus ? '✅ Yes' : '❌ No');
        console.log('   unlockAmount field present:', hasUnlockAmount ? '✅ Yes' : '❌ No');

        // 4. Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 SUMMARY');
        console.log('='.repeat(50));

        if (hasLockedBonus && hasUnlockAmount) {
            console.log('✅ Locked Bonus API is working correctly!');
            console.log('\nUI behavior based on current data:');
            if (parseFloat(balanceData.lockedBonus) > 0) {
                console.log('   • Locked bonus card WILL be displayed');
                console.log(`   • Shows: $${balanceData.lockedBonus} locked`);
                console.log(`   • Requires: $${balanceData.unlockAmount} deposit to unlock`);
            } else {
                console.log('   • Locked bonus card will be HIDDEN (no locked bonus)');
            }
        } else {
            console.log('❌ Locked Bonus API is missing required fields!');
            console.log('   Please check billing.service.js getUserBalance function');
        }

        console.log('\n');

    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        process.exit(1);
    }
}

main();
