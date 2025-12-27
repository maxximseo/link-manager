/**
 * Auto-renewal rentals cron job
 * Runs daily at 08:00 UTC to auto-renew rentals expiring within 24 hours
 *
 * Logic:
 * 1. Find active rentals where auto_renewal=true AND expires_at < NOW() + 1 day
 * 2. Check tenant balance >= total_price
 * 3. Deduct money from tenant, credit to owner
 * 4. Extend rental by RENTAL_PERIOD_DAYS (365 days)
 * 5. Extend all linked placements via rental_placements
 * 6. Create notifications
 */

const cron = require('node-cron');
const { pool } = require('../config/database');
const logger = require('../config/logger');
const notificationService = require('../services/notification.service');

// Import rental period from billing service constants
const RENTAL_PERIOD_DAYS = 365;

/**
 * Process auto-renewal for rentals expiring soon
 */
async function processAutoRenewalRentals() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find rentals due for auto-renewal (expiring within 24 hours, auto_renewal enabled)
    const renewalCandidates = await client.query(`
      SELECT
        r.id,
        r.site_id,
        r.owner_id,
        r.tenant_id,
        r.slot_type,
        r.slots_count,
        r.price_per_slot,
        r.total_price,
        r.expires_at,
        r.auto_renewal,
        s.site_name,
        s.site_url,
        t.balance as tenant_balance,
        t.username as tenant_username,
        o.username as owner_username
      FROM site_slot_rentals r
      JOIN sites s ON s.id = r.site_id
      JOIN users t ON t.id = r.tenant_id
      JOIN users o ON o.id = r.owner_id
      WHERE r.status = 'active'
        AND r.auto_renewal = true
        AND r.expires_at < NOW() + INTERVAL '1 day'
        AND r.expires_at > NOW()
      FOR UPDATE OF r, t
    `);

    if (renewalCandidates.rows.length === 0) {
      logger.info('[Cron] No rentals due for auto-renewal');
      await client.query('COMMIT');
      return { renewed: 0, failed: 0, notifications: 0 };
    }

    logger.info(`[Cron] Found ${renewalCandidates.rows.length} rentals for auto-renewal`);

    let renewed = 0;
    let failed = 0;
    let notifications = 0;

    for (const rental of renewalCandidates.rows) {
      const totalPrice = parseFloat(rental.total_price);
      const tenantBalance = parseFloat(rental.tenant_balance);
      // NOTE: slot_type column doesn't exist in DB - rentals are always for links
      const slotType = rental.slot_type || 'link';

      // Check if tenant has sufficient balance
      if (tenantBalance < totalPrice) {
        // Insufficient balance - notify tenant
        await notificationService.create({
          userId: rental.tenant_id,
          type: 'rental_renewal_failed',
          title: 'Недостаточно средств для продления аренды',
          message: `Не удалось продлить аренду ${rental.slots_count} слотов на сайте "${rental.site_name}". Необходимо $${totalPrice.toFixed(2)}, на балансе $${tenantBalance.toFixed(2)}. Пополните баланс до ${new Date(rental.expires_at).toLocaleDateString('ru-RU')}.`,
          metadata: {
            rental_id: rental.id,
            required: totalPrice,
            balance: tenantBalance,
            expires_at: rental.expires_at
          }
        });
        notifications++;
        failed++;
        logger.warn(`[Cron] Auto-renewal failed for rental ${rental.id}: insufficient balance ($${tenantBalance} < $${totalPrice})`);
        continue;
      }

      // Calculate new expiration date (RENTAL_PERIOD_DAYS from current expiration)
      const newExpiresAt = new Date(rental.expires_at);
      newExpiresAt.setDate(newExpiresAt.getDate() + RENTAL_PERIOD_DAYS);

      // Deduct from tenant balance
      await client.query(
        `UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
        [totalPrice, rental.tenant_id]
      );

      // Credit to owner balance
      await client.query(
        `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
        [totalPrice, rental.owner_id]
      );

      // Create transactions for both parties
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, metadata, created_at)
         VALUES ($1, 'rental_payment', $2, $3, $4, NOW())`,
        [
          rental.tenant_id,
          -totalPrice,
          `Автопродление аренды слотов на "${rental.site_name}"`,
          JSON.stringify({
            rental_id: rental.id,
            site_id: rental.site_id,
            slot_count: rental.slots_count,
            slot_type: slotType,
            auto_renewal: true
          })
        ]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, description, metadata, created_at)
         VALUES ($1, 'rental_income', $2, $3, $4, NOW())`,
        [
          rental.owner_id,
          totalPrice,
          `Автопродление аренды от ${rental.tenant_username} на "${rental.site_name}"`,
          JSON.stringify({
            rental_id: rental.id,
            site_id: rental.site_id,
            slot_count: rental.slots_count,
            slot_type: slotType,
            auto_renewal: true
          })
        ]
      );

      // Extend rental expiration
      await client.query(
        `UPDATE site_slot_rentals
         SET expires_at = $1,
             updated_at = NOW(),
             history = COALESCE(history, '[]'::jsonb) || jsonb_build_object(
               'action', 'auto_renewed',
               'timestamp', NOW(),
               'details', jsonb_build_object(
                 'previous_expires_at', $2,
                 'new_expires_at', $1,
                 'amount_charged', $3
               )
             )::jsonb
         WHERE id = $4`,
        [newExpiresAt.toISOString(), rental.expires_at, totalPrice, rental.id]
      );

      // CRITICAL: Extend all linked placements
      const placementUpdateResult = await client.query(
        `UPDATE placements p
         SET expires_at = $1,
             updated_at = NOW()
         FROM rental_placements rp
         WHERE rp.placement_id = p.id
           AND rp.rental_id = $2
         RETURNING p.id`,
        [newExpiresAt.toISOString(), rental.id]
      );

      const extendedPlacements = placementUpdateResult.rowCount;

      // Notify tenant about successful renewal
      await notificationService.create({
        userId: rental.tenant_id,
        type: 'rental_renewed',
        title: 'Аренда продлена',
        message: `Аренда ${rental.slots_count} слотов на сайте "${rental.site_name}" автоматически продлена до ${newExpiresAt.toLocaleDateString('ru-RU')}. Списано $${totalPrice.toFixed(2)}.${extendedPlacements > 0 ? ` Продлено ${extendedPlacements} размещений.` : ''}`,
        metadata: {
          rental_id: rental.id,
          new_expires_at: newExpiresAt.toISOString(),
          amount: totalPrice,
          placements_extended: extendedPlacements
        }
      });

      // Notify owner about income
      await notificationService.create({
        userId: rental.owner_id,
        type: 'rental_income_received',
        title: 'Получен доход от аренды',
        message: `Автопродление аренды от ${rental.tenant_username} на сайте "${rental.site_name}". Получено $${totalPrice.toFixed(2)}.`,
        metadata: {
          rental_id: rental.id,
          tenant_id: rental.tenant_id,
          amount: totalPrice
        }
      });

      notifications += 2;
      renewed++;

      logger.info(
        `[Cron] Auto-renewed rental ${rental.id}: Extended to ${newExpiresAt.toISOString()}, charged $${totalPrice}, extended ${extendedPlacements} placements`
      );
    }

    await client.query('COMMIT');

    logger.info(`[Cron] Auto-renewal completed: ${renewed} renewed, ${failed} failed, ${notifications} notifications sent`);
    return { renewed, failed, notifications };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[Cron] Error processing auto-renewal rentals:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send reminder notifications for rentals expiring in 3 days (without auto-renewal)
 */
