/**
 * Admin routes
 * Handles admin-only operations: dashboard, user management, analytics
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { financialLimiter, apiLimiter, generalLimiter } = require('../middleware/rateLimiter');
const adminService = require('../services/admin.service');
const siteService = require('../services/site.service');
const referralController = require('../controllers/referral.controller');
const logger = require('../config/logger');
const { processScheduledPlacements } = require('../cron/scheduled-placements.cron');

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply auth, admin check, and default rate limiting to all routes
router.use(authMiddleware, requireAdmin, apiLimiter);

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
  }
  next();
};

/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics
 */
router.get('/dashboard/stats', async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    const stats = await adminService.getAdminStats(period);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get dashboard stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

/**
 * GET /api/admin/revenue
 * Get revenue breakdown by time period
 */
router.get('/revenue', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const revenue = await adminService.getRevenueBreakdown(startDate, endDate, groupBy);

    res.json({
      success: true,
      data: revenue
    });
  } catch (error) {
    logger.error('Failed to get revenue breakdown', { error: error.message });
    res.status(500).json({ error: 'Failed to get revenue breakdown' });
  }
});

/**
 * GET /api/admin/revenue/multi-period
 * Get revenue for all periods (day, week, month, year)
 */
router.get('/revenue/multi-period', async (req, res) => {
  try {
    const revenue = await adminService.getMultiPeriodRevenue();

    res.json({
      success: true,
      data: revenue
    });
  } catch (error) {
    logger.error('Failed to get multi-period revenue', { error: error.message });
    res.status(500).json({ error: 'Failed to get multi-period revenue' });
  }
});

/**
 * GET /api/admin/users
 * Get all users with pagination
 */
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, role } = req.query;

    const users = await adminService.getUsers({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      role
    });

    res.json({
      success: true,
      data: users.data,
      pagination: users.pagination
    });
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * POST /api/admin/users/:id/adjust-balance
 * Adjust user balance (add or subtract)
 * SECURITY: financialLimiter (10 req/min) - stricter limit for financial operations
 */
router.post(
  '/users/:id/adjust-balance',
  financialLimiter,
  [
    body('amount')
      .isFloat({ min: -10000, max: 10000 })
      .withMessage('Amount must be between -$10,000 and $10,000'),
    body('reason').isString().trim().notEmpty().withMessage('Reason is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const { amount, reason } = req.body;

      if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      const result = await adminService.adjustUserBalance(
        userId,
        amount,
        reason,
        req.user.id // admin ID
      );

      res.json({
        success: true,
        data: {
          newBalance: result.newBalance
        }
      });
    } catch (error) {
      logger.error('Failed to adjust user balance', {
        adminId: req.user.id,
        userId: req.params.id,
        error: error.message
      });
      res.status(400).json({ error: error.message || 'Failed to adjust user balance' });
    }
  }
);

/**
 * GET /api/admin/placements
 * Get all placements (only on admin's sites)
 */
router.get('/placements', async (req, res) => {
  try {
    const { page = 1, limit = 5000, status, type } = req.query;

    const placements = await adminService.getAdminPlacements(req.user.id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      type
    });

    res.json({
      success: true,
      data: placements.data,
      pagination: placements.pagination
    });
  } catch (error) {
    logger.error('Failed to get admin placements', { error: error.message });
    res.status(500).json({ error: 'Failed to get placements' });
  }
});

/**
 * GET /api/admin/recent-purchases
 * Get recent purchases for dashboard
 */
router.get('/recent-purchases', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const purchases = await adminService.getRecentPurchases(parseInt(limit, 10));

    res.json({
      success: true,
      data: purchases
    });
  } catch (error) {
    logger.error('Failed to get recent purchases', { error: error.message });
    res.status(500).json({ error: 'Failed to get recent purchases' });
  }
});

/**
 * POST /api/admin/placements/:id/refund
 * Manually refund a placement (admin only)
 * SECURITY: financialLimiter (10 req/min) - stricter limit for financial operations
 *
 * Use cases:
 * - Customer dispute/complaint
 * - Quality issues with site
 * - Site downtime
 * - Goodwill refunds
 *
 * Body:
 * - reason (required): String explaining why refund is issued
 * - deleteWordPressPost (optional): Boolean, if true deletes WP post (default: false)
 */
