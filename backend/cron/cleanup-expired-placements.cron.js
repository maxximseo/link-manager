/**
 * Cleanup expired placements cron job
 * Runs daily at 01:00 to delete placements that have expired
 */

const cron = require('node-cron');
const { pool, query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Delete expired placements and clean up related data
 */
async function cleanupExpiredPlacements() {
  logger.info('Starting expired placements cleanup...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find all expired placements (expires_at < NOW() and status = 'placed')
    const expiredResult = await client.query(`
      SELECT p.id, p.user_id, p.site_id, p.project_id, p.type, p.expires_at,
             s.site_name, pr.name as project_name
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.status = 'placed'
        AND p.expires_at IS NOT NULL
        AND p.expires_at < NOW()
    `);

    const expiredPlacements = expiredResult.rows;

    if (expiredPlacements.length === 0) {
      logger.info('No expired placements found');
      await client.query('COMMIT');
      return { deleted: 0 };
    }

    logger.info(`Found ${expiredPlacements.length} expired placements to delete`);

    const placementIds = expiredPlacements.map(p => p.id);

    // Get content IDs before deletion for quota restoration
    const contentResult = await client.query(`
      SELECT placement_id, link_id, article_id
      FROM placement_content
      WHERE placement_id = ANY($1)
    `, [placementIds]);

    // Restore usage_count for links and articles
    for (const content of contentResult.rows) {
      if (content.link_id) {
        await client.query(`
          UPDATE project_links
          SET usage_count = GREATEST(0, usage_count - 1)
          WHERE id = $1
        `, [content.link_id]);
      }
      if (content.article_id) {
        await client.query(`
          UPDATE project_articles
          SET usage_count = GREATEST(0, usage_count - 1)
          WHERE id = $1
        `, [content.article_id]);
      }
    }

    // Restore site quotas
    for (const placement of expiredPlacements) {
      if (placement.type === 'link') {
        await client.query(`
          UPDATE sites
          SET used_links = GREATEST(0, used_links - 1)
          WHERE id = $1
        `, [placement.site_id]);
      } else if (placement.type === 'article') {
        await client.query(`
          UPDATE sites
          SET used_articles = GREATEST(0, used_articles - 1)
          WHERE id = $1
        `, [placement.site_id]);
      }
    }

    // Delete placement_content records
    await client.query(`
      DELETE FROM placement_content
      WHERE placement_id = ANY($1)
    `, [placementIds]);

    // Delete placements
    await client.query(`
      DELETE FROM placements
      WHERE id = ANY($1)
    `, [placementIds]);

    // Send notifications to users about deleted placements
    const notificationValues = [];
    const notificationParams = [];
    let paramIndex = 1;

    for (const placement of expiredPlacements) {
      notificationValues.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
      );
      notificationParams.push(
        placement.user_id,
        'placement_expired',
        'Размещение истекло',
        `Размещение #${placement.id} на сайте "${placement.site_name}" (проект "${placement.project_name}") истекло ${new Date(placement.expires_at).toLocaleDateString('ru-RU')} и было удалено из системы.`,
        JSON.stringify({ placement_id: placement.id, site_id: placement.site_id, project_id: placement.project_id })
      );
      paramIndex += 5;
    }

    if (notificationValues.length > 0) {
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, metadata)
        VALUES ${notificationValues.join(', ')}
      `, notificationParams);
    }

    await client.query('COMMIT');

    logger.info('Expired placements cleanup completed', {
      deleted: expiredPlacements.length,
      placementIds
    });

    return { deleted: expiredPlacements.length, placementIds };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Expired placements cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Initialize cron job
 */
function initExpiredPlacementsCleanupCron() {
  // Run cleanup daily at 01:00 UTC
  cron.schedule('0 1 * * *', async () => {
    logger.info('Expired placements cleanup cron job triggered');
    try {
      await cleanupExpiredPlacements();
    } catch (error) {
      logger.error('Expired placements cleanup cron job failed', { error: error.message });
    }
  });

  logger.info('Expired placements cleanup cron job scheduled (daily at 01:00 UTC)');
}

module.exports = {
  initExpiredPlacementsCleanupCron,
  cleanupExpiredPlacements
};
