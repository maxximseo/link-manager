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

  try {
    const now = new Date();

    // Find all scheduled placements that are due for publication
    const result = await query(
      `
      SELECT p.*, s.api_key, s.site_url, s.site_name
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      WHERE p.status = 'scheduled'
        AND p.scheduled_publish_date <= $1
      ORDER BY p.scheduled_publish_date ASC
    `,
      [now]
    );

    const placements = result.rows;
    logger.info(`Found ${placements.length} scheduled placements due for publication`);

    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY_LIMIT = 5; // Limit parallel WordPress HTTP calls

    // Helper function to process a single placement
    const processPlacement = async placement => {
      const placementClient = await pool.connect();
      try {
        logger.info('Processing scheduled placement', {
          placementId: placement.id,
          userId: placement.user_id,
          scheduledDate: placement.scheduled_publish_date,
          type: placement.type
        });

        await placementClient.query('BEGIN');

        // Get content
        const contentResult = await placementClient.query(
          `
          SELECT
            pc.*,
            pl.url, pl.anchor_text,
            pa.title, pa.content
          FROM placement_content pc
          LEFT JOIN project_links pl ON pc.link_id = pl.id
          LEFT JOIN project_articles pa ON pc.article_id = pa.id
          WHERE pc.placement_id = $1
        `,
          [placement.id]
        );

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

          // FIXED: Correct parameter order for publishArticle(siteUrl, apiKey, articleData)
          const publishResult = await wordpressService.publishArticle(
            placement.site_url,
            placement.api_key,
            {
              title: content.title,
              content: content.content,
              slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            }
          );

          // Update placement status
          await placementClient.query(
            `
            UPDATE placements
            SET status = 'placed',
                published_at = NOW(),
                wordpress_post_id = $1,
                updated_at = NOW()
            WHERE id = $2
          `,
            [publishResult.post_id, placement.id]
          );

          logger.info('Article published successfully', {
            placementId: placement.id,
            wordpressPostId: publishResult.post_id
          });
        } else if (placement.type === 'link' && content.link_id) {
          // For links, just mark as placed (WordPress plugin will display them)
          await placementClient.query(
            `
            UPDATE placements
            SET status = 'placed',
                published_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `,
            [placement.id]
          );

          logger.info('Link placement marked as placed', {
            placementId: placement.id
          });
        }

        // Send notification to user
        await placementClient.query(
          `
          INSERT INTO notifications (user_id, type, title, message)
          VALUES ($1, 'placement_published', $2, $3)
        `,
          [
            placement.user_id,
            'Размещение опубликовано',
            `Запланированное размещение #${placement.id} на сайте "${placement.site_name}" успешно опубликовано.`
          ]
        );

        // Send notification to other admins (exclude placement owner to avoid duplicates)
        await placementClient.query(
          `
          INSERT INTO notifications (user_id, type, title, message, metadata)
          SELECT id, 'admin_placement_published', $1, $2, $3
          FROM users WHERE role = 'admin' AND id != $4
        `,
          [
            'Размещение опубликовано',
            `Запланированное размещение #${placement.id} на сайте "${placement.site_name}" успешно опубликовано (${placement.type}).`,
            JSON.stringify({
              placementId: placement.id,
              type: placement.type,
              siteId: placement.site_id,
              siteName: placement.site_name,
              userId: placement.user_id
            }),
            placement.user_id
          ]
        );

        await placementClient.query('COMMIT');
        return { success: true };
      } catch (error) {
        await placementClient.query('ROLLBACK');

        logger.error('Failed to publish scheduled placement', {
          placementId: placement.id,
          userId: placement.user_id,
          error: error.message,
          stack: error.stack
        });

        // CRITICAL FIX (BUG #6): Refund money on scheduled placement failure
        try {
          // Get placement details for refund
          const placementResult = await query(
            `
            SELECT final_price, user_id
            FROM placements
            WHERE id = $1
          `,
            [placement.id]
          );

          const placementData = placementResult.rows[0];
          const refundAmount = parseFloat(placementData.final_price || 0);

          if (refundAmount > 0) {
            // Use atomic delete and refund operation from billing service
            // SYSTEM: Cron jobs run as 'admin' to perform automatic cleanup
            const billingService = require('../services/billing.service');
            await billingService.deleteAndRefundPlacement(
              placement.id,
              placementData.user_id,
              'admin'
            );

            logger.info('Scheduled placement failed - automatic refund issued', {
              placementId: placement.id,
              userId: placementData.user_id,
              refundAmount
            });

            // Send notification about failure WITH refund (no technical details for user)
            await query(
              `
              INSERT INTO notifications (user_id, type, title, message)
              VALUES ($1, 'placement_failed_refund', $2, $3)
            `,
              [
                placement.user_id,
                'Возврат средств',
                `Размещение #${placement.id} на сайте "${placement.site_name}" не удалось опубликовать. ` +
                  `Сумма $${refundAmount.toFixed(2)} автоматически возвращена на ваш баланс.`
              ]
            );
          } else {
            // No refund needed (free placement or already refunded)
            await query(
              `
              UPDATE placements
              SET status = 'failed',
                  updated_at = NOW()
              WHERE id = $1
            `,
              [placement.id]
            );

            // Send notification about failure (no refund, no technical details)
            await query(
              `
              INSERT INTO notifications (user_id, type, title, message)
              VALUES ($1, 'placement_failed', $2, $3)
            `,
              [
                placement.user_id,
                'Ошибка публикации',
                `Размещение #${placement.id} на сайте "${placement.site_name}" не удалось опубликовать. Обратитесь в поддержку.`
              ]
            );
          }
        } catch (refundError) {
          logger.error('Failed to refund scheduled placement', {
            placementId: placement.id,
            userId: placement.user_id,
            error: refundError.message,
            stack: refundError.stack
          });

          // Fallback: at least mark as failed
          try {
            await query(
              `
              UPDATE placements
              SET status = 'failed',
                  updated_at = NOW()
              WHERE id = $1
            `,
              [placement.id]
            );
          } catch (updateError) {
            logger.error('Failed to update placement status to failed', {
              placementId: placement.id,
              error: updateError.message
            });
          }
        }

        return { success: false };
      } finally {
        placementClient.release();
      }
    };

    // Process placements in parallel chunks
    for (let i = 0; i < placements.length; i += CONCURRENCY_LIMIT) {
      const chunk = placements.slice(i, i + CONCURRENCY_LIMIT);

      const chunkResults = await Promise.allSettled(
        chunk.map(placement => processPlacement(placement))
      );

      // Count results
      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failCount++;
        }
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
