/**
 * Placement controller
 * Handles placement-related business logic
 */

const placementService = require('../services/placement.service');
const logger = require('../config/logger');
const queueService = require('../config/queue');
const crypto = require('crypto');
const { validatePagination } = require('../utils/validators');

// Get all placements for user
const getPlacements = async (req, res) => {
  try {
    const { page, limit } = validatePagination(req.query, {
      maxLimit: 5000,
      defaultLimit: 20,
      defaultPage: 1
    });

    const { project_id, status } = req.query;

    const result = await placementService.getUserPlacements(req.user.id, page, limit, {
      project_id,
      status
    });

    res.json(result);
  } catch (error) {
    logger.error('Get placements error:', error);

    if (error.message.includes('Page number') || error.message.includes('Limit cannot')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to fetch placements' });
  }
};

// Get placements for a specific site (for site deletion warning)
const getPlacementsBySite = async (req, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    const userId = req.user.id;

    if (isNaN(siteId)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }

    // Get placements with financial information
    const { query } = require('../config/database');
    const result = await query(
      `
      SELECT
        p.id,
        p.user_id,
        p.project_id,
        p.site_id,
        p.type,
        p.final_price,
        p.original_price,
        p.discount_applied,
        p.status,
        p.purchased_at,
        proj.name as project_name
      FROM placements p
      INNER JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.site_id = $1 AND s.user_id = $2
      ORDER BY p.purchased_at DESC
    `,
      [siteId, userId]
    );

    // Calculate totals
    let totalRefund = 0;
    let paidCount = 0;

    result.rows.forEach(placement => {
      const price = parseFloat(placement.final_price || 0);
      if (price > 0) {
        totalRefund += price;
        paidCount++;
      }
    });

    res.json({
      placements: result.rows,
      summary: {
        total: result.rows.length,
        paidCount,
        totalRefund
      }
    });
  } catch (error) {
    logger.error('Get placements by site error:', error);
    res.status(500).json({ error: 'Failed to fetch placements' });
  }
};

// Get single placement
const getPlacement = async (req, res) => {
  try {
    // SECURITY: Validate placementId as integer
    const placementId = parseInt(req.params.id, 10);
    if (isNaN(placementId) || placementId <= 0) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }
    const userId = req.user.id;

    const placement = await placementService.getPlacementById(placementId, userId);

    if (!placement) {
      return res.status(404).json({ error: 'Placement not found' });
    }

    res.json(placement);
  } catch (error) {
    logger.error('Get placement error:', error);
    res.status(500).json({ error: 'Failed to fetch placement' });
  }
};

