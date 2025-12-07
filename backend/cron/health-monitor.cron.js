/**
 * Health Monitor Cron Job
 * Checks system health every 5 minutes and sends email alerts for anomalies
 */

const cron = require('node-cron');
const logger = require('../config/logger');

let healthRoutes = null;

/**
 * Initialize the health monitor cron job
 */
function initHealthMonitor() {
  // Lazy load to avoid circular dependencies
  healthRoutes = require('../routes/health.routes');

  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await healthRoutes.checkAnomaliesAndAlert();

      if (result.alerted) {
        logger.warn('Health anomalies detected and alert sent', {
          anomalies: result.anomalies
        });
      } else if (result.anomalies.length > 0) {
        logger.info('Health anomalies detected but alert debounced', {
          anomalies: result.anomalies
        });
      }
    } catch (error) {
      logger.error('Health monitor check failed', { error: error.message });
    }
  });

  logger.info('Health monitor cron job scheduled (every 5 minutes)');
}

module.exports = { initHealthMonitor };
