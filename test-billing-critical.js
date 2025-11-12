/**
 * Critical Billing System Tests
 *
 * Tests 6 mandatory scenarios:
 * 1. Non-existent contentId → Error without charge
 * 2. Foreign contentId → Ownership error
 * 3. WordPress unavailable → ROLLBACK
 * 4. Exhausted content → Error exhausted
 * 5. Delete placement → Money refunded
 * 6. Legacy endpoint → 410 Gone
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3003';
const ADMIN_USER = { username: 'admin', password: 'admin123' };
const TEST_USER = { username: 'testuser', password: 'test123' };

let adminToken = '';
let testUserToken = '';
let testUserId = null;
let testProjectId = null;
let testSiteId = null;
let testLinkId = null;
let testArticleId = null;
let exhaustedArticleId = null;

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(emoji, message, data = '') {
  console.log(`${emoji} ${message}`, data);
}

function success(message, data = '') {
  console.log(`${colors.green}✅ ${message}${colors.reset}`, data);
}

function error(message, data = '') {
  console.log(`${colors.red}❌ ${message}${colors.reset}`, data);
}

function info(message, data = '') {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`, data);
}

async function api(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.error || err.message,
      status: err.response?.status,
      data: err.response?.data
    };
  }
}

async function login(username, password) {
  const result = await api('POST', '/api/auth/login', { username, password });
  if (!result.success) {
    throw new Error(`Login failed: ${result.error}`);
  }
  return result.data.token;
}

async function setupTestData() {
  log('🔧', 'Setting up test data...');

  // Login as admin
  adminToken = await login(ADMIN_USER.username, ADMIN_USER.password);
  success('Admin logged in');

  // Create test user if not exists
  const registerResult = await api('POST', '/api/auth/register', {
    username: TEST_USER.username,
    password: TEST_USER.password,
    email: 'test@example.com'
  });

  if (registerResult.success) {
    success('Test user created');
  } else {
    info('Test user already exists (or registration disabled)');
  }

  // Login as test user
  testUserToken = await login(TEST_USER.username, TEST_USER.password);
  success('Test user logged in');

  // Get test user ID
  const balanceResult = await api('GET', '/api/billing/balance', null, testUserToken);
  // We need to get user ID from somewhere - let's use projects

  // Add balance to test user ($1000)
  const depositResult = await api('POST', '/api/billing/deposit', {
    amount: 1000,
    description: 'Test balance'
  }, testUserToken);

  if (depositResult.success) {
    success('Added $1000 to test user balance');
  }

  // Create test project
  const projectResult = await api('POST', '/api/projects', {
    name: 'Test Project for Billing Tests',
    description: 'Automated test project'
  }, testUserToken);

  if (projectResult.success) {
    testProjectId = projectResult.data.data.id;
    success(`Created test project #${testProjectId}`);
  }

  // Create test site
  const siteResult = await api('POST', '/api/sites', {
    site_name: 'Test Site',
    site_url: 'https://example.com',
    api_key: 'test-api-key-' + Date.now(),
    max_links: 10,
    max_articles: 10
  }, testUserToken);

  if (siteResult.success) {
    testSiteId = siteResult.data.data.id;
    success(`Created test site #${testSiteId}`);
  }

  // Create test link
  const linkResult = await api('POST', `/api/projects/${testProjectId}/links`, {
    anchor_text: 'Test Link',
    target_url: 'https://example.com/test',
    usage_limit: 999
  }, testUserToken);

  if (linkResult.success) {
    testLinkId = linkResult.data.data.id;
    success(`Created test link #${testLinkId}`);
  }

  // Create test article
  const articleResult = await api('POST', `/api/projects/${testProjectId}/articles`, {
    title: 'Test Article',
    content: 'Test content',
    usage_limit: 1
  }, testUserToken);

  if (articleResult.success) {
    testArticleId = articleResult.data.data.id;
    success(`Created test article #${testArticleId}`);
  }

  // Create exhausted article
  const exhaustedResult = await api('POST', `/api/projects/${testProjectId}/articles`, {
    title: 'Exhausted Article',
    content: 'This article should be exhausted',
    usage_limit: 1
  }, testUserToken);

  if (exhaustedResult.success) {
    exhaustedArticleId = exhaustedResult.data.data.id;
    success(`Created exhausted article #${exhaustedArticleId}`);

    // Mark it as exhausted by using it
    // Note: We'll need to manually update the database for this
    info('Note: Exhausted article needs manual DB update');
  }

  log('✅', 'Test data setup complete\n');
}

// TEST 1: Non-existent contentId → Error without charge
async function test1_NonExistentContentId() {
  log('🧪', '═══════════════════════════════════════════════');
  log('🧪', 'TEST 1: Non-existent contentId → Error without charge');
  log('🧪', '═══════════════════════════════════════════════');

  // Get balance before
  const balanceBefore = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAmount = balanceBefore.data.data.balance;

  info(`Balance before: $${balanceAmount}`);

  // Try to purchase with non-existent contentId (999999)
  const purchaseResult = await api('POST', '/api/billing/purchase', {
    projectId: testProjectId,
    siteId: testSiteId,
    type: 'link',
    contentIds: [999999], // Non-existent ID
    autoRenewal: false
  }, testUserToken);

  // Should fail
  if (!purchaseResult.success) {
    success('Purchase failed as expected');
    info(`Error: ${purchaseResult.error}`);
  } else {
    error('Purchase should have failed but succeeded!');
    return false;
  }

  // Get balance after
  const balanceAfter = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAfterAmount = balanceAfter.data.data.balance;

  info(`Balance after: $${balanceAfterAmount}`);

  // Balance should be unchanged
  if (balanceAmount === balanceAfterAmount) {
    success('✅ TEST 1 PASSED: Balance unchanged, no charge for invalid contentId');
    return true;
  } else {
    error('❌ TEST 1 FAILED: Balance changed! Money was charged despite error');
    return false;
  }
}

// TEST 2: Foreign contentId → Ownership error
async function test2_ForeignContentId() {
  log('\n🧪', '═══════════════════════════════════════════════');
  log('🧪', 'TEST 2: Foreign contentId → Ownership error');
  log('🧪', '═══════════════════════════════════════════════');

  // Login as admin and create admin's link
  const adminProjectResult = await api('POST', '/api/projects', {
    name: 'Admin Project',
    description: 'Admin project for ownership test'
  }, adminToken);

  let adminProjectId, adminLinkId;

  if (adminProjectResult.success) {
    adminProjectId = adminProjectResult.data.data.id;

    const adminLinkResult = await api('POST', `/api/projects/${adminProjectId}/links`, {
      anchor_text: 'Admin Link',
      target_url: 'https://example.com/admin',
      usage_limit: 999
    }, adminToken);

    if (adminLinkResult.success) {
      adminLinkId = adminLinkResult.data.data.id;
      success(`Created admin link #${adminLinkId}`);
    }
  }

  // Get test user balance before
  const balanceBefore = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAmount = balanceBefore.data.data.balance;

  info(`Test user balance before: $${balanceAmount}`);

  // Try to purchase with admin's link ID (ownership violation)
  const purchaseResult = await api('POST', '/api/billing/purchase', {
    projectId: testProjectId,
    siteId: testSiteId,
    type: 'link',
    contentIds: [adminLinkId], // Admin's link ID
    autoRenewal: false
  }, testUserToken);

  // Should fail with ownership error
  if (!purchaseResult.success) {
    const errorMsg = purchaseResult.error.toLowerCase();
    if (errorMsg.includes('ownership') || errorMsg.includes('unauthorized') || errorMsg.includes('not found')) {
      success('Purchase failed with ownership error as expected');
      info(`Error: ${purchaseResult.error}`);
    } else {
      error(`Purchase failed but with unexpected error: ${purchaseResult.error}`);
      return false;
    }
  } else {
    error('Purchase should have failed but succeeded!');
    return false;
  }

  // Get balance after
  const balanceAfter = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAfterAmount = balanceAfter.data.data.balance;

  // Balance should be unchanged
  if (balanceAmount === balanceAfterAmount) {
    success('✅ TEST 2 PASSED: Ownership validated, no charge for foreign contentId');
    return true;
  } else {
    error('❌ TEST 2 FAILED: Balance changed despite ownership error');
    return false;
  }
}

// TEST 3: WordPress unavailable → ROLLBACK
async function test3_WordPressUnavailable() {
  log('\n🧪', '═══════════════════════════════════════════════');
  log('🧪', 'TEST 3: WordPress unavailable → ROLLBACK');
  log('🧪', '═══════════════════════════════════════════════');

  // Create a site with invalid API endpoint
  const badSiteResult = await api('POST', '/api/sites', {
    site_name: 'Bad Site (invalid endpoint)',
    site_url: 'https://nonexistent-domain-12345.com',
    api_key: 'invalid-key',
    max_links: 10,
    max_articles: 10
  }, testUserToken);

  let badSiteId;
  if (badSiteResult.success) {
    badSiteId = badSiteResult.data.data.id;
    success(`Created bad site #${badSiteId}`);
  }

  // Get balance before
  const balanceBefore = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAmount = balanceBefore.data.data.balance;

  info(`Balance before: $${balanceAmount}`);

  // Try to purchase - WordPress will fail
  const purchaseResult = await api('POST', '/api/billing/purchase', {
    projectId: testProjectId,
    siteId: badSiteId,
    type: 'article',
    contentIds: [testArticleId],
    autoRenewal: false
  }, testUserToken);

  // Check balance after
  const balanceAfter = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAfterAmount = balanceAfter.data.data.balance;

  info(`Balance after: $${balanceAfterAmount}`);

  // If purchase failed, balance should be unchanged (rollback worked)
  if (!purchaseResult.success) {
    if (balanceAmount === balanceAfterAmount) {
      success('✅ TEST 3 PASSED: Transaction rolled back, no charge on WordPress failure');
      return true;
    } else {
      error('❌ TEST 3 FAILED: Balance changed but purchase failed (no rollback!)');
      return false;
    }
  } else {
    // If purchase succeeded, check if placement status is 'failed'
    const placementId = purchaseResult.data.data.placement.id;
    info(`Purchase succeeded with placement #${placementId}, checking status...`);

    // Money was charged but placement may be marked as 'failed'
    // This is acceptable IF there's a refund mechanism
    if (balanceAmount !== balanceAfterAmount) {
      error('⚠️  TEST 3 WARNING: Money charged even though WordPress failed');
      error('Transaction should ROLLBACK on WordPress failure');
      return false;
    }

    success('✅ TEST 3 PASSED: Transaction handled correctly');
    return true;
  }
}

// TEST 4: Exhausted content → Error exhausted
async function test4_ExhaustedContent() {
  log('\n🧪', '═══════════════════════════════════════════════');
  log('🧪', 'TEST 4: Exhausted content → Error exhausted');
  log('🧪', '═══════════════════════════════════════════════');

  info('Note: This test requires exhaustedArticleId to be manually set to exhausted in DB');
  info('Skipping for now - manual intervention required');

  // Get balance before
  const balanceBefore = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAmount = balanceBefore.data.data.balance;

  // Try to purchase with exhausted content
  const purchaseResult = await api('POST', '/api/billing/purchase', {
    projectId: testProjectId,
    siteId: testSiteId,
    type: 'article',
    contentIds: [exhaustedArticleId],
    autoRenewal: false
  }, testUserToken);

  // Check balance after
  const balanceAfter = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAfterAmount = balanceAfter.data.data.balance;

  if (!purchaseResult.success) {
    const errorMsg = purchaseResult.error.toLowerCase();
    if (errorMsg.includes('exhaust') || errorMsg.includes('limit') || errorMsg.includes('used')) {
      if (balanceAmount === balanceAfterAmount) {
        success('✅ TEST 4 PASSED: Exhausted content rejected, no charge');
        return true;
      }
    }
  }

  error('⚠️  TEST 4 INCOMPLETE: Exhausted validation not fully implemented');
  return false;
}

// TEST 5: Delete placement → Money refunded
async function test5_PlacementDeletion() {
  log('\n🧪', '═══════════════════════════════════════════════');
  log('🧪', 'TEST 5: Delete placement → Money refunded');
  log('🧪', '═══════════════════════════════════════════════');

  // Get balance before
  const balanceBefore = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAmount = balanceBefore.data.data.balance;

  info(`Balance before purchase: $${balanceAmount}`);

  // Purchase a placement
  const purchaseResult = await api('POST', '/api/billing/purchase', {
    projectId: testProjectId,
    siteId: testSiteId,
    type: 'link',
    contentIds: [testLinkId],
    autoRenewal: false
  }, testUserToken);

  if (!purchaseResult.success) {
    error(`Failed to create test placement: ${purchaseResult.error}`);
    return false;
  }

  const placementId = purchaseResult.data.data.placement.id;
  const pricePaid = purchaseResult.data.data.placement.final_price;

  success(`Created placement #${placementId}, paid $${pricePaid}`);

  // Get balance after purchase
  const balanceAfterPurchase = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAfterPurchaseAmount = balanceAfterPurchase.data.data.balance;

  info(`Balance after purchase: $${balanceAfterPurchaseAmount}`);

  // Delete placement
  const deleteResult = await api('DELETE', `/api/placements/${placementId}`, null, testUserToken);

  if (!deleteResult.success) {
    error(`Failed to delete placement: ${deleteResult.error}`);
    return false;
  }

  success('Placement deleted');

  // Get balance after deletion
  const balanceAfterDelete = await api('GET', '/api/billing/balance', null, testUserToken);
  const balanceAfterDeleteAmount = balanceAfterDelete.data.data.balance;

  info(`Balance after deletion: $${balanceAfterDeleteAmount}`);

  // Check if money was refunded
  const expectedBalance = parseFloat(balanceAfterPurchaseAmount) + parseFloat(pricePaid);
  const actualBalance = parseFloat(balanceAfterDeleteAmount);

  if (Math.abs(actualBalance - expectedBalance) < 0.01) {
    success('✅ TEST 5 PASSED: Money refunded on placement deletion');
    return true;
  } else {
    error('❌ TEST 5 FAILED: Money NOT refunded on placement deletion');
    error(`Expected: $${expectedBalance.toFixed(2)}, Got: $${actualBalance.toFixed(2)}`);
    return false;
  }
}

// TEST 6: Legacy endpoint → 410 Gone
async function test6_LegacyEndpoint() {
  log('\n🧪', '═══════════════════════════════════════════════');
  log('🧪', 'TEST 6: Legacy endpoint → 410 Gone');
  log('🧪', '═══════════════════════════════════════════════');

  // Try to access old placement creation endpoint
  const legacyResult = await api('POST', '/api/placements', {
    project_id: testProjectId,
    site_id: testSiteId,
    link_ids: [testLinkId]
  }, testUserToken);

  if (legacyResult.status === 410) {
    success('✅ TEST 6 PASSED: Legacy endpoint returns 410 Gone');
    info(`Message: ${legacyResult.error}`);
    return true;
  } else if (!legacyResult.success && legacyResult.status === 404) {
    error('⚠️  TEST 6 WARNING: Endpoint returns 404, should return 410 Gone');
    return false;
  } else if (legacyResult.success) {
    error('❌ TEST 6 FAILED: Legacy endpoint still works! Should be deprecated with 410');
    return false;
  } else {
    error(`⚠️  TEST 6 UNEXPECTED: Status ${legacyResult.status}`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 CRITICAL BILLING SYSTEM TESTS');
  console.log('='.repeat(60) + '\n');

  try {
    await setupTestData();

    const results = {
      test1: await test1_NonExistentContentId(),
      test2: await test2_ForeignContentId(),
      test3: await test3_WordPressUnavailable(),
      test4: await test4_ExhaustedContent(),
      test5: await test5_PlacementDeletion(),
      test6: await test6_LegacyEndpoint()
    };

    // Summary
    log('\n📊', '═══════════════════════════════════════════════');
    log('📊', 'TEST SUMMARY');
    log('📊', '═══════════════════════════════════════════════\n');

    const passed = Object.values(results).filter(r => r === true).length;
    const failed = Object.values(results).filter(r => r === false).length;

    console.log(`✅ Test 1: Non-existent contentId      ${results.test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`✅ Test 2: Foreign contentId           ${results.test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`✅ Test 3: WordPress ROLLBACK          ${results.test3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`✅ Test 4: Exhausted content           ${results.test4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`✅ Test 5: Refund on deletion          ${results.test5 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`✅ Test 6: Legacy endpoint 410         ${results.test6 ? '✅ PASS' : '❌ FAIL'}`);

    console.log(`\n${colors.blue}Total: ${passed}/6 passed${colors.reset}`);

    if (passed === 6) {
      console.log(`\n${colors.green}🎉 ALL TESTS PASSED!${colors.reset}\n`);
    } else {
      console.log(`\n${colors.red}⚠️  ${failed} tests failed${colors.reset}\n`);
    }

  } catch (err) {
    error('Test suite failed with error:', err.message);
    console.error(err);
  }
}

// Run tests
runAllTests();
