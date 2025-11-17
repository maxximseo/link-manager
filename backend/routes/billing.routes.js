/**
 * Billing routes
 * Handles all billing operations: balance, transactions, pricing, deposits
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const billingService = require('../services/billing.service');
const exportService = require('../services/export.service');
const logger = require('../config/logger');
const { handleError, handleSmartError } = require('../utils/errorHandler');

// Rate limiting for financial operations (adjusted for bulk purchases)
const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 financial operations per minute (allows bulk purchases)
  message: 'Too many financial operations, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
  }
  next();
};

/**
 * GET /api/billing/balance
 * Get current user balance and billing info
 */
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const user = await billingService.getUserBalance(req.user.id);

    res.json({
      success: true,
      data: {
        balance: parseFloat(user.balance),
        totalSpent: parseFloat(user.total_spent),
        currentDiscount: user.current_discount,
        discountTier: user.tier_name
      }
    });

  } catch (error) {
    logger.error('Failed to get balance', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * POST /api/billing/deposit
 * Add balance to user account
 * Note: In production, this should be called by payment gateway webhook
 */
router.post('/deposit',
  authMiddleware,
  financialLimiter,
  [
    body('amount').isFloat({ min: 0.01, max: 10000 }).withMessage('Amount must be between $0.01 and $10,000'),
    body('description').optional().isString().trim()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { amount, description } = req.body;

      const result = await billingService.addBalance(
        req.user.id,
        amount,
        description || 'Balance deposit'
      );

      res.json({
        success: true,
        data: {
          newBalance: result.newBalance,
          amount: result.amount
        }
      });

    } catch (error) {
      return handleSmartError(res, error, 'Failed to deposit balance', 500);
    }
  }
);

/**
 * GET /api/billing/transactions
 * Get user transaction history
 */
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, type } = req.query;

    const transactions = await billingService.getUserTransactions(req.user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      type
    });

    res.json({
      success: true,
      data: transactions.data,
      pagination: transactions.pagination
    });

  } catch (error) {
    logger.error('Failed to get transactions', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

/**
 * GET /api/billing/pricing
 * Get current pricing with user's discount applied
 */
router.get('/pricing', authMiddleware, async (req, res) => {
  try {
    const pricing = await billingService.getPricingForUser(req.user.id);

    res.json({
      success: true,
      data: pricing
    });

  } catch (error) {
    logger.error('Failed to get pricing', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get pricing' });
  }
});

/**
 * GET /api/billing/discount-tiers
 * Get all discount tiers
 */
router.get('/discount-tiers', authMiddleware, async (req, res) => {
  try {
    const tiers = await billingService.getDiscountTiers();

    res.json({
      success: true,
      data: tiers
    });

  } catch (error) {
    logger.error('Failed to get discount tiers', { error: error.message });
    res.status(500).json({ error: 'Failed to get discount tiers' });
  }
});

/**
 * POST /api/billing/purchase
 * Purchase a placement (link or article)
 */
router.post('/purchase',
  authMiddleware,
  financialLimiter,
  [
    body('projectId').isInt({ min: 1 }).withMessage('Valid project ID required'),
    body('siteId').isInt({ min: 1 }).withMessage('Valid site ID required'),
    body('type').isIn(['link', 'article']).withMessage('Type must be "link" or "article"'),
    body('contentIds').isArray({ min: 1, max: 1 }).withMessage('Content IDs must be an array with exactly 1 item'),
    body('contentIds.*').isInt({ min: 1 }).withMessage('Each content ID must be a valid integer'),
    body('scheduledDate').optional().isISO8601().withMessage('Scheduled date must be valid ISO8601 date'),
    body('autoRenewal').optional().isBoolean().withMessage('Auto renewal must be boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { projectId, siteId, type, contentIds, scheduledDate, autoRenewal } = req.body;

      // Validate scheduled date if provided
      if (scheduledDate) {
        const scheduled = new Date(scheduledDate);
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 90);

        if (scheduled > maxDate) {
          return res.status(400).json({ error: 'Scheduled date cannot be more than 90 days in the future' });
        }

        if (scheduled < new Date()) {
          return res.status(400).json({ error: 'Scheduled date must be in the future' });
        }
      }

      const result = await billingService.purchasePlacement({
        userId: req.user.id,
        projectId,
        siteId,
        type,
        contentIds,
        scheduledDate,
        autoRenewal
      });

      res.json({
        success: true,
        data: {
          placement: result.placement,
          newBalance: result.newBalance,
          newDiscount: result.newDiscount,
          newTier: result.newTier
        }
      });

    } catch (error) {
      return handleSmartError(res, error, 'Failed to purchase placement', 400);
    }
  }
);

/**
 * POST /api/billing/renew/:placementId
 * Renew a placement (links only)
 */
router.post('/renew/:placementId',
  authMiddleware,
  financialLimiter,
  async (req, res) => {
    try {
      const placementId = parseInt(req.params.placementId);

      if (isNaN(placementId)) {
        return res.status(400).json({ error: 'Invalid placement ID' });
      }

      const result = await billingService.renewPlacement(
        placementId,
        req.user.id,
        false // not auto-renewal
      );

      res.json({
        success: true,
        data: {
          newExpiryDate: result.newExpiryDate,
          pricePaid: result.pricePaid,
          newBalance: result.newBalance
        }
      });

    } catch (error) {
      return handleSmartError(res, error, 'Failed to renew placement', 400);
    }
  }
);

/**
 * PATCH /api/billing/auto-renewal/:placementId
 * Toggle auto-renewal for placement
 */
router.patch('/auto-renewal/:placementId',
  authMiddleware,
  [
    body('enabled').isBoolean().withMessage('Enabled must be boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const placementId = parseInt(req.params.placementId);
      const { enabled } = req.body;

      if (isNaN(placementId)) {
        return res.status(400).json({ error: 'Invalid placement ID' });
      }

      const result = await billingService.toggleAutoRenewal(
        placementId,
        req.user.id,
        enabled
      );

      res.json({
        success: true,
        data: {
          enabled: result.enabled
        }
      });

    } catch (error) {
      return handleSmartError(res, error, 'Failed to toggle auto-renewal', 400);
    }
  }
);

/**
 * GET /api/billing/export/placements
 * Export user placements to CSV or JSON
 * Optional: ?project_id=123 to filter by project
 */
router.get('/export/placements', authMiddleware, async (req, res) => {
  try {
    const { format = 'csv', project_id } = req.query;

    const result = await exportService.exportUserPlacements(req.user.id, format, project_id);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.json(result.data);
    }

  } catch (error) {
    logger.error('Failed to export placements', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to export placements' });
  }
});

/**
 * GET /api/billing/export/transactions
 * Export user transactions to CSV or JSON
 */
router.get('/export/transactions', authMiddleware, async (req, res) => {
  try {
    const { format = 'csv' } = req.query;

    const result = await exportService.exportUserTransactions(req.user.id, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.json(result.data);
    }

  } catch (error) {
    logger.error('Failed to export transactions', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to export transactions' });
  }
});

module.exports = router;