router.post(
  '/placements/:id/refund',
  financialLimiter,
  [
    body('reason').isString().trim().notEmpty().withMessage('Refund reason is required'),
    body('deleteWordPressPost')
      .optional()
      .isBoolean()
      .withMessage('deleteWordPressPost must be boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const placementId = parseInt(req.params.id, 10);
      const { reason, deleteWordPressPost = false } = req.body;

      if (isNaN(placementId)) {
        return res.status(400).json({ error: 'Invalid placement ID' });
      }

      const result = await adminService.refundPlacement(
        placementId,
        reason,
        req.user.id, // admin ID
        deleteWordPressPost
      );

      res.json({
        success: true,
        message: 'Placement refunded successfully',
        data: {
          placementId,
          refundAmount: result.refundAmount,
          newBalance: result.newBalance,
          tierChanged: result.tierChanged,
          newTier: result.newTier,
          wordpressPostDeleted: result.wordpressPostDeleted
        }
      });
    } catch (error) {
      logger.error('Failed to refund placement', {
        adminId: req.user.id,
        placementId: req.params.id,
        error: error.message
      });
      res.status(400).json({
        error: error.message || 'Failed to refund placement'
      });
    }
  }
);

/**
 * GET /api/admin/sites/with-zero-param
 * Get sites where a specific parameter is 0 or null
 * Query: parameter=dr
 */
router.get('/sites/with-zero-param', async (req, res) => {
  try {
    const { parameter = 'dr' } = req.query;

    const result = await siteService.getSitesWithZeroParam(parameter);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to get sites with zero param', {
      adminId: req.user.id,
      parameter: req.query.parameter,
      error: error.message
    });
    res.status(400).json({
      error: error.message || 'Failed to get sites'
    });
  }
});

/**
 * POST /api/admin/sites/bulk-update-params
 * Bulk update site parameters (DR, etc.)
 *
 * Body:
 * - parameter: String ('dr', etc.)
 * - updates: Array of {domain, value} objects
 *
 * Input format in frontend: "site.com 10\nexample.org 25"
 */
router.post(
  '/sites/bulk-update-params',
  [
    body('parameter').isString().trim().notEmpty().withMessage('Parameter name is required'),
    body('updates')
      .isArray({ min: 1 })
      .withMessage('Updates array is required and must not be empty'),
    body('updates.*.domain')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Domain is required for each update'),
    body('updates.*.value').notEmpty().withMessage('Value is required for each update')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { parameter, updates } = req.body;

      // GEO: string parameter (country code like "PL", "EN", "RU")
      if (parameter === 'geo') {
        // For GEO, value should be a string (2-10 chars)
        const invalidValues = updates.filter(
          u => typeof u.value !== 'string' || u.value.length > 10
        );
        if (invalidValues.length > 0) {
          return res.status(400).json({
            error: `GEO values must be strings up to 10 characters. Found invalid values for: ${invalidValues.map(u => u.domain).join(', ')}`
          });
        }
      } else {
        // For numeric parameters, validate as integers
        const nonIntegerValues = updates.filter(
          u => !Number.isInteger(Number(u.value)) || Number(u.value) < 0
        );
        if (nonIntegerValues.length > 0) {
          return res.status(400).json({
            error: `Values must be non-negative integers. Found invalid values for: ${nonIntegerValues.map(u => u.domain).join(', ')}`
          });
        }

        // DR/DA/TF/CF: validate 0-100 range (ratings)
        if (['dr', 'da', 'tf', 'cf'].includes(parameter)) {
          const invalidValues = updates.filter(u => Number(u.value) > 100);
          if (invalidValues.length > 0) {
            return res.status(400).json({
              error: `${parameter.toUpperCase()} values must be between 0 and 100. Found invalid values for: ${invalidValues.map(u => u.domain).join(', ')}`
            });
          }
        }
      }
      // ref_domains, rd_main, norm, keywords, traffic: no upper limit (counts)

      logger.info('Bulk site params update requested', {
        adminId: req.user.id,
        parameter,
        updatesCount: updates.length
      });

      const result = await siteService.bulkUpdateSiteParams(parameter, updates);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to bulk update site params', {
        adminId: req.user.id,
        error: error.message
      });
      res.status(400).json({
        error: error.message || 'Failed to bulk update site params'
      });
    }
  }
);

// ==================== SITE MANAGEMENT ENDPOINTS ====================

/**
 * GET /api/admin/sites
 * Get all sites (admin can see all sites from all users)
 */
router.get('/sites', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, is_public } = req.query;

    const sites = await adminService.getAllSites({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      isPublic: is_public === 'true' ? true : is_public === 'false' ? false : null
    });

    res.json({
      success: true,
      data: sites.data,
      pagination: sites.pagination
    });
  } catch (error) {
    logger.error('Failed to get all sites', { error: error.message });
    res.status(500).json({ error: 'Failed to get sites' });
  }
});

/**
 * PUT /api/admin/sites/:id/public-status
 * Set site public status (only admin can make sites public)
 *
 * Body:
 * - is_public: Boolean
 */
