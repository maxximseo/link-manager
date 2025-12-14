/**
 * Promo Codes API Test
 */

async function test() {
  const BASE = 'http://localhost:3003';

  // Login
  console.log('=== PROMO CODES API TESTS ===\n');

  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'maximator', password: 'MaxPass123!' })
  });
  const loginData = await loginRes.json();
  console.log('1. Login:', loginData.token ? 'SUCCESS' : 'FAILED ' + (loginData.error || ''));
  if (!loginData.token) {
    console.log('Cannot continue without token');
    return;
  }

  const TOKEN = loginData.token;

  // Test 1: List promo codes
  console.log('\n2. List promo codes (GET /api/promo)');
  const listRes = await fetch(BASE + '/api/promo', {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  const listData = await listRes.json();
  console.log('   Status:', listRes.status);
  console.log('   Success:', listData.success);
  console.log('   Count:', listData.data ? listData.data.length : 0);

  // Test 2: Create promo code
  const testCode = 'TEST' + Date.now();
  console.log('\n3. Create promo code:', testCode);
  const createRes = await fetch(BASE + '/api/promo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({
      code: testCode,
      ownerUserId: null,
      bonusAmount: 100,
      partnerReward: 50,
      minDeposit: 100,
      maxUses: 5,
      expiresAt: null
    })
  });
  const createData = await createRes.json();
  console.log('   Status:', createRes.status);
  console.log('   Success:', createData.success);
  const promoId = createData.data ? createData.data.id : null;
  console.log('   Created ID:', promoId);

  // Test 3: Validate promo code
  console.log('\n4. Validate promo code:', testCode);
  const validateRes = await fetch(BASE + '/api/promo/validate?code=' + testCode, {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  const validateData = await validateRes.json();
  console.log('   Status:', validateRes.status);
  console.log('   Valid:', validateData.valid);
  if (validateData.promo) {
    console.log('   Bonus:', validateData.promo.bonusAmount);
    console.log('   MinDeposit:', validateData.promo.minDeposit);
  }
  if (validateData.error) {
    console.log('   Note:', validateData.error);
  }

  // Test 4: Validate invalid code
  console.log('\n5. Validate INVALID code: INVALID_XYZ');
  const invalidRes = await fetch(BASE + '/api/promo/validate?code=INVALID_XYZ', {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  const invalidData = await invalidRes.json();
  console.log('   Status:', invalidRes.status);
  console.log('   Valid:', invalidData.valid);
  console.log('   Error:', invalidData.error);

  // Test 5: Deactivate promo code
  if (promoId) {
    console.log('\n6. Deactivate promo code ID:', promoId);
    const deactivateRes = await fetch(BASE + '/api/promo/' + promoId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    const deactivateData = await deactivateRes.json();
    console.log('   Status:', deactivateRes.status);
    console.log('   Success:', deactivateData.success);

    // Verify deactivated
    console.log('\n7. Verify deactivation');
    const verifyRes = await fetch(BASE + '/api/promo/validate?code=' + testCode, {
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    const verifyData = await verifyRes.json();
    console.log('   Valid after deactivation:', verifyData.valid);
    console.log('   Error:', verifyData.error);
  }

  // Test 6: Balance API
  console.log('\n8. Balance API (check referralBonusReceived field)');
  const balanceRes = await fetch(BASE + '/api/billing/balance', {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  const balanceData = await balanceRes.json();
  console.log('   Status:', balanceRes.status);
  if (balanceData.data) {
    console.log('   Balance:', balanceData.data.balance);
    console.log('   Referral Bonus Received:', balanceData.data.referralBonusReceived);
  }

  console.log('\n=== ALL TESTS COMPLETE ===');
}

test().catch(err => console.error('Test error:', err));
