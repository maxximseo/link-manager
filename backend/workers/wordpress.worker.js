/**
 * WordPress worker for background article publishing
 *
 * This worker processes article publication jobs in the background queue.
 * It uses wordpressService.publishArticle() for actual WordPress API calls.
 *
 * Job data structure:
 * {
 *   placements: [
 *     {
 *       placementId: number,
 *       siteId: number,
 *       siteUrl: string,
 *       apiKey: string,
 *       articleId: number,
 *       title: string,
 *       content: string,
 *       slug: string
 *     }
 *   ]
 * }
 */

const logger = require('../config/logger');
const { query, pool } = require('../config/database');
const wordpressService = require('../services/wordpress.service');
const cache = require('../services/cache.service');

module.exports = async function wordpressWorker(job) {
  const startTime = Date.now();
  const { placements } = job.data;

  if (!placements || !Array.isArray(placements) || placements.length === 0) {
    logger.warn('WordPress worker received empty placements array', { jobId: job.id });
    return { success: true, processed: 0, results: [] };
  }

  logger.info('WordPress worker started', {
    jobId: job.id,
    placementsCount: placements.length
  });

  job.progress(5);

  const results = [];
  const successCount = { published: 0, failed: 0 };

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const { placementId, siteId, siteUrl, apiKey, articleId, title, content, slug } = placement;

    try {
      logger.debug('Publishing article to WordPress', {
        jobId: job.id,
        placementId,
        siteId,
        articleId,
        title
      });

      // Call WordPress service to publish article
      const publishResult = await wordpressService.publishArticle(siteUrl, apiKey, {
        title,
        content,
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      });

      if (publishResult.success && publishResult.post_id) {
        // Update placement with WordPress post ID in transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Update placement status and wordpress_post_id
          await client.query(
            `UPDATE placements
             SET status = 'placed',
                 wordpress_post_id = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [publishResult.post_id, placementId]
          );

          await client.query('COMMIT');

          results.push({
            placementId,
            siteId,
            articleId,
            success: true,
            wordpress_post_id: publishResult.post_id,
            url: publishResult.url
          });

          successCount.published++;

          logger.info('Article published successfully via worker', {
            jobId: job.id,
            placementId,
            siteId,
            articleId,
            wordpress_post_id: publishResult.post_id
          });
        } catch (dbError) {
          await client.query('ROLLBACK');
          throw dbError;
        } finally {
          client.release();
        }
      } else {
        throw new Error(publishResult.error || 'Unknown publishing error');
      }
    } catch (error) {
      // Mark placement as failed
      try {
        await query(
          `UPDATE placements
           SET status = 'failed',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [placementId]
        );
      } catch (updateError) {
        logger.error('Failed to update placement status to failed', {
          placementId,
          error: updateError.message
        });
      }

      results.push({
        placementId,
        siteId,
        articleId,
        success: false,
        error: error.message
      });

      successCount.failed++;

      logger.error('WordPress publishing failed via worker', {
        jobId: job.id,
        placementId,
        siteId,
        articleId,
        error: error.message
      });
    }

    // Update progress (5% reserved for init, 90% for processing, 5% for cleanup)
    const progress = Math.floor(5 + ((i + 1) / placements.length) * 90);
    job.progress(progress);
  }

  // Invalidate cache for affected sites
  try {
    const affectedApiKeys = [...new Set(placements.map(p => p.apiKey).filter(Boolean))];
    for (const apiKey of affectedApiKeys) {
      await cache.del(`wp:content:${apiKey}`);
    }
    logger.debug('Cache invalidated for affected sites', {
      jobId: job.id,
      apiKeysCount: affectedApiKeys.length
    });
  } catch (cacheError) {
    logger.warn('Cache invalidation failed', {
      jobId: job.id,
      error: cacheError.message
    });
  }

  job.progress(100);

  const duration = Date.now() - startTime;

  logger.info('WordPress worker completed', {
    jobId: job.id,
    duration: `${duration}ms`,
    total: placements.length,
    published: successCount.published,
    failed: successCount.failed
  });

  return {
    success: successCount.failed === 0,
    processed: placements.length,
    published: successCount.published,
    failed: successCount.failed,
    duration,
    results
  };
};
