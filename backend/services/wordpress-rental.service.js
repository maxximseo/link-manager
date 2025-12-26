const axios = require('axios');
const logger = require('../config/logger');

/**
 * Notify WordPress site about rental status change
 *
 * IMPORTANT: This is an OPTIONAL webhook - if the WordPress site doesn't have
 * the endpoint or doesn't respond, we just log a warning and continue.
 * The rental operation will succeed regardless of webhook status.
 *
 * @param {string} siteUrl - WordPress site URL
 * @param {string} apiKey - Site API key for authentication
 * @param {object} rentalData - Rental data
 * @param {string} action - 'approved' | 'rejected' | 'cancelled' | 'expired'
 */
async function notifyRentalStatusChange(siteUrl, apiKey, rentalData, action) {
  try {
    const endpoint = `${siteUrl}/wp-json/lmw/v1/rental-update`;

    const payload = {
      api_key: apiKey,
      action: action, // approved, rejected, cancelled, expired
      rental_id: rentalData.id,
      slot_type: rentalData.slot_type, // 'link' or 'article'
      slot_count: rentalData.slot_count,
      tenant_id: rentalData.tenant_id,
      expires_at: rentalData.expires_at,
      status: rentalData.status
    };

    logger.info(`[WordPress Rental Webhook] Sending ${action} notification to ${siteUrl}`, {
      rental_id: rentalData.id,
      slot_count: rentalData.slot_count,
      slot_type: rentalData.slot_type
    });

    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LinkManager-Backend/2.8.0'
      },
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status < 500 // Accept 4xx as valid response
    });

    if (response.status === 200 || response.status === 201) {
      logger.info(`[WordPress Rental Webhook] Successfully notified ${siteUrl}`, {
        rental_id: rentalData.id,
        response: response.data
      });
      return { success: true, response: response.data };
    } else {
      logger.warn(`[WordPress Rental Webhook] Non-success status from ${siteUrl}`, {
        rental_id: rentalData.id,
        status: response.status,
        data: response.data
      });
      return { success: false, status: response.status, data: response.data };
    }
  } catch (error) {
    // Log error but don't throw - webhook failure shouldn't break rental operations
    logger.warn(
      `[WordPress Rental Webhook] Optional webhook failed for ${siteUrl} (this is OK if plugin not updated):`,
      {
        rental_id: rentalData.id,
        error: error.message,
        // Include helpful debugging info
        endpoint: error.config?.url,
        timeout: error.code === 'ECONNABORTED'
      }
    );

    return {
      success: false,
      error: error.message,
      endpoint: error.config?.url,
      timeout: error.code === 'ECONNABORTED'
    };
  }
}

module.exports = {
  notifyRentalStatusChange
};
