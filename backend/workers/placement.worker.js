/**
 * Placement worker for async batch operations
 * Handles creation of placements across multiple sites with round-robin distribution
 */

const logger = require('../config/logger');
const placementService = require('../services/placement.service');

module.exports = async function placementWorker(job) {
  const { jobId, userId, project_id, site_ids, link_ids = [], article_ids = [] } = job.data;

  logger.info('Starting async batch placement job', {
    jobId,
    userId,
    projectId: project_id,
    siteCount: site_ids.length,
    linkCount: link_ids.length,
    articleCount: article_ids.length
  });

  // Initialize progress
  await job.progress({
    percent: 0,
    processed: 0,
    total: site_ids.length,
    successful: 0,
    failed: 0
  });

  const results = [];
  const errors = [];

  try {
    // Pre-flight validation (5% progress)
    const { query } = require('../config/database');
    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, userId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found or access denied');
    }

    await job.progress({
      percent: 5,
      processed: 0,
      total: site_ids.length,
      successful: 0,
      failed: 0,
      stage: 'Validating project...'
    });

    // Distribute links and articles across sites (round-robin)
    const numSites = site_ids.length;
    let linkIndex = 0;
    let articleIndex = 0;

    for (let i = 0; i < numSites; i++) {
      const site_id = site_ids[i];

      // Assign 1 link per site (round-robin)
      const assignedLinks = [];
      if (linkIndex < link_ids.length) {
        assignedLinks.push(link_ids[linkIndex]);
        linkIndex++;
      }

      // Assign 1 article per site (round-robin)
      const assignedArticles = [];
      if (articleIndex < article_ids.length) {
        assignedArticles.push(article_ids[articleIndex]);
        articleIndex++;
      }

      // Skip if nothing to place on this site
      if (assignedLinks.length === 0 && assignedArticles.length === 0) {
        continue;
      }

      try {
        // Get site name for logging
        const siteInfo = await query(
          'SELECT site_name FROM sites WHERE id = $1',
          [site_id]
        );
        const siteName = siteInfo.rows[0]?.site_name || `Site ${site_id}`;

        // Create placement using existing service
        const placement = await placementService.createPlacement({
          site_id,
          project_id,
          link_ids: assignedLinks,
          article_ids: assignedArticles,
          userId
        });

        results.push({
          site_id,
          site_name: siteName,
          placement_id: placement.id,
          links_placed: assignedLinks.length,
          articles_placed: assignedArticles.length,
          success: true
        });

        logger.debug('Placement created in worker', {
          jobId,
          site_id,
          siteName,
          placementId: placement.id,
          links: assignedLinks.length,
          articles: assignedArticles.length
        });

      } catch (error) {
        errors.push({
          site_id,
          error: error.message
        });

        logger.warn('Failed to create placement in worker', {
          jobId,
          site_id,
          error: error.message
        });
      }

      // Update progress
      const percent = Math.floor(((i + 1) / numSites) * 90) + 10;
      await job.progress({
        percent,
        processed: i + 1,
        total: numSites,
        successful: results.length,
        failed: errors.length,
        stage: `Processing site ${i + 1}/${numSites}...`
      });

      // Small delay to prevent overwhelming system (300ms per site)
      if (i < numSites - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Final progress update
    await job.progress({
      percent: 100,
      processed: numSites,
      total: numSites,
      successful: results.length,
      failed: errors.length,
      stage: 'Completed'
    });

    const summary = {
      success: true,
      total_sites: numSites,
      successful: results.length,
      failed: errors.length,
      distribution: {
        links_distributed: linkIndex,
        articles_distributed: articleIndex
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    };

    logger.info('Async batch placement job completed', {
      jobId,
      userId,
      projectId: project_id,
      totalSites: numSites,
      successful: results.length,
      failed: errors.length,
      linksDistributed: linkIndex,
      articlesDistributed: articleIndex
    });

    return summary;

  } catch (error) {
    logger.error('Async batch placement job failed', {
      jobId,
      userId,
      error: error.message,
      stack: error.stack,
      successful: results.length,
      failed: errors.length
    });

    // Return partial results if some sites were processed
    if (results.length > 0) {
      return {
        success: false,
        error: error.message,
        total_sites: site_ids.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      };
    }

    throw error;
  }
};
