/**
 * Scheduled placements cron job
 * Runs hourly to publish placements scheduled for publication
 */

const cron = require('node-cron');
const { query, pool } = require('../config/database');
const logger = require('../config/logger');
const wordpressService = require('../services/wordpress.service');

/**
 * Process scheduled placements that are due for publication
 */
async function processScheduledPlacements() {
  logger.info('Starting scheduled placements processing...');

  const client = await pool.connect();

  try {
    const now = new Date();

    // Find all scheduled placements that are due for publication
    const result = await query(`
      SELECT p.*, s.api_key, s.site_url, s.site_name
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      WHERE p.status = 'scheduled'
        AND p.scheduled_publish_date <= $1
      ORDER BY p.scheduled_publish_date ASC
    `, [now]);

    const placements = result.rows;
    logger.info(`Found ${placements.length} scheduled placements due for publication`);

    let successCount = 0;
    let failCount = 0;

    for (const placement of placements) {
      try {
        logger.info('Processing scheduled placement', {
          placementId: placement.id,
          userId: placement.user_id,
          scheduledDate: placement.scheduled_publish_date,
          type: placement.type
        });

        await client.query('BEGIN');

        // Get content
        const contentResult = await client.query(`
          SELECT
            pc.*,
            pl.url, pl.anchor_text,
            pa.title, pa.content
          FROM placement_content pc
          LEFT JOIN project_links pl ON pc.link_id = pl.id
          LEFT JOIN project_articles pa ON pc.article_id = pa.id
          WHERE pc.placement_id = $1
        `, [placement.id]);

        const content = contentResult.rows[0];

        if (!content) {
          throw new Error('No content found for placement');
        }

        // Publish to WordPress
        if (placement.type === 'article' && content.article_id) {
          logger.info('Publishing article to WordPress', {
            placementId: placement.id,
            siteUrl: placement.site_url
          });

          const publishResult = await wordpressService.publishArticle(
            placement.api_key,
            content.title,
            content.content,
            placement.site_url
          );

          // Update placement status
          await client.query(`
            UPDATE placements
            SET status = 'placed',
                published_at = NOW(),
                wordpress_post_id = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [publishResult.post_id, placement.id]);

          logger.info('Article published successfully', {
            placementId: placement.id,
            wordpressPostId: publishResult.post_id
          });

        } else if (placement.type === 'link' && content.link_id) {
          // For links, just mark as placed (WordPress plugin will display them)
          await client.query(`
            UPDATE placements
            SET status = 'placed',
                published_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `, [placement.id]);

          logger.info('Link placement marked as placed', {
            placementId: placement.id
          });
        }

        // Send notification to user
        await client.query(`
          INSERT INTO notifications (user_id, type, title, message)
          VALUES ($1, 'placement_published', $2, $3)
        `, [
          placement.user_id,
          'Размещение опубликовано',
          `Запланированное размещение #${placement.id} на сайте "${placement.site_name}" успешно опубликовано.`
        ]);

        await client.query('COMMIT');

        successCount++;

      } catch (error) {
        await client.query('ROLLBACK');

        logger.error('Failed to publish scheduled placement', {
          placementId: placement.id,
          userId: placement.user_id,
          error: error.message,
          stack: error.stack
        });

        // Update placement status to failed
        try {
          await query(`
            UPDATE placements
            SET status = 'failed',
                updated_at = NOW()
            WHERE id = $1
          `, [placement.id]);

          // Send notification about failure
          await query(`
            INSERT INTO notifications (user_id, type, title, message)
            VALUES ($1, 'placement_failed', $2, $3)
          `, [
            placement.user_id,
            'Ошибка публикации',
            `Не удалось опубликовать запланированное размещение #${placement.id}. ` +
            `Причина: ${error.message}. Пожалуйста, свяжитесь с поддержкой.`
          ]);

        } catch (notifyError) {
          logger.error('Failed to send notification about failed placement', {
            placementId: placement.id,
            error: notifyError.message
          });
        }

        failCount++;
      }
    }

    logger.info('Scheduled placements processing completed', {
      total: placements.length,
      success: successCount,
      failed: failCount
    });

    return { total: placements.length, success: successCount, failed: failCount };

  } catch (error) {
    logger.error('Scheduled placements processing failed', {
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
function initScheduledPlacementsCron() {
  // Run scheduled placements processing every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Scheduled placements cron job triggered');
    try {
      await processScheduledPlacements();
    } catch (error) {
      logger.error('Scheduled placements cron job failed', { error: error.message });
    }
  });

  logger.info('Scheduled placements cron job initialized (runs hourly)');
}

module.exports = {
  initScheduledPlacementsCron,
  processScheduledPlacements
};
