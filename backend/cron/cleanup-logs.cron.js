/**
 * Log Cleanup Cron Job
 * Removes old audit logs and read notifications to prevent database bloat
 * Runs daily at 03:00 AM
 */

const cron = require('node-cron');
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Clean up old audit logs and notifications
 */
const cleanupOldLogs = async () => {
  try {
    logger.info('Starting log cleanup process...');

    // Delete audit logs older than 1 year
    const auditResult = await query(`
      DELETE FROM audit_log
      WHERE created_at < NOW() - INTERVAL '1 year'
    `);
    const auditDeleted = auditResult.rowCount || 0;

    // Delete read notifications older than 90 days
    const notifResult = await query(`
      DELETE FROM notifications
      WHERE is_read = true
      AND created_at < NOW() - INTERVAL '90 days'
    `);
    const notifDeleted = notifResult.rowCount || 0;

    // Delete old renewal history (keep last 5 years)
    const renewalResult = await query(`
      DELETE FROM renewal_history
      WHERE renewed_at < NOW() - INTERVAL '5 years'
    `);
    const renewalDeleted = renewalResult.rowCount || 0;

    // IMPORTANT: Do NOT delete transactions - they are financial records
    // and must be kept indefinitely for audit and compliance purposes

    logger.info('Log cleanup completed successfully', {
      auditLogsDeleted: auditDeleted,
      notificationsDeleted: notifDeleted,
      renewalHistoryDeleted: renewalDeleted
    });

    // Log cleanup stats to a separate table if needed
    try {
      await query(`
        INSERT INTO audit_log (user_id, action, table_name, old_value, new_value, ip_address)
        VALUES (NULL, 'log_cleanup', 'system',
                '{"audit": ${auditDeleted}, "notifications": ${notifDeleted}, "renewals": ${renewalDeleted}}',
                NULL, 'system')
      `);
    } catch (auditError) {
      // Silent fail - cleanup happened, just couldn't log it
      logger.debug('Could not log cleanup stats:', auditError.message);
    }
  } catch (error) {
    logger.error('Failed to cleanup old logs:', error);
    throw error;
  }
};

/**
 * Schedule cleanup job
 * Runs daily at 03:00 AM (low traffic time)
 */
const scheduleLogCleanup = () => {
  // Cron format: second minute hour day month weekday
  // '0 3 * * *' = Every day at 03:00 AM
  const job = cron.schedule(
    '0 3 * * *',
    async () => {
      try {
        await cleanupOldLogs();
      } catch (error) {
        logger.error('Scheduled log cleanup failed:', error);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC' // Use UTC for consistency
    }
  );

  logger.info('Log cleanup cron job scheduled (daily at 03:00 UTC)');

  return job;
};

// Export for testing
module.exports = {
  scheduleLogCleanup,
  cleanupOldLogs
};
