/**
 * Auto-renewal cron job
 * Runs daily at 00:00 to process automatic renewal of placements
 */

const cron = require('node-cron');
const { query, pool } = require('../config/database');
const logger = require('../config/logger');
const billingService = require('../services/billing.service');

/**
 * Process auto-renewals for placements expiring in the next 7 days
 */
async function processAutoRenewals() {
  logger.info('Starting auto-renewal processing...');

  try {
    // Find all placements with auto-renewal enabled that expire in the next 7 days
    const result = await query(`
      SELECT p.id, p.user_id, p.expires_at, p.renewal_price, u.balance, u.username
      FROM placements p
      JOIN users u ON p.user_id = u.id
      WHERE p.auto_renewal = true
        AND p.status = 'placed'
        AND p.type = 'link'
        AND p.expires_at <= NOW() + INTERVAL '7 days'
        AND p.expires_at > NOW()
      ORDER BY p.expires_at ASC
    `);

    const placements = result.rows;
    logger.info(`Found ${placements.length} placements for auto-renewal`);

    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY_LIMIT = 10;

    // Process placements in parallel chunks to avoid overwhelming the database
    for (let i = 0; i < placements.length; i += CONCURRENCY_LIMIT) {
      const chunk = placements.slice(i, i + CONCURRENCY_LIMIT);

      const chunkResults = await Promise.allSettled(
        chunk.map(async (placement) => {
          logger.info('Processing auto-renewal', {
            placementId: placement.id,
            userId: placement.user_id,
            expiresAt: placement.expires_at,
            renewalPrice: placement.renewal_price
          });

          // CRITICAL FIX: Don't check stale balance here!
          // renewPlacement() will check balance with FOR UPDATE lock for thread safety.
          // If balance is insufficient, it will throw an error which we catch below.

          // Renew the placement (handles balance check with proper locking)
          const renewalResult = await billingService.renewPlacement(
            placement.id,
            placement.user_id,
            true // isAutoRenewal = true
          );

          logger.info('Auto-renewal successful', {
            placementId: placement.id,
            userId: placement.user_id,
            newExpiryDate: renewalResult.newExpiryDate,
            pricePaid: renewalResult.pricePaid
          });

          return { success: true };
        })
      );

      // Process chunk results
      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j];
        const placement = chunk[j];

        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successCount++;
          } else {
            failCount++;
          }
        } else {
          // Promise rejected - error occurred
          const error = result.reason;
          const isInsufficientBalance = error.message && error.message.includes('Insufficient balance');

          logger.error('Auto-renewal failed for placement', {
            placementId: placement.id,
            userId: placement.user_id,
            error: error.message,
            isInsufficientBalance,
            stack: error.stack
          });

          // Send user-friendly notification based on error type
          const notificationTitle = isInsufficientBalance
            ? 'Автопродление не удалось'
            : 'Ошибка автопродления';

          const notificationMessage = isInsufficientBalance
            ? `Не удалось автоматически продлить размещение #${placement.id} из-за недостаточного баланса. Пожалуйста, пополните баланс.`
            : `Произошла ошибка при автопродлении размещения #${placement.id}. Пожалуйста, свяжитесь с поддержкой.`;

          await query(`
            INSERT INTO notifications (user_id, type, title, message)
            VALUES ($1, 'auto_renewal_failed', $2, $3)
          `, [
            placement.user_id,
            notificationTitle,
            notificationMessage
          ]);

          failCount++;
        }
      }
    }

    logger.info('Auto-renewal processing completed', {
      total: placements.length,
      success: successCount,
      failed: failCount
    });

    return { total: placements.length, success: successCount, failed: failCount };

  } catch (error) {
    logger.error('Auto-renewal processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Send expiry reminders for placements expiring in 30, 7, and 1 days
 */
async function sendExpiryReminders() {
  logger.info('Sending expiry reminders...');

  try {
    const intervals = [
      { days: 30, message: '30 дней' },
      { days: 7, message: '7 дней' },
      { days: 1, message: '1 день' }
    ];

    let totalSent = 0;

    for (const interval of intervals) {
      const result = await query(`
        SELECT p.id, p.user_id, p.expires_at, s.site_name, pr.name as project_name
        FROM placements p
        JOIN sites s ON p.site_id = s.id
        JOIN projects pr ON p.project_id = pr.id
        WHERE p.status = 'placed'
          AND p.type = 'link'
          AND p.expires_at > NOW()
          AND p.expires_at <= NOW() + INTERVAL '${interval.days} days'
          AND p.expires_at > NOW() + INTERVAL '${interval.days - 1} days'
          -- Check if notification was not sent yet
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = p.user_id
              AND n.type = 'placement_expiring'
              AND n.metadata->>'placement_id' = p.id::text
              AND n.created_at > NOW() - INTERVAL '${interval.days + 1} days'
          )
      `);

      // Batch INSERT notifications (1 query instead of N)
      if (result.rows.length > 0) {
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const placement of result.rows) {
          values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
          params.push(
            placement.user_id,
            'placement_expiring',
            'Размещение скоро истекает',
            `Размещение #${placement.id} на сайте "${placement.site_name}" истекает через ${interval.message}. ` +
            `Проект: "${placement.project_name}". ` +
            `${placement.auto_renewal ? 'Автопродление включено.' : 'Вы можете продлить размещение вручную.'}`,
            JSON.stringify({
              placement_id: placement.id,
              days_remaining: interval.days
            })
          );
          paramIndex += 5;
        }

        await query(`
          INSERT INTO notifications (user_id, type, title, message, metadata)
          VALUES ${values.join(', ')}
        `, params);

        totalSent += result.rows.length;
      }

      logger.info(`Sent ${result.rows.length} expiry reminders for ${interval.days} days`);
    }

    logger.info('Expiry reminders sent', { total: totalSent });
    return { total: totalSent };

  } catch (error) {
    logger.error('Failed to send expiry reminders', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Initialize cron jobs
 */
function initAutoRenewalCron() {
  // Run auto-renewal processing daily at 00:00
  cron.schedule('0 0 * * *', async () => {
    logger.info('Auto-renewal cron job triggered');
    try {
      await processAutoRenewals();
    } catch (error) {
      logger.error('Auto-renewal cron job failed', { error: error.message });
    }
  });

  logger.info('Auto-renewal cron job scheduled (daily at 00:00)');

  // Run expiry reminders daily at 09:00
  cron.schedule('0 9 * * *', async () => {
    logger.info('Expiry reminder cron job triggered');
    try {
      await sendExpiryReminders();
    } catch (error) {
      logger.error('Expiry reminder cron job failed', { error: error.message });
    }
  });

  logger.info('Expiry reminder cron job scheduled (daily at 09:00)');
}

module.exports = {
  initAutoRenewalCron,
  processAutoRenewals,
  sendExpiryReminders
};