async function sendExpirationReminders() {
  try {
    // Find rentals expiring in 3 days without auto-renewal
    const result = await pool.query(`
      SELECT
        r.id,
        r.tenant_id,
        r.slots_count,
        r.slot_type,
        r.expires_at,
        s.site_name
      FROM site_slot_rentals r
      JOIN sites s ON s.id = r.site_id
      WHERE r.status = 'active'
        AND r.auto_renewal = false
        AND r.expires_at > NOW() + INTERVAL '2 days'
        AND r.expires_at < NOW() + INTERVAL '4 days'
    `);

    if (result.rows.length === 0) {
      return { reminders: 0 };
    }

    let reminders = 0;

    for (const rental of result.rows) {
      await notificationService.create({
        userId: rental.tenant_id,
        type: 'rental_expiring_soon',
        title: 'Аренда скоро истекает',
        message: `Аренда ${rental.slots_count} слотов на сайте "${rental.site_name}" истекает ${new Date(rental.expires_at).toLocaleDateString('ru-RU')}. Включите автопродление или продлите вручную.`,
        metadata: {
          rental_id: rental.id,
          expires_at: rental.expires_at
        }
      });
      reminders++;
    }

    logger.info(`[Cron] Sent ${reminders} expiration reminders`);
    return { reminders };

  } catch (error) {
    logger.error('[Cron] Error sending expiration reminders:', error);
    return { reminders: 0 };
  }
}

/**
 * Initialize auto-renewal cron
 * Runs daily at 08:00 UTC
 */
function initAutoRenewalRentalsCron() {
  // Run daily at 08:00 UTC
  cron.schedule('0 8 * * *', async () => {
    try {
      logger.info('[Cron] Starting auto-renewal rentals job');

      // Process auto-renewals
      const renewalResult = await processAutoRenewalRentals();

      // Send expiration reminders
      const reminderResult = await sendExpirationReminders();

      logger.info(
        `[Cron] Auto-renewal job completed: ${renewalResult.renewed} renewed, ${renewalResult.failed} failed, ${reminderResult.reminders} reminders`
      );
    } catch (error) {
      logger.error('[Cron] Auto-renewal rentals cron failed:', error);
    }
  });

  logger.info('[Cron] Auto-renewal rentals cron initialized (runs daily at 08:00 UTC)');
}

module.exports = {
  initAutoRenewalRentalsCron,
  processAutoRenewalRentals, // Export for manual testing
  sendExpirationReminders
};
