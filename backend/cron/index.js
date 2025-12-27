/**
 * Cron jobs initialization
 * Manages all scheduled tasks for the application
 */

const logger = require('../config/logger');
const { initAutoRenewalCron } = require('./auto-renewal.cron');
const { initScheduledPlacementsCron } = require('./scheduled-placements.cron');
const { scheduleLogCleanup } = require('./cleanup-logs.cron');
const { initDatabaseBackupCron } = require('./database-backup.cron');
const { initHealthMonitor } = require('./health-monitor.cron');
const { initExpiredPlacementsCleanupCron } = require('./cleanup-expired-placements.cron');
const { initRentalExpirationCron } = require('./cleanup-expired-rentals.cron');
const { initAutoRenewalRentalsCron } = require('./auto-renewal-rentals.cron');

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

    // Initialize log cleanup cron (daily at 03:00)
    scheduleLogCleanup();

    // Initialize database backup cron (every 12 hours at 00:00 and 12:00 UTC)
    initDatabaseBackupCron();

    // Initialize health monitor cron (every 5 minutes)
    initHealthMonitor();

    // Initialize expired placements cleanup cron (daily at 01:00 UTC)
    initExpiredPlacementsCleanupCron();

    // Initialize rental expiration cron (every 15 minutes)
    initRentalExpirationCron();

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