router.put(
  '/sites/:id/public-status',
  [body('is_public').isBoolean().withMessage('is_public must be a boolean')],
  validateRequest,
  async (req, res) => {
    try {
      const siteId = parseInt(req.params.id, 10);
      const { is_public } = req.body;

      if (isNaN(siteId)) {
        return res.status(400).json({ error: 'Invalid site ID' });
      }

      const site = await adminService.setSitePublicStatus(siteId, is_public, req.user.id);

      res.json({
        success: true,
        message: `Site ${is_public ? 'made public' : 'made private'} successfully`,
        data: site
      });
    } catch (error) {
      logger.error('Failed to set site public status', {
        adminId: req.user.id,
        siteId: req.params.id,
        error: error.message
      });
      res.status(400).json({ error: error.message || 'Failed to update site' });
    }
  }
);

// ==================== MODERATION ENDPOINTS ====================

/**
 * GET /api/admin/moderation
 * Get all placements pending admin approval (with pagination)
 */
router.get('/moderation', async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await adminService.getPendingApprovals({ page, limit });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Failed to get pending approvals', { error: error.message });
    res.status(500).json({ error: 'Failed to get pending approvals' });
  }
});

/**
 * GET /api/admin/moderation/count
 * Get count of placements pending approval (for badge)
 */
router.get('/moderation/count', async (req, res) => {
  try {
    const count = await adminService.getPendingApprovalsCount();

    res.json({
      success: true,
      count
    });
  } catch (error) {
    logger.error('Failed to get moderation count', { error: error.message });
    res.status(500).json({ error: 'Failed to get count' });
  }
});

/**
 * POST /api/admin/moderation/:id/approve
 * Approve a placement and trigger publication
 */
router.post('/moderation/:id/approve', async (req, res) => {
  try {
    const placementId = parseInt(req.params.id, 10);

    if (isNaN(placementId)) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }

    const result = await adminService.approvePlacement(placementId, req.user.id);

    res.json({
      success: true,
      message: 'Placement approved successfully',
      data: {
        placementId,
        newStatus: result.newStatus
      }
    });
  } catch (error) {
    logger.error('Failed to approve placement', {
      adminId: req.user.id,
      placementId: req.params.id,
      error: error.message
    });
    res.status(400).json({ error: error.message || 'Failed to approve placement' });
  }
});

/**
 * POST /api/admin/moderation/:id/reject
 * Reject a placement and refund the user
 */
router.post(
  '/moderation/:id/reject',
  [body('reason').optional().isString().trim().withMessage('Reason must be a string')],
  validateRequest,
  async (req, res) => {
    try {
      const placementId = parseInt(req.params.id, 10);
      const { reason = 'Отклонено администратором' } = req.body;

      if (isNaN(placementId)) {
        return res.status(400).json({ error: 'Invalid placement ID' });
      }

      const result = await adminService.rejectPlacement(placementId, req.user.id, reason);

      res.json({
        success: true,
        message: 'Placement rejected and refunded',
        data: {
          placementId,
          refundAmount: result.refundAmount,
          reason: result.reason
        }
      });
    } catch (error) {
      logger.error('Failed to reject placement', {
        adminId: req.user.id,
        placementId: req.params.id,
        error: error.message
      });
      res.status(400).json({ error: error.message || 'Failed to reject placement' });
    }
  }
);

// ==================== REFERRAL WITHDRAWAL MANAGEMENT ====================

/**
 * GET /api/admin/referral-withdrawals
 * Get all wallet withdrawal requests with pagination
 * Query params: page, limit, status (pending/completed/rejected)
 */
router.get('/referral-withdrawals', referralController.getAdminWithdrawals);

/**
 * POST /api/admin/referral-withdrawals/:id/approve
 * Approve a wallet withdrawal request
 * Admin must have manually sent USDT before approving
 */
router.post(
  '/referral-withdrawals/:id/approve',
  financialLimiter,
  referralController.approveWithdrawal
);

/**
 * POST /api/admin/referral-withdrawals/:id/reject
 * Reject a wallet withdrawal request and return balance to user
 * Body: { comment: string } - reason for rejection
 */
router.post(
  '/referral-withdrawals/:id/reject',
  financialLimiter,
  [body('comment').optional().isString().trim().withMessage('Comment must be a string')],
  validateRequest,
  referralController.rejectWithdrawal
);

// ==================== SITE MODERATION ENDPOINTS ====================

/**
 * GET /api/admin/sites/moderation
 * Get all sites pending moderation
 */
router.get('/sites/moderation', async (req, res) => {
  try {
    const sites = await siteService.getSitesForModeration();

    res.json({
      success: true,
      data: sites
    });
  } catch (error) {
    logger.error('Failed to get sites for moderation', { error: error.message });
    res.status(500).json({ error: 'Failed to get sites for moderation' });
  }
});

/**
 * GET /api/admin/sites/moderation/stats
 * Get moderation statistics
 */
router.get('/sites/moderation/stats', async (req, res) => {
  try {
    const stats = await siteService.getModerationStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get moderation stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get moderation stats' });
  }
});

