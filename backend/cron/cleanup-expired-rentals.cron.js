const cron = require('node-cron');
const { pool } = require('../config/database');
const logger = require('../config/logger');
const notificationService = require('../services/notification.service');
const wordpressRentalService = require('../services/wordpress-rental.service');

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
        r.slots_count,
        r.expires_at,
        s.name as site_name,
        s.url as site_url,
        s.api_key
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
      // 1. Get linked placements before deletion (for quota restoration)
      const linkedPlacements = await client.query(
        `SELECT p.id, p.type, p.site_id
         FROM placements p
         JOIN rental_placements rp ON rp.placement_id = p.id
         WHERE rp.rental_id = $1`,
        [rental.id]
      );

      // 2. Delete placement_content for linked placements
      if (linkedPlacements.rows.length > 0) {
        const placementIds = linkedPlacements.rows.map((p) => p.id);

        // Get content IDs for usage_count restoration
        const contentResult = await client.query(
          `SELECT placement_id, link_id, article_id
           FROM placement_content
           WHERE placement_id = ANY($1)`,
          [placementIds]
        );

        // Restore usage_count for links and articles
        for (const content of contentResult.rows) {
          if (content.link_id) {
            await client.query(
              `UPDATE project_links
               SET usage_count = GREATEST(0, usage_count - 1)
               WHERE id = $1`,
              [content.link_id]
            );
          }
          if (content.article_id) {
            await client.query(
              `UPDATE project_articles
               SET usage_count = GREATEST(0, usage_count - 1)
               WHERE id = $1`,
              [content.article_id]
            );
          }
        }

        // Delete placement_content
        await client.query(`DELETE FROM placement_content WHERE placement_id = ANY($1)`, [
          placementIds
        ]);

        // Delete rental_placements (junction table)
        await client.query(`DELETE FROM rental_placements WHERE rental_id = $1`, [rental.id]);

        // Delete placements
        await client.query(`DELETE FROM placements WHERE id = ANY($1)`, [placementIds]);

        logger.info(
          `[Cron] Deleted ${placementIds.length} rental placements for expired rental ${rental.id}`
        );
      }

      // 3. Update rental status to expired
      await client.query(
        `UPDATE site_slot_rentals
         SET status = 'expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [rental.id]
      );

      // 4. Decrement used slots on site (for slots + deleted placements)
      const slotColumn = rental.slot_type === 'link' ? 'used_links' : 'used_articles';
      const totalSlotsToRelease = rental.slots_count;
      await client.query(
        `UPDATE sites
         SET ${slotColumn} = GREATEST(0, ${slotColumn} - $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [totalSlotsToRelease, rental.site_id]
      );

      // 5. Log history action
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

      // 6. Create notifications for owner and tenant
      const deletedPlacementsCount = linkedPlacements.rows.length;
      const notificationData = {
        site_name: rental.site_name,
        site_url: rental.site_url,
        slot_count: rental.slot_count,
        slot_type: rental.slot_type === 'link' ? 'ссылок' : 'статей',
        deleted_placements: deletedPlacementsCount
      };

      const placementsDeletedMessage =
        deletedPlacementsCount > 0 ? ` Удалено ${deletedPlacementsCount} размещений.` : '';

      // Notify site owner
      await notificationService.create({
        userId: rental.owner_id,
        type: 'rental_expired_owner',
        title: 'Аренда завершена',
        message: `Аренда ${notificationData.slot_count} ${notificationData.slot_type} на сайте "${notificationData.site_name}" истекла. Слоты освобождены.${placementsDeletedMessage}`,
        metadata: { rental_id: rental.id, ...notificationData }
      });

      // Notify tenant
      await notificationService.create({
        userId: rental.tenant_id,
        type: 'rental_expired_tenant',
        title: 'Аренда завершена',
        message: `Аренда ${notificationData.slot_count} ${notificationData.slot_type} на сайте "${notificationData.site_name}" истекла.${placementsDeletedMessage}`,
        metadata: { rental_id: rental.id, ...notificationData }
      });

      // Send webhook to WordPress site (optional - won't break if fails)
      if (rental.api_key) {
        const webhookResult = await wordpressRentalService.notifyRentalStatusChange(
          rental.site_url,
          rental.api_key,
          {
            id: rental.id,
            slot_type: rental.slot_type,
            slot_count: rental.slot_count,
            tenant_id: rental.tenant_id,
            expires_at: rental.expires_at,
            status: 'expired'
          },
          'expired'
        );

        if (!webhookResult.success) {
          logger.warn(`[Cron] WordPress webhook failed for expired rental ${rental.id}`);
        }
      }

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
