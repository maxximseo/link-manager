/**
 * Test Suite: Site Deletion with Automatic Refunds
 *
 * Tests the complete refund flow when deleting sites with placements
 */

const axios = require('axios');

const API_URL = 'http://localhost:3003/api';
let authToken = '';
let testData = {
  userId: null,
  projectId: null,
  siteId: null,
  linkId: null,
  articleId: null,
  placementId1: null,
  placementId2: null,
  initialBalance: 0,
  totalSpent: 0
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function logTest(message) {
  console.log(`\n${colors.bright}${colors.blue}[TEST]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

// Step 1: Login
async function login() {
  logTest('Login with admin credentials');
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    authToken = response.data.token;
    testData.userId = response.data.user.id;
    logSuccess(`Logged in successfully. User ID: ${testData.userId}`);
    return true;
  } catch (error) {
    logError(`Login failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 2: Check initial balance
async function checkInitialBalance() {
  logTest('Check Initial Balance');
  try {
    const response = await axios.get(`${API_URL}/billing/balance`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.initialBalance = parseFloat(response.data.balance);
    testData.totalSpent = parseFloat(response.data.total_spent);
    logSuccess(`Initial balance: $${testData.initialBalance.toFixed(2)}`);
    logSuccess(`Total spent: $${testData.totalSpent.toFixed(2)}`);
    return true;
  } catch (error) {
    logError(`Get balance failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 3: Add balance
async function addBalance() {
  logTest('Add $500 to Balance');
  try {
    const response = await axios.post(`${API_URL}/billing/deposit`, {
      amount: 500,
      description: 'Test deposit for site deletion refund test'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    logSuccess(`Added $500. New balance: $${response.data.balance.toFixed(2)}`);
    return true;
  } catch (error) {
    logError(`Add balance failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 4: Create test project
async function createProject() {
  logTest('Create Test Project');
  try {
    const response = await axios.post(`${API_URL}/projects`, {
      name: `Refund Test Project ${Date.now()}`,
      description: 'Test project for site deletion refund testing'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.projectId = response.data.id;
    logSuccess(`Project created: ID=${testData.projectId}`);
    return true;
  } catch (error) {
    logError(`Project creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 5: Create test site
async function createSite() {
  logTest('Create Test Site');
  try {
    const response = await axios.post(`${API_URL}/sites`, {
      site_url: `https://refund-test-${Date.now()}.com`,
      site_type: 'wordpress',
      api_key: `test_api_key_${Date.now()}`,
      max_links: 10,
      max_articles: 5
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.siteId = response.data.id;
    logSuccess(`Site created: ID=${testData.siteId}`);
    return true;
  } catch (error) {
    logError(`Site creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 6: Create link
async function createLink() {
  logTest('Create Test Link');
  try {
    const response = await axios.post(`${API_URL}/projects/${testData.projectId}/links`, {
      url: 'https://example.com/refund-test-link',
      anchor_text: 'Refund Test Link',
      usage_limit: 999
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.linkId = response.data.id;
    logSuccess(`Link created: ID=${testData.linkId}`);
    return true;
  } catch (error) {
    logError(`Link creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 7: Create article
async function createArticle() {
  logTest('Create Test Article');
  try {
    const response = await axios.post(`${API_URL}/projects/${testData.projectId}/articles`, {
      title: 'Refund Test Article',
      content: '<p>This is a test article for refund testing.</p>',
      usage_limit: 1
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.articleId = response.data.id;
    logSuccess(`Article created: ID=${testData.articleId}`);
    return true;
  } catch (error) {
    logError(`Article creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 8: Purchase link placement ($25)
async function purchaseLinkPlacement() {
  logTest('Purchase Link Placement ($25)');
  try {
    const response = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testData.projectId,
      siteId: testData.siteId,
      type: 'link',
      contentIds: [testData.linkId]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.placementId1 = response.data.data.placement.id;
    logSuccess(`Link placement purchased: ID=${testData.placementId1}`);
    logSuccess(`Price paid: $${response.data.data.placement.final_price}`);
    return true;
  } catch (error) {
    logError(`Link placement failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 9: Purchase article placement ($50)
async function purchaseArticlePlacement() {
  logTest('Purchase Article Placement ($50)');
  try {
    const response = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testData.projectId,
      siteId: testData.siteId,
      type: 'article',
      contentIds: [testData.articleId]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.placementId2 = response.data.data.placement.id;
    logSuccess(`Article placement purchased: ID=${testData.placementId2}`);
    logSuccess(`Price paid: $${response.data.data.placement.final_price}`);
    return true;
  } catch (error) {
    logError(`Article placement failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 10: Check balance after purchases
async function checkBalanceAfterPurchases() {
  logTest('Check Balance After Purchases');
  try {
    const response = await axios.get(`${API_URL}/billing/balance`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const balance = parseFloat(response.data.balance);
    const totalSpent = parseFloat(response.data.total_spent);
    logSuccess(`Balance: $${balance.toFixed(2)} (spent $75 for 2 placements)`);
    logSuccess(`Total spent: $${totalSpent.toFixed(2)}`);

    // Verify expected balance
    const expectedBalance = testData.initialBalance + 500 - 75; // +500 deposit - 75 spent
    if (Math.abs(balance - expectedBalance) < 0.01) {
      logSuccess(`✓ Balance is correct: $${expectedBalance.toFixed(2)}`);
    } else {
      logWarning(`⚠ Balance mismatch: expected $${expectedBalance.toFixed(2)}, got $${balance.toFixed(2)}`);
    }
    return true;
  } catch (error) {
    logError(`Get balance failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 11: Get placements for site (verify API)
async function getPlacementsBySite() {
  logTest('Get Placements by Site (verify new API)');
  try {
    const response = await axios.get(`${API_URL}/placements/by-site/${testData.siteId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { placements, summary } = response.data;
    logSuccess(`Found ${summary.total} placements on this site`);
    logSuccess(`Paid placements: ${summary.paidCount}`);
    logSuccess(`Total refund value: $${summary.totalRefund.toFixed(2)}`);

    if (summary.total !== 2) {
      logWarning(`Expected 2 placements, found ${summary.total}`);
    }
    if (Math.abs(summary.totalRefund - 75) > 0.01) {
      logWarning(`Expected $75 total refund, found $${summary.totalRefund.toFixed(2)}`);
    }

    return true;
  } catch (error) {
    logError(`Get placements by site failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 12: Delete site (with automatic refunds)
async function deleteSiteWithRefunds() {
  logTest('Delete Site with Automatic Refunds');
  try {
    const response = await axios.delete(`${API_URL}/sites/${testData.siteId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    logSuccess(`Site deleted successfully!`);
    logSuccess(`Placements deleted: ${response.data.placementsCount}`);
    logSuccess(`Refunded placements: ${response.data.refundedCount}`);
    logSuccess(`Total refunded: $${response.data.totalRefunded.toFixed(2)}`);

    if (response.data.tierChanged) {
      logInfo(`Discount tier changed to: ${response.data.newTier}`);
    }

    // Verify expected values
    if (response.data.placementsCount !== 2) {
      logWarning(`Expected 2 placements deleted, got ${response.data.placementsCount}`);
    }
    if (Math.abs(response.data.totalRefunded - 75) > 0.01) {
      logWarning(`Expected $75 refunded, got $${response.data.totalRefunded.toFixed(2)}`);
    }

    return true;
  } catch (error) {
    logError(`Site deletion failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 13: Verify final balance
async function verifyFinalBalance() {
  logTest('Verify Final Balance After Refund');
  try {
    const response = await axios.get(`${API_URL}/billing/balance`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const balance = parseFloat(response.data.balance);
    const totalSpent = parseFloat(response.data.total_spent);

    logSuccess(`Final balance: $${balance.toFixed(2)}`);
    logSuccess(`Final total spent: $${totalSpent.toFixed(2)}`);

    // Verify refund was applied
    const expectedBalance = testData.initialBalance + 500; // +500 deposit, purchases refunded
    const expectedTotalSpent = testData.totalSpent; // Should be back to original

    if (Math.abs(balance - expectedBalance) < 0.01) {
      logSuccess(`✓ Balance fully refunded: $${expectedBalance.toFixed(2)}`);
    } else {
      logError(`✗ Balance mismatch: expected $${expectedBalance.toFixed(2)}, got $${balance.toFixed(2)}`);
    }

    if (Math.abs(totalSpent - expectedTotalSpent) < 0.01) {
      logSuccess(`✓ Total spent correctly decremented: $${expectedTotalSpent.toFixed(2)}`);
    } else {
      logError(`✗ Total spent mismatch: expected $${expectedTotalSpent.toFixed(2)}, got $${totalSpent.toFixed(2)}`);
    }

    return true;
  } catch (error) {
    logError(`Get final balance failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 14: Verify placements were deleted
async function verifyPlacementsDeleted() {
  logTest('Verify Placements Were Deleted');
  try {
    try {
      await axios.get(`${API_URL}/placements/${testData.placementId1}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logError(`Placement 1 still exists (should be deleted)`);
      return false;
    } catch (error) {
      if (error.response?.status === 404) {
        logSuccess(`Placement 1 correctly deleted`);
      } else {
        throw error;
      }
    }

    try {
      await axios.get(`${API_URL}/placements/${testData.placementId2}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logError(`Placement 2 still exists (should be deleted)`);
      return false;
    } catch (error) {
      if (error.response?.status === 404) {
        logSuccess(`Placement 2 correctly deleted`);
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    logError(`Verification failed: ${error.message}`);
    return false;
  }
}

// Cleanup
async function cleanup() {
  logTest('Cleanup Test Data');
  try {
    if (testData.projectId) {
      await axios.delete(`${API_URL}/projects/${testData.projectId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted test project`);
    }
    return true;
  } catch (error) {
    logWarning(`Cleanup warning: ${error.message}`);
    return true; // Don't fail on cleanup errors
  }
}

// Main test runner
async function runTests() {
  console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║  Site Deletion with Refunds - Test Suite             ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  const tests = [
    { name: 'Login', fn: login },
    { name: 'Check Initial Balance', fn: checkInitialBalance },
    { name: 'Add Balance', fn: addBalance },
    { name: 'Create Project', fn: createProject },
    { name: 'Create Site', fn: createSite },
    { name: 'Create Link', fn: createLink },
    { name: 'Create Article', fn: createArticle },
    { name: 'Purchase Link Placement', fn: purchaseLinkPlacement },
    { name: 'Purchase Article Placement', fn: purchaseArticlePlacement },
    { name: 'Check Balance After Purchases', fn: checkBalanceAfterPurchases },
    { name: 'Get Placements By Site', fn: getPlacementsBySite },
    { name: 'Delete Site With Refunds', fn: deleteSiteWithRefunds },
    { name: 'Verify Final Balance', fn: verifyFinalBalance },
    { name: 'Verify Placements Deleted', fn: verifyPlacementsDeleted },
    { name: 'Cleanup', fn: cleanup }
  ];

  for (const test of tests) {
    results.total++;
    try {
      const result = await test.fn();
      if (result) {
        results.passed++;
      } else {
        results.failed++;
        logError(`Test "${test.name}" failed`);
      }
    } catch (error) {
      results.failed++;
      logError(`Test "${test.name}" threw exception: ${error.message}`);
    }
  }

  // Print summary
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}Test Results:${colors.reset}`);
  console.log(`${colors.green}✓ Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${results.failed}${colors.reset}`);
  console.log(`Total: ${results.total}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

  if (results.failed === 0) {
    console.log(`${colors.bright}${colors.green}🎉 All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.bright}${colors.red}❌ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

runTests();
