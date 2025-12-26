const cron = require('node-cron');
const { pool } = require('../config/database');
const logger = require('../config/logger');
const notificationService = require('../services/notification.service');

/**
 * Process expired rentals:
 * 1. Find active rentals where expires_at < NOW()
 * 2. Update status to 'expired'
 * 3. Decrement slots_used on sites table
 * 4. Create notifications for owner and tenant
 * 5. Log history action
 */
async function processExpiredRentals() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find all expired rentals that are still active
    const expiredRentals = await client.query(`
      SELECT
        r.id,
        r.site_id,
        r.owner_id,
        r.tenant_id,
        r.slot_type,
        r.slot_count,
        s.name as site_name,
        s.url as site_url
      FROM site_slot_rentals r
      JOIN sites s ON s.id = r.site_id
      WHERE r.status = 'active'
        AND r.expires_at < NOW()
      FOR UPDATE OF r
    `);

    if (expiredRentals.rows.length === 0) {
      logger.info('[Cron] No expired rentals to process');
      await client.query('COMMIT');
      return { processed: 0 };
    }

    logger.info(`[Cron] Processing ${expiredRentals.rows.length} expired rentals`);

    for (const rental of expiredRentals.rows) {
      // 1. Update rental status to expired
      await client.query(
        `UPDATE site_slot_rentals
         SET status = 'expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [rental.id]
      );

      // 2. Decrement used slots on site
      const slotColumn = rental.slot_type === 'link' ? 'used_links' : 'used_articles';
      await client.query(
        `UPDATE sites
         SET ${slotColumn} = GREATEST(0, ${slotColumn} - $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [rental.slot_count, rental.site_id]
      );

      // 3. Log history action
      await client.query(
        `UPDATE site_slot_rentals
         SET history = COALESCE(history, '[]'::jsonb) || jsonb_build_object(
           'action', 'expired_by_cron',
           'timestamp', NOW(),
           'details', jsonb_build_object(
             'slots_released', $1,
             'slot_type', $2
           )
         )::jsonb
         WHERE id = $3`,
        [rental.slot_count, rental.slot_type, rental.id]
      );

      // 4. Create notifications for owner and tenant
      const notificationData = {
        site_name: rental.site_name,
        site_url: rental.site_url,
        slot_count: rental.slot_count,
        slot_type: rental.slot_type === 'link' ? 'ссылок' : 'статей'
      };

      // Notify site owner
      await notificationService.create({
        userId: rental.owner_id,
        type: 'rental_expired_owner',
        title: 'Аренда завершена',
        message: `Аренда ${notificationData.slot_count} ${notificationData.slot_type} на сайте "${notificationData.site_name}" истекла. Слоты освобождены.`,
        metadata: { rental_id: rental.id, ...notificationData }
      });

      // Notify tenant
      await notificationService.create({
        userId: rental.tenant_id,
        type: 'rental_expired_tenant',
        title: 'Аренда завершена',
        message: `Аренда ${notificationData.slot_count} ${notificationData.slot_type} на сайте "${notificationData.site_name}" истекла.`,
        metadata: { rental_id: rental.id, ...notificationData }
      });

      logger.info(
        `[Cron] Expired rental ${rental.id}: Released ${rental.slot_count} ${rental.slot_type} slots on site ${rental.site_id}`
      );
    }

    await client.query('COMMIT');

    logger.info(`[Cron] Successfully processed ${expiredRentals.rows.length} expired rentals`);
    return { processed: expiredRentals.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[Cron] Error processing expired rentals:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Initialize rental expiration cron
 * Runs every 15 minutes
 */
function initRentalExpirationCron() {
  // Run every 15 minutes: */15 * * * *
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await processExpiredRentals();
      logger.info(`[Cron] Rental expiration check completed: ${result.processed} rentals expired`);
    } catch (error) {
      logger.error('[Cron] Rental expiration cron failed:', error);
    }
  });

  logger.info('[Cron] Rental expiration cron initialized (runs every 15 minutes)');
}

module.exports = {
  initRentalExpirationCron,
  processExpiredRentals // Export for manual testing
};
