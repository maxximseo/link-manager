require('dotenv').config();
const axios = require('axios');
const { pool } = require('./backend/config/database');

const API_URL = 'http://localhost:3003/api';
let authToken = '';
let testSiteId = null;
let testProjectId = null;
let testLinkId = null;
let testArticleId = null;

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

function logTest(testNumber, description) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST ${testNumber}: ${description}`, 'cyan');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function login() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    authToken = response.data.token;
    logSuccess('Logged in successfully');
    return true;
  } catch (error) {
    logError(`Login failed: ${error.message}`);
    return false;
  }
}

async function test1_CreateStaticSite() {
  logTest(1, 'Create Static PHP Site via API');

  try {
    const response = await axios.post(`${API_URL}/sites`, {
      site_url: 'https://static-test-site.com',
      site_type: 'static_php',
      max_links: 20
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    testSiteId = response.data.id;

    logInfo(`Site created with ID: ${testSiteId}`);

    // Verify response
    if (response.data.site_type !== 'static_php') {
      logError(`Expected site_type='static_php', got '${response.data.site_type}'`);
      return false;
    }

    if (response.data.max_articles !== 0) {
      logError(`Expected max_articles=0, got ${response.data.max_articles}`);
      return false;
    }

    if (response.data.api_key !== null) {
      logError(`Expected api_key=null, got '${response.data.api_key}'`);
      return false;
    }

    // Verify in database
    const dbResult = await pool.query(
      'SELECT site_type, max_articles, api_key, max_links FROM sites WHERE id = $1',
      [testSiteId]
    );

    if (dbResult.rows.length === 0) {
      logError('Site not found in database');
      return false;
    }

    const dbSite = dbResult.rows[0];

    if (dbSite.site_type !== 'static_php') {
      logError(`DB: Expected site_type='static_php', got '${dbSite.site_type}'`);
      return false;
    }

    if (dbSite.max_articles !== 0) {
      logError(`DB: Expected max_articles=0, got ${dbSite.max_articles}`);
      return false;
    }

    logSuccess('API response correct: site_type=static_php, max_articles=0, api_key=null');
    logSuccess('Database verification passed');
    return true;

  } catch (error) {
    logError(`Test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function test2_ValidateInvalidSiteType() {
  logTest(2, 'Validate site_type Restrictions');

  try {
    // Test 2.1: Invalid site_type
    try {
      await axios.post(`${API_URL}/sites`, {
        site_url: 'https://invalid-type.com',
        site_type: 'invalid_type',
        max_links: 10
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      logError('Should have rejected invalid site_type');
      return false;
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.error?.includes('wordpress or static_php')) {
        logSuccess('Correctly rejected invalid site_type');
      } else {
        logError(`Wrong error: ${error.response?.data?.error}`);
        return false;
      }
    }

    // Test 2.2: Force max_articles to 0 for static_php
    const response = await axios.post(`${API_URL}/sites`, {
      site_url: 'https://force-zero-articles.com',
      site_type: 'static_php',
      max_links: 10,
      max_articles: 50  // Should be forced to 0
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.data.max_articles !== 0) {
      logError(`Should force max_articles=0, got ${response.data.max_articles}`);
      return false;
    }

    logSuccess('Forced max_articles to 0 even when request sent 50');

    // Clean up test site
    await axios.delete(`${API_URL}/sites/${response.data.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    return true;

  } catch (error) {
    logError(`Test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function test3_CreatePlacementWithLink() {
  logTest(3, 'Create Placement with Link on Static Site');

  try {
    // Create project
    const projectResponse = await axios.post(`${API_URL}/projects`, {
      name: 'Test Static Project',
      main_site_url: 'https://test-project.com'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    testProjectId = projectResponse.data.id;
    logInfo(`Created project ID: ${testProjectId}`);

    // Create link
    const linkResponse = await axios.post(`${API_URL}/projects/${testProjectId}/links`, {
      url: 'https://target-link.com',
      anchor_text: 'Test Link'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    testLinkId = linkResponse.data.id;
    logInfo(`Created link ID: ${testLinkId}`);

    // Create placement via billing API
    const placementResponse = await axios.post(`${API_URL}/billing/purchase`, {
      projectId: testProjectId,
      siteId: testSiteId,
      type: 'link',
      contentIds: [testLinkId]
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    logInfo(`Created placement via billing API`);

    // Verify in database
    const dbResult = await pool.query(`
      SELECT p.id, p.status, s.used_links, s.used_articles,
             COUNT(DISTINCT pc.link_id) as links_count,
             COUNT(DISTINCT pc.article_id) as articles_count
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      LEFT JOIN placement_content pc ON p.id = pc.placement_id
      WHERE p.site_id = $1
      GROUP BY p.id, p.status, s.used_links, s.used_articles
    `, [testSiteId]);

    if (dbResult.rows.length === 0) {
      logError('Placement not found in database');
      return false;
    }

    const placement = dbResult.rows[0];

    if (placement.status !== 'placed') {
      logError(`Expected status='placed', got '${placement.status}'`);
      return false;
    }

    if (parseInt(placement.links_count) !== 1) {
      logError(`Expected 1 link, got ${placement.links_count}`);
      return false;
    }

    if (parseInt(placement.articles_count) !== 0) {
      logError(`Expected 0 articles, got ${placement.articles_count}`);
      return false;
    }

    if (placement.used_links !== 1) {
      logError(`Expected used_links=1, got ${placement.used_links}`);
      return false;
    }

    if (placement.used_articles !== 0) {
      logError(`Expected used_articles=0, got ${placement.used_articles}`);
      return false;
    }

    logSuccess('Placement created with status=placed');
    logSuccess('Site quotas updated: used_links=1, used_articles=0');
    return true;

  } catch (error) {
    logError(`Test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function test4_BlockArticlePlacement() {
  logTest(4, 'Block Article Placement on Static Site');

  try {
    // Create article
    const articleResponse = await axios.post(`${API_URL}/projects/${testProjectId}/articles`, {
      title: 'Test Article',
      content: 'This is test content',
      slug: 'test-article'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    testArticleId = articleResponse.data.id;
    logInfo(`Created article ID: ${testArticleId}`);

    // Attempt to create placement with article (should fail)
    try {
      await axios.post(`${API_URL}/billing/purchase`, {
        projectId: testProjectId,
        siteId: testSiteId,
        type: 'article',
        contentIds: [testArticleId]
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      logError('Should have blocked article placement on static site');
      return false;

    } catch (error) {
      const errorText = error.response?.data?.details || error.response?.data?.error || '';
      if (error.response?.status === 400 &&
          (errorText.toLowerCase().includes('article') ||
           errorText.toLowerCase().includes('static php'))) {
        logSuccess(`Correctly blocked article: "${errorText}"`);
      } else {
        logError(`Wrong error: ${error.response?.data?.error}`);
        logError(`Details: ${error.response?.data?.details}`);
        return false;
      }
    }

    // Verify no placement was created
    const dbResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM placement_content pc
      WHERE pc.article_id = $1
    `, [testArticleId]);

    if (parseInt(dbResult.rows[0].count) !== 0) {
      logError('Article placement was created (should not have been)');
      return false;
    }

    logSuccess('Verified no article placement in database');
    return true;

  } catch (error) {
    logError(`Test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function test5_WidgetEndpoint() {
  logTest(5, 'Test Widget Endpoint for Static Site');

  try {
    // Test without authentication
    const response = await axios.get(`${API_URL}/static/get-content-by-domain`, {
      params: { domain: 'static-test-site.com' }
    });

    if (!response.data.links || !Array.isArray(response.data.links)) {
      logError('Response missing links array');
      return false;
    }

    if (!response.data.articles || !Array.isArray(response.data.articles)) {
      logError('Response missing articles array');
      return false;
    }

    if (response.data.links.length !== 1) {
      logError(`Expected 1 link, got ${response.data.links.length}`);
      return false;
    }

    if (response.data.articles.length !== 0) {
      logError(`Expected 0 articles, got ${response.data.articles.length}`);
      return false;
    }

    const link = response.data.links[0];
    if (link.anchor_text !== 'Test Link') {
      logError(`Expected anchor_text='Test Link', got '${link.anchor_text}'`);
      return false;
    }

    if (link.url !== 'https://target-link.com') {
      logError(`Expected url='https://target-link.com', got '${link.url}'`);
      return false;
    }

    logSuccess('Widget endpoint works without authentication');
    logSuccess(`Returned 1 link: "${link.anchor_text}" → ${link.url}`);
    logSuccess('Articles array is empty (correct for static site)');
    return true;

  } catch (error) {
    logError(`Test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function test6_UpdateSiteType() {
  logTest(6, 'Update Site Type WordPress → Static');

  try {
    // Create WordPress site first
    const wpSiteResponse = await axios.post(`${API_URL}/sites`, {
      site_url: 'https://wordpress-to-static.com',
      site_type: 'wordpress',
      api_key: 'test_api_key',
      max_links: 10,
      max_articles: 10
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const wpSiteId = wpSiteResponse.data.id;
    logInfo(`Created WordPress site ID: ${wpSiteId}`);

    // Update to static_php
    const updateResponse = await axios.put(`${API_URL}/sites/${wpSiteId}`, {
      site_type: 'static_php'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (updateResponse.data.site_type !== 'static_php') {
      logError(`Expected site_type='static_php', got '${updateResponse.data.site_type}'`);
      return false;
    }

    if (updateResponse.data.max_articles !== 0) {
      logError(`Expected max_articles=0, got ${updateResponse.data.max_articles}`);
      return false;
    }

    // Verify in database
    const dbResult = await pool.query(
      'SELECT site_type, max_articles FROM sites WHERE id = $1',
      [wpSiteId]
    );

    if (dbResult.rows[0].site_type !== 'static_php') {
      logError(`DB: Expected site_type='static_php', got '${dbResult.rows[0].site_type}'`);
      return false;
    }

    if (dbResult.rows[0].max_articles !== 0) {
      logError(`DB: Expected max_articles=0, got ${dbResult.rows[0].max_articles}'`);
      return false;
    }

    logSuccess('Site type updated from wordpress to static_php');
    logSuccess('max_articles forced to 0');

    // Clean up
    await axios.delete(`${API_URL}/sites/${wpSiteId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    return true;

  } catch (error) {
    logError(`Test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function cleanup() {
  log('\n\nCleaning up test data...', 'yellow');

  try {
    if (testProjectId) {
      await axios.delete(`${API_URL}/projects/${testProjectId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      logInfo('Deleted test project');
    }

    if (testSiteId) {
      await axios.delete(`${API_URL}/sites/${testSiteId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      logInfo('Deleted test site');
    }

    logSuccess('Cleanup completed');
  } catch (error) {
    logError(`Cleanup error: ${error.message}`);
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║     STATIC PHP SITE COMPREHENSIVE TEST SUITE          ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');

  const results = [];

  // Login
  if (!await login()) {
    logError('Cannot proceed without authentication');
    process.exit(1);
  }

  // Run tests
  results.push({ name: 'Test 1: Create Static Site', passed: await test1_CreateStaticSite() });
  results.push({ name: 'Test 2: Validate Restrictions', passed: await test2_ValidateInvalidSiteType() });
  results.push({ name: 'Test 3: Link Placement', passed: await test3_CreatePlacementWithLink() });
  results.push({ name: 'Test 4: Block Article Placement', passed: await test4_BlockArticlePlacement() });
  results.push({ name: 'Test 5: Widget Endpoint', passed: await test5_WidgetEndpoint() });
  results.push({ name: 'Test 6: Update Site Type', passed: await test6_UpdateSiteType() });

  // Cleanup
  await cleanup();

  // Summary
  log('\n\n' + '='.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(result => {
    if (result.passed) {
      logSuccess(result.name);
    } else {
      logError(result.name);
    }
  });

  log('\n' + '='.repeat(60), 'cyan');
  log(`Total: ${results.length} tests`, 'blue');
  log(`Passed: ${passed} tests`, 'green');
  log(`Failed: ${failed} tests`, 'red');
  log('='.repeat(60), 'cyan');

  await pool.end();

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