// Create batch placement - universal for 1+ sites with validation
const createBatchPlacement = async (req, res) => {
  try {
    const { project_id, site_ids = [], link_ids = [], article_ids = [] } = req.body;

    // Input validation
    if (!project_id || !site_ids || !Array.isArray(site_ids) || site_ids.length === 0) {
      return res.status(400).json({
        error: 'Invalid input: project_id and non-empty site_ids array are required'
      });
    }

    if (!Array.isArray(link_ids) || !Array.isArray(article_ids)) {
      return res.status(400).json({
        error: 'Invalid input: link_ids and article_ids must be arrays'
      });
    }

    if (link_ids.length === 0 && article_ids.length === 0) {
      return res.status(400).json({
        error: 'At least one link or article must be specified'
      });
    }

    // Validate array length limits to prevent DoS
    const MAX_SITES_PER_BATCH = 1000;
    const MAX_LINKS_PER_BATCH = 5000;
    const MAX_ARTICLES_PER_BATCH = 1000;

    if (site_ids.length > MAX_SITES_PER_BATCH) {
      return res.status(400).json({
        error: `Maximum ${MAX_SITES_PER_BATCH} sites per batch operation`
      });
    }

    if (link_ids.length > MAX_LINKS_PER_BATCH) {
      return res.status(400).json({
        error: `Maximum ${MAX_LINKS_PER_BATCH} links per batch operation`
      });
    }

    if (article_ids.length > MAX_ARTICLES_PER_BATCH) {
      return res.status(400).json({
        error: `Maximum ${MAX_ARTICLES_PER_BATCH} articles per batch operation`
      });
    }

    // Validate project existence and ownership BEFORE database operations
    const { query } = require('../config/database');
    const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [
      project_id,
      req.user.id
    ]);

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        error: `Project ${project_id} not found or access denied`
      });
    }

    // Validate sites existence and ownership BEFORE database operations
    const sitesCheck = await query('SELECT id FROM sites WHERE id = ANY($1) AND user_id = $2', [
      site_ids,
      req.user.id
    ]);

    const validSiteIds = sitesCheck.rows.map(row => row.id);
    const invalidSiteIds = site_ids.filter(id => !validSiteIds.includes(id));

    if (invalidSiteIds.length > 0) {
      return res.status(400).json({
        error: `Invalid or inaccessible site IDs: ${invalidSiteIds.join(', ')}`
      });
    }

    // Distribute links and articles across sites
    // Strategy: Round-robin distribution
    // Example: 2 sites, 2 links -> Site1 gets Link1, Site2 gets Link2
    const results = [];
    const errors = [];

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
        const placement = await placementService.createPlacement({
          site_id,
          project_id,
          link_ids: assignedLinks,
          article_ids: assignedArticles,
          userId: req.user.id
        });
        results.push(placement);
      } catch (error) {
        errors.push({ site_id, error: error.message });
        logger.warn('Failed to create placement for site', { site_id, error: error.message });
      }
    }

    res.json({
      message: `Successfully created ${results.length} placements for ${site_ids.length} sites`,
      placements: results,
      total_sites: site_ids.length,
      successful: results.length,
      failed: errors.length,
      distribution: {
        links_distributed: linkIndex,
        articles_distributed: articleIndex
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('Create batch placement error:', error);
    res.status(500).json({ error: 'Failed to create batch placement' });
  }
};

// Delete placement with atomic refund
const deletePlacement = async (req, res) => {
  try {
    // SECURITY: Validate placementId as integer
    const placementId = parseInt(req.params.id, 10);
    if (isNaN(placementId) || placementId <= 0) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }
    const userId = req.user.id;
    const userRole = req.user.role; // Admin or regular user

    // CRITICAL FIX: Use atomic delete with refund (single transaction)
    const billingService = require('../services/billing.service');

    // ADMIN-ONLY: Only administrators can delete placements (enforced by adminMiddleware)
    // This function handles BOTH refund AND delete in ONE transaction
    // Pass userRole so service knows admin can delete any placement
    const result = await billingService.deleteAndRefundPlacement(placementId, userId, userRole);

    // Build response
    const response = { message: 'Placement deleted successfully' };
    if (result.refunded) {
      response.refund = {
        amount: result.amount,
        newBalance: result.newBalance
      };
    }

    res.json(response);
  } catch (error) {
    logger.error('Delete placement error:', error);

    // More specific error messages
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Placement not found' });
    }
    if (error.message.includes('unauthorized')) {
      return res.status(403).json({ error: 'Unauthorized to delete this placement' });
    }

    res.status(500).json({ error: 'Failed to delete placement' });
  }
};

