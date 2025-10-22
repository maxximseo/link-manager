/**
 * Cron jobs initialization
 * Manages all scheduled tasks for the application
 */

const logger = require('../config/logger');
const { initAutoRenewalCron } = require('./auto-renewal.cron');
const { initScheduledPlacementsCron } = require('./scheduled-placements.cron');

/**
 * Initialize all cron jobs
 */
function initCronJobs() {
  logger.info('Initializing cron jobs...');

  try {
    // Initialize auto-renewal cron (daily at 00:00 and 09:00)
    initAutoRenewalCron();

    // Initialize scheduled placements cron (hourly)
    initScheduledPlacementsCron();

    logger.info('All cron jobs initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize cron jobs', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  initCronJobs
};
