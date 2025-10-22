/**
 * Admin routes
 * Handles admin-only operations: dashboard, user management, analytics
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const adminService = require('../services/admin.service');
const logger = require('../config/logger');

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply auth and admin check to all routes
router.use(authMiddleware, requireAdmin);

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
      page: parseInt(page),
      limit: parseInt(limit),
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
 */
router.post('/users/:id/adjust-balance',
  [
    body('amount').isFloat({ min: -10000, max: 10000 }).withMessage('Amount must be between -$10,000 and $10,000'),
    body('reason').isString().trim().notEmpty().withMessage('Reason is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
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
    const { page = 1, limit = 50, status, type } = req.query;

    const placements = await adminService.getAdminPlacements(req.user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
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

    const purchases = await adminService.getRecentPurchases(parseInt(limit));

    res.json({
      success: true,
      data: purchases
    });

  } catch (error) {
    logger.error('Failed to get recent purchases', { error: error.message });
    res.status(500).json({ error: 'Failed to get recent purchases' });
  }
});

module.exports = router;