/**
 * POST /api/admin/sites/:id/approve
 * Approve site for public marketplace
 */
router.post('/sites/:id/approve', async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);

    if (isNaN(siteId)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }

    const site = await siteService.approveSite(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json({
      success: true,
      message: 'Site approved successfully',
      data: site
    });
  } catch (error) {
    logger.error('Failed to approve site', {
      adminId: req.user.id,
      siteId: req.params.id,
      error: error.message
    });
    res.status(400).json({ error: error.message || 'Failed to approve site' });
  }
});

/**
 * POST /api/admin/sites/:id/reject
 * Reject site from public marketplace
 * Body: { reason: string } - optional rejection reason
 */
router.post(
  '/sites/:id/reject',
  [body('reason').optional().isString().trim().withMessage('Reason must be a string')],
  validateRequest,
  async (req, res) => {
    try {
      const siteId = parseInt(req.params.id, 10);
      const { reason } = req.body;

      if (isNaN(siteId)) {
        return res.status(400).json({ error: 'Invalid site ID' });
      }

      const site = await siteService.rejectSite(siteId, reason);

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      res.json({
        success: true,
        message: 'Site rejected',
        data: site
      });
    } catch (error) {
      logger.error('Failed to reject site', {
        adminId: req.user.id,
        siteId: req.params.id,
        error: error.message
      });
      res.status(400).json({ error: error.message || 'Failed to reject site' });
    }
  }
);

// ==================== SCHEDULED PLACEMENTS MANAGEMENT ====================

/**
 * POST /api/admin/process-scheduled-placements
 * Manually trigger processing of scheduled placements
 * This will publish all placements where scheduled_publish_date <= NOW
 */
router.post('/process-scheduled-placements', async (req, res) => {
  try {
    logger.info('Manual scheduled placements processing triggered', {
      adminId: req.user.id
    });

    const result = await processScheduledPlacements();

    res.json({
      success: true,
      message: 'Scheduled placements processed',
      data: {
        total: result.total,
        success: result.success,
        failed: result.failed
      }
    });
  } catch (error) {
    logger.error('Failed to process scheduled placements', {
      adminId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to process scheduled placements' });
  }
});

/**
 * POST /api/admin/bulk-update-placement-status
 * Bulk update placement statuses from scheduled to placed
 * For placements that are already live on sites but stuck in scheduled status
 */
router.post('/bulk-update-placement-status', async (req, res) => {
  try {
    const { placementIds, newStatus = 'placed' } = req.body;

    if (!placementIds || !Array.isArray(placementIds) || placementIds.length === 0) {
      return res.status(400).json({ error: 'placementIds array is required' });
    }

    if (!['placed', 'scheduled', 'failed'].includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    logger.info('Bulk placement status update requested', {
      adminId: req.user.id,
      count: placementIds.length,
      newStatus
    });

    const { query } = require('../config/database');
    const result = await query(
      `
      UPDATE placements
      SET status = $1::text,
          published_at = CASE WHEN $1::text = 'placed' AND published_at IS NULL THEN NOW() ELSE published_at END,
          updated_at = NOW()
      WHERE id = ANY($2::int[])
      RETURNING id
      `,
      [newStatus, placementIds]
    );

    res.json({
      success: true,
      message: `Updated ${result.rowCount} placements to ${newStatus}`,
      data: {
        updated: result.rowCount,
        ids: result.rows.map(r => r.id)
      }
    });
  } catch (error) {
    logger.error('Failed to bulk update placement status', {
      adminId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to update placements', details: error.message });
  }
});

// ============================================================================
// Endpoint Migration Routes
// ============================================================================

/**
 * @route POST /api/admin/broadcast-endpoint
 * @desc Broadcast new API endpoint to all WordPress sites
 * @access Admin only
 */
router.post('/broadcast-endpoint', generalLimiter, async (req, res) => {
  try {
    const { new_endpoint } = req.body;

    if (!new_endpoint) {
      return res.status(400).json({ error: 'new_endpoint is required' });
    }

    // Validate URL format
    try {
      new URL(new_endpoint);
    } catch {
      return res.status(400).json({ error: 'Invalid endpoint URL format' });
    }

    const result = await siteService.broadcastEndpoint(new_endpoint);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Broadcast endpoint error:', error);
    res.status(500).json({ error: 'Failed to broadcast endpoint', details: error.message });
  }
});

/**
 * @route GET /api/admin/endpoint-migration-status
 * @desc Get current endpoint migration status
 * @access Admin only
 */
router.get('/endpoint-migration-status', generalLimiter, async (req, res) => {
  try {
    const status = await siteService.getEndpointMigrationStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get endpoint migration status error:', error);
    res.status(500).json({ error: 'Failed to get migration status', details: error.message });
  }
});

module.exports = router;
