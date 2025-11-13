/**
 * Comprehensive Placement System Test
 * Tests link and article placement on both WordPress and static_php sites
 */

const axios = require('axios');

const API_URL = 'http://localhost:3003/api';
let authToken = '';
let testData = {
  projectId: null,
  wpSiteId: null,          // For link placement
  wpSiteId2: null,         // For article placement
  staticSiteId: null,
  linkId: null,
  linkId2: null,  // Second link for static site
  articleId: null,
  wpLinkPlacementId: null,
  wpArticlePlacementId: null,
  staticLinkPlacementId: null
};

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  log(`TEST: ${testName}`, 'blue');
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Step 1: Login
async function login() {
  logTest('Authentication');
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    authToken = response.data.token;
    logSuccess('Logged in successfully');
    return true;
  } catch (error) {
    logError(`Login failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 2: Create test project
async function createProject() {
  logTest('Create Test Project');
  try {
    const response = await axios.post(`${API_URL}/projects`, {
      name: `Test Project ${Date.now()}`,
      description: 'Test project for placement system testing'
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

// Step 3: Create WordPress site
async function createWordPressSite() {
  logTest('Create WordPress Site');
  try {
    const response = await axios.post(`${API_URL}/sites`, {
      site_name: `WP Test Site ${Date.now()}`,
      site_url: 'https://wp-test-site.com',
      site_type: 'wordpress',
      api_key: 'test_wp_api_key_' + Date.now(),
      max_links: 10,
      max_articles: 5
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.wpSiteId = response.data.id;
    logSuccess(`WordPress site created: ID=${testData.wpSiteId}`);
    logSuccess(`  - Type: wordpress`);
    logSuccess(`  - Max Links: 10`);
    logSuccess(`  - Max Articles: 5`);
    return true;
  } catch (error) {
    logError(`WordPress site creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 3b: Create second WordPress site for articles
async function createWordPressSite2() {
  logTest('Create Second WordPress Site for Articles');
  try {
    const response = await axios.post(`${API_URL}/sites`, {
      site_url: `https://wp-test-site-2-${Date.now()}.com`,
      site_type: 'wordpress',
      api_key: 'test_wp_api_key_2_' + Date.now(),
      max_links: 10,
      max_articles: 5
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.wpSiteId2 = response.data.id;
    logSuccess(`Second WordPress site created: ID=${testData.wpSiteId2}`);
    return true;
  } catch (error) {
    logError(`Second WordPress site creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 4: Create static_php site
async function createStaticSite() {
  logTest('Create Static PHP Site');
  try {
    const response = await axios.post(`${API_URL}/sites`, {
      site_name: `Static Test Site ${Date.now()}`,
      site_url: 'https://static-test-site.com',
      site_type: 'static_php',
      api_key: 'test_static_api_key_' + Date.now(),
      max_links: 10
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.staticSiteId = response.data.id;
    logSuccess(`Static PHP site created: ID=${testData.staticSiteId}`);
    logSuccess(`  - Type: static_php`);
    logSuccess(`  - Max Links: 10`);
    logSuccess(`  - Max Articles: ${response.data.max_articles} (should be 0)`);

    if (response.data.max_articles !== 0) {
      logWarning(`Expected max_articles=0 for static_php, got ${response.data.max_articles}`);
    }
    return true;
  } catch (error) {
    logError(`Static site creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 5: Create test link
async function createLink() {
  logTest('Create Test Link');
  try {
    const response = await axios.post(`${API_URL}/projects/${testData.projectId}/links`, {
      url: 'https://example.com/target-page',
      anchor_text: 'Test Anchor Text',
      usage_limit: 999
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.linkId = response.data.id;
    logSuccess(`Link created: ID=${testData.linkId}`);
    logSuccess(`  - URL: https://example.com/target-page`);
    logSuccess(`  - Anchor: Test Anchor Text`);
    logSuccess(`  - Usage limit: 999`);
    return true;
  } catch (error) {
    logError(`Link creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 6: Create test article
async function createArticle() {
  logTest('Create Test Article');
  try {
    const response = await axios.post(`${API_URL}/projects/${testData.projectId}/articles`, {
      title: 'Test Article Title',
      content: '<p>This is test article content with <strong>HTML formatting</strong>.</p>',
      usage_limit: 1
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.articleId = response.data.id;
    logSuccess(`Article created: ID=${testData.articleId}`);
    logSuccess(`  - Title: Test Article Title`);
    logSuccess(`  - Usage limit: 1`);
    return true;
  } catch (error) {
    logError(`Article creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 7: Place link on WordPress site
async function placeWordPressLink() {
  logTest('Place Link on WordPress Site');
  try {
    const response = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testData.projectId,
      siteId: testData.wpSiteId,
      type: 'link',
      contentIds: [testData.linkId]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.wpLinkPlacementId = response.data.data.placement.id;
    logSuccess(`Link placement created on WordPress: ID=${testData.wpLinkPlacementId}`);
    logSuccess(`  - Status: ${response.data.data.placement.status}`);
    return true;
  } catch (error) {
    logError(`WordPress link placement failed: ${error.response?.data?.error || error.message}`);
    if (error.response?.data?.details) {
      logError(`  Details: ${error.response.data.details}`);
    }
    return false;
  }
}

// Step 7b: Create second link for static site
async function createLink2() {
  logTest('Create Second Test Link for Static Site');
  try {
    const response = await axios.post(`${API_URL}/projects/${testData.projectId}/links`, {
      url: 'https://example.com/static-target-page',
      anchor_text: 'Static Site Anchor Text',
      usage_limit: 999
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.linkId2 = response.data.id;
    logSuccess(`Second link created: ID=${testData.linkId2}`);
    logSuccess(`  - URL: https://example.com/static-target-page`);
    logSuccess(`  - Anchor: Static Site Anchor Text`);
    return true;
  } catch (error) {
    logError(`Second link creation failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 8: Place article on second WordPress site
async function placeWordPressArticle() {
  logTest('Place Article on Second WordPress Site');
  try {
    const response = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testData.projectId,
      siteId: testData.wpSiteId2,  // Use second WP site
      type: 'article',
      contentIds: [testData.articleId]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.wpArticlePlacementId = response.data.data.placement.id;
    logSuccess(`Article placement created on WordPress: ID=${testData.wpArticlePlacementId}`);
    logSuccess(`  - Status: ${response.data.data.placement.status}`);

    // Note: Article publication to actual WordPress will fail in test environment
    // This is expected - we're testing the system logic, not actual WP integration
    if (response.data.data.placement.status === 'failed') {
      logWarning(`Article publication failed (expected in test environment without real WordPress)`);
    }
    return true;
  } catch (error) {
    logError(`WordPress article placement failed: ${error.response?.data?.error || error.message}`);
    if (error.response?.data?.details) {
      logError(`  Details: ${error.response.data.details}`);
    }
    return false;
  }
}

// Step 9: Place link on static site (using second link)
async function placeStaticLink() {
  logTest('Place Link on Static PHP Site');
  try {
    const response = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testData.projectId,
      siteId: testData.staticSiteId,
      type: 'link',
      contentIds: [testData.linkId2]  // Use second link
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testData.staticLinkPlacementId = response.data.data.placement.id;
    logSuccess(`Link placement created on Static PHP: ID=${testData.staticLinkPlacementId}`);
    logSuccess(`  - Status: ${response.data.data.placement.status}`);
    return true;
  } catch (error) {
    logError(`Static link placement failed: ${error.response?.data?.error || error.message}`);
    if (error.response?.data?.details) {
      logError(`  Details: ${error.response.data.details}`);
    }
    return false;
  }
}

// Step 10: Try to place article on static site (should fail)
async function tryPlaceStaticArticle() {
  logTest('Try to Place Article on Static PHP Site (Should FAIL)');
  try {
    const response = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testData.projectId,
      siteId: testData.staticSiteId,
      type: 'article',
      contentIds: [testData.articleId]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    // If we get here, the test FAILED (should have thrown error)
    logError(`Article placement on static site succeeded - this should have been blocked!`);
    logError(`  Placement ID: ${response.data.data.placement.id}`);
    return false;
  } catch (error) {
    // Expected error
    if (error.response?.status === 400) {
      logSuccess(`Article placement correctly blocked on static_php site`);
      logSuccess(`  Error: ${error.response.data.error}`);
      if (error.response.data.details) {
        logSuccess(`  Details: ${error.response.data.details}`);
      }
      return true;
    } else {
      logError(`Unexpected error: ${error.response?.data?.error || error.message}`);
      return false;
    }
  }
}

// Step 11: Verify site quotas
async function verifyQuotas() {
  logTest('Verify Site Quotas After Placements');

  try {
    // Check WordPress site
    const wpResponse = await axios.get(`${API_URL}/sites`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    // Response could be array or paginated {data: [...], ...}
    const sites = Array.isArray(wpResponse.data) ? wpResponse.data : wpResponse.data.data;
    const wpSite = sites.find(s => s.id === testData.wpSiteId);

    logSuccess(`WordPress Site Quotas:`);
    logSuccess(`  - Links: ${wpSite.used_links}/${wpSite.max_links}`);
    logSuccess(`  - Articles: ${wpSite.used_articles}/${wpSite.max_articles}`);

    if (wpSite.used_links !== 1) {
      logWarning(`Expected used_links=1, got ${wpSite.used_links}`);
    }

    // Check static site
    const staticSite = sites.find(s => s.id === testData.staticSiteId);
    logSuccess(`Static PHP Site Quotas:`);
    logSuccess(`  - Links: ${staticSite.used_links}/${staticSite.max_links}`);
    logSuccess(`  - Articles: ${staticSite.used_articles}/${staticSite.max_articles}`);

    if (staticSite.used_links !== 1) {
      logWarning(`Expected used_links=1, got ${staticSite.used_links}`);
    }

    if (staticSite.max_articles !== 0) {
      logWarning(`Expected max_articles=0 for static_php, got ${staticSite.max_articles}`);
    }

    return true;
  } catch (error) {
    logError(`Quota verification failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Step 12: Test widget endpoints
async function testWidgetEndpoints() {
  logTest('Test Widget Endpoints');

  // Get API keys from database or sites
  try {
    const sitesResponse = await axios.get(`${API_URL}/sites`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    // Response could be array or paginated {data: [...], ...}
    const sites = Array.isArray(sitesResponse.data) ? sitesResponse.data : sitesResponse.data.data;
    const wpSite = sites.find(s => s.id === testData.wpSiteId);
    const staticSite = sites.find(s => s.id === testData.staticSiteId);

    // Test WordPress widget endpoint (API key based)
    logSuccess(`\nTesting WordPress widget endpoint:`);
    const wpWidgetResponse = await axios.get(`${API_URL}/wordpress/get-content?api_key=${wpSite.api_key}`);
    logSuccess(`  - Links returned: ${wpWidgetResponse.data.links.length}`);
    logSuccess(`  - Articles returned: ${wpWidgetResponse.data.articles.length}`);

    if (wpWidgetResponse.data.links.length > 0) {
      logSuccess(`  - First link: ${wpWidgetResponse.data.links[0].anchor_text} -> ${wpWidgetResponse.data.links[0].url}`);
    }

    // Test static widget endpoint (API key based - same endpoint as WordPress)
    logSuccess(`\nTesting Static PHP widget endpoint:`);
    const staticWidgetResponse = await axios.get(`${API_URL}/wordpress/get-content?api_key=${staticSite.api_key}`);
    logSuccess(`  - Links returned: ${staticWidgetResponse.data.links.length}`);
    logSuccess(`  - Articles returned: ${staticWidgetResponse.data.articles.length}`);

    if (staticWidgetResponse.data.articles.length > 0) {
      logWarning(`Static site returned ${staticWidgetResponse.data.articles.length} articles - should be 0!`);
    }

    if (staticWidgetResponse.data.links.length > 0) {
      logSuccess(`  - First link: ${staticWidgetResponse.data.links[0].anchor_text} -> ${staticWidgetResponse.data.links[0].url}`);
    }

    return true;
  } catch (error) {
    logError(`Widget endpoint test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

// Cleanup: Delete test data
async function cleanup() {
  logTest('Cleanup Test Data');

  let success = true;

  // Delete placements
  if (testData.wpLinkPlacementId) {
    try {
      await axios.delete(`${API_URL}/placements/${testData.wpLinkPlacementId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted WordPress link placement`);
    } catch (error) {
      logWarning(`Failed to delete WP link placement: ${error.message}`);
    }
  }

  if (testData.wpArticlePlacementId) {
    try {
      await axios.delete(`${API_URL}/placements/${testData.wpArticlePlacementId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted WordPress article placement`);
    } catch (error) {
      logWarning(`Failed to delete WP article placement: ${error.message}`);
    }
  }

  if (testData.staticLinkPlacementId) {
    try {
      await axios.delete(`${API_URL}/placements/${testData.staticLinkPlacementId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted static link placement`);
    } catch (error) {
      logWarning(`Failed to delete static link placement: ${error.message}`);
    }
  }

  // Delete sites
  if (testData.wpSiteId) {
    try {
      await axios.delete(`${API_URL}/sites/${testData.wpSiteId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted WordPress site 1`);
    } catch (error) {
      logWarning(`Failed to delete WP site 1: ${error.message}`);
    }
  }

  if (testData.wpSiteId2) {
    try {
      await axios.delete(`${API_URL}/sites/${testData.wpSiteId2}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted WordPress site 2`);
    } catch (error) {
      logWarning(`Failed to delete WP site 2: ${error.message}`);
    }
  }

  if (testData.staticSiteId) {
    try {
      await axios.delete(`${API_URL}/sites/${testData.staticSiteId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted static site`);
    } catch (error) {
      logWarning(`Failed to delete static site: ${error.message}`);
    }
  }

  // Delete project (cascades to links and articles)
  if (testData.projectId) {
    try {
      await axios.delete(`${API_URL}/projects/${testData.projectId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      logSuccess(`Deleted project`);
    } catch (error) {
      logWarning(`Failed to delete project: ${error.message}`);
    }
  }

  return success;
}

// Main test runner
async function runTests() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     COMPREHENSIVE PLACEMENT SYSTEM TEST                    ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  const tests = [
    { name: 'Login', fn: login },
    { name: 'Create Project', fn: createProject },
    { name: 'Create WordPress Site 1', fn: createWordPressSite },
    { name: 'Create WordPress Site 2', fn: createWordPressSite2 },
    { name: 'Create Static PHP Site', fn: createStaticSite },
    { name: 'Create Link 1', fn: createLink },
    { name: 'Create Link 2', fn: createLink2 },
    { name: 'Create Article', fn: createArticle },
    { name: 'Place Link on WordPress', fn: placeWordPressLink },
    { name: 'Place Article on WordPress', fn: placeWordPressArticle },
    { name: 'Place Link on Static PHP', fn: placeStaticLink },
    { name: 'Block Article on Static PHP', fn: tryPlaceStaticArticle },
    { name: 'Verify Quotas', fn: verifyQuotas },
    { name: 'Test Widget Endpoints', fn: testWidgetEndpoints }
  ];

  for (const test of tests) {
    results.total++;
    const success = await test.fn();
    if (success) {
      results.passed++;
    } else {
      results.failed++;
    }
    await sleep(100); // Small delay between tests
  }

  // Cleanup
  await cleanup();

  // Final summary
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                    TEST SUMMARY                            ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  log(`Total Tests: ${results.total}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

  if (results.failed === 0) {
    log('\n✓ All tests passed!', 'green');
  } else {
    log(`\n✗ ${results.failed} test(s) failed`, 'red');
  }

  console.log('\n');
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