// Get placement statistics
const getStatistics = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await placementService.getStatistics(userId);
    res.json(stats);
  } catch (error) {
    logger.error('Get placement statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Get available sites for placement (with project filter)
const getAvailableSites = async (req, res) => {
  try {
    // SECURITY: Validate projectId as integer
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const userId = req.user.id;

    const sites = await placementService.getAvailableSites(projectId, userId);
    res.json(sites);
  } catch (error) {
    logger.error('Get available sites error:', error);
    res.status(500).json({ error: 'Failed to fetch available sites' });
  }
};

// Create batch placement asynchronously (for large batches)
const createBatchPlacementAsync = async (req, res) => {
  try {
    const { project_id, site_ids = [], link_ids = [], article_ids = [] } = req.body;

    // Input validation
    if (!project_id || !site_ids || !Array.isArray(site_ids) || site_ids.length === 0) {
      return res.status(400).json({
        error: 'Invalid input: project_id and non-empty site_ids array are required'
      });
    }

    if (!Array.isArray(link_ids) || !Array.isArray(article_ids)) {
      return res.status(400).json({
        error: 'Invalid input: link_ids and article_ids must be arrays'
      });
    }

    if (link_ids.length === 0 && article_ids.length === 0) {
      return res.status(400).json({
        error: 'At least one link or article must be specified'
      });
    }

    // Check if Bull Queue is available
    const placementQueue = queueService.createQueue('placement');
    if (!placementQueue) {
      return res.status(503).json({
        error:
          'Background job processing unavailable. Please use /api/placements/batch/create instead.',
        fallback_endpoint: '/api/placements/batch/create'
      });
    }

    // Generate job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    // Add job to queue
    const _job = await placementQueue.add(
      'batch-placement',
      {
        jobId,
        userId: req.user.id,
        project_id,
        site_ids,
        link_ids,
        article_ids,
        createdAt: new Date().toISOString()
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: false, // Keep completed jobs for status checks
        removeOnFail: false
      }
    );

    // Estimate time (conservative: 2-5 seconds per site)
    const estimatedSeconds = site_ids.length * 3;
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

    logger.info('Async batch placement job created', {
      jobId,
      userId: req.user.id,
      sites: site_ids.length,
      links: link_ids.length,
      articles: article_ids.length
    });

    res.json({
      job_id: jobId,
      status: 'queued',
      total_sites: site_ids.length,
      estimated_time:
        estimatedMinutes > 1 ? `${estimatedMinutes} minutes` : `${estimatedSeconds} seconds`,
      status_endpoint: `/api/placements/job/${jobId}`,
      cancel_endpoint: `/api/placements/job/${jobId}/cancel`
    });
  } catch (error) {
    logger.error('Create async batch placement error:', error);
    res.status(500).json({ error: 'Failed to queue batch placement' });
  }
};

// Get job status
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const placementQueue = queueService.createQueue('placement');
    if (!placementQueue) {
      return res.status(503).json({ error: 'Background job processing unavailable' });
    }

    const job = await placementQueue.getJob(jobId);

    // Return 404 for both non-existent AND unauthorized jobs (prevent enumeration)
    if (!job || job.data.userId !== req.user.id) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress();
    const failedReason = job.failedReason;
    const returnValue = job.returnvalue;

    let status = state;
    let results = null;
    let errors = null;

    if (state === 'completed') {
      status = 'completed';
      results = returnValue?.results || [];
      errors = returnValue?.errors || [];
    } else if (state === 'failed') {
      status = 'failed';
      errors = [{ error: failedReason }];
    } else if (state === 'active') {
      status = 'processing';
    } else if (state === 'waiting' || state === 'delayed') {
      status = 'queued';
    }

    res.json({
      job_id: jobId,
      status,
      progress: typeof progress === 'object' ? progress : { percent: 0 },
      total_sites: job.data.site_ids?.length || 0,
      successful: results?.length || 0,
      failed: errors?.length || 0,
      results,
      errors,
      created_at: job.data.createdAt
    });
  } catch (error) {
    logger.error('Get job status error:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
};

// Cancel job
const cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const placementQueue = queueService.createQueue('placement');
    if (!placementQueue) {
      return res.status(503).json({ error: 'Background job processing unavailable' });
    }

    const job = await placementQueue.getJob(jobId);

    // Return 404 for both non-existent AND unauthorized jobs (prevent enumeration)
    if (!job || job.data.userId !== req.user.id) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();

    if (state === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed job' });
    }

    if (state === 'failed') {
      return res.status(400).json({ error: 'Cannot cancel failed job' });
    }

    // Remove the job
    await job.remove();

    logger.info('Job cancelled', { jobId, userId: req.user.id });

    res.json({
      message: 'Job cancelled successfully',
      job_id: jobId
    });
  } catch (error) {
    logger.error('Cancel job error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
};

// Publish scheduled placement NOW (manual trigger)
const publishScheduledPlacement = async (req, res) => {
  try {
    const placementId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    if (isNaN(placementId)) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }

    const billingService = require('../services/billing.service');
    const result = await billingService.publishScheduledPlacement(placementId, userId);

    res.json(result);
  } catch (error) {
    logger.error('Publish scheduled placement error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Placement not found' });
    }
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({ error: 'Unauthorized to publish this placement' });
    }
    if (error.message.includes("not 'scheduled'")) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to publish scheduled placement' });
  }
};

/**
 * Batch delete placements with refund (parallel processing)
 * ADMIN ONLY: Only administrators can delete placements
 * 5-10x faster than individual DELETE requests
 */
const batchDeletePlacements = async (req, res) => {
  try {
    const { placementIds } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate input
    if (!placementIds || !Array.isArray(placementIds) || placementIds.length === 0) {
      return res.status(400).json({ error: 'placementIds must be a non-empty array' });
    }

    if (placementIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 placements per batch delete' });
    }

    // Validate all IDs are integers
    const validIds = placementIds.every(id => Number.isInteger(id) && id > 0);
    if (!validIds) {
      return res.status(400).json({ error: 'All placement IDs must be positive integers' });
    }

    logger.info('Batch delete request', {
      userId,
      userRole,
      placementCount: placementIds.length
    });

    const billingService = require('../services/billing.service');
    const result = await billingService.batchDeletePlacements(userId, userRole, placementIds);

    res.json({
      success: true,
      data: {
        successful: result.successful,
        failed: result.failed,
        totalRefunded: result.totalRefunded,
        results: result.results,
        errors: result.errors,
        finalBalance: result.finalBalance,
        durationMs: result.durationMs
      }
    });
  } catch (error) {
    // SECURITY: Log detailed error server-side, return generic message to client
    logger.error('Batch delete placements error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to batch delete placements' });
  }
};

module.exports = {
  getPlacements,
  getPlacementsBySite,
  getPlacement,
  createBatchPlacement,
  createBatchPlacementAsync,
  getJobStatus,
  cancelJob,
  deletePlacement,
  batchDeletePlacements,
  getStatistics,
  getAvailableSites,
  publishScheduledPlacement
};
