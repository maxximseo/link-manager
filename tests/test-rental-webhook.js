/**
 * Test script for WordPress rental webhook
 *
 * This script tests the webhook service manually to verify
 * it sends requests correctly (even if WordPress doesn't have endpoint yet).
 */

require('dotenv').config({ path: './backend/.env' });
const wordpressRentalService = require('../backend/services/wordpress-rental.service');

async function testWebhook() {
  console.log('🧪 Testing WordPress rental webhook...\n');

  // Test data
  const testSiteUrl = 'https://example.com'; // Replace with real test site if available
  const testApiKey = 'test_api_key_123';
  const testRentalData = {
    id: 999,
    slot_type: 'link',
    slot_count: 5,
    tenant_id: 1,
    expires_at: '2025-12-31T23:59:59Z',
    status: 'active'
  };

  console.log('📤 Sending test webhook to:', testSiteUrl);
  console.log('   Endpoint:', `${testSiteUrl}/wp-json/lmw/v1/rental-update`);
  console.log('   Action: approved');
  console.log('   Rental ID:', testRentalData.id);
  console.log('   Slots:', testRentalData.slot_count, testRentalData.slot_type);
  console.log('');

  try {
    const result = await wordpressRentalService.notifyRentalStatusChange(
      testSiteUrl,
      testApiKey,
      testRentalData,
      'approved'
    );

    console.log('📥 Webhook response:');
    console.log('   Success:', result.success);

    if (result.success) {
      console.log('   ✅ WordPress site received webhook successfully!');
      console.log('   Response:', JSON.stringify(result.response, null, 2));
    } else {
      console.log('   ⚠️  Webhook failed (this is OK if plugin not updated on WordPress site)');
      console.log('   Error:', result.error);
      if (result.status) {
        console.log('   HTTP Status:', result.status);
      }
      if (result.timeout) {
        console.log('   Reason: Request timeout (site not responding)');
      }
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('ℹ️  Note: Webhook failures are expected if WordPress plugin');
    console.log('   does not have the /wp-json/lmw/v1/rental-update endpoint.');
    console.log('   This is OK - the system will work fine without it.');
    console.log('   The webhook is OPTIONAL and only used for real-time updates.');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('🎉 Test completed!');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    throw error;
  }
}

// Run test
testWebhook().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
