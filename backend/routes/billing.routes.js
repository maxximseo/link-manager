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
const { handleSmartError } = require('../utils/errorHandler');
const { RATE_LIMITS } = require('../config/constants');

// Rate limiting for purchase operations (stricter than general API)
const purchaseLimiter = rateLimit({
  windowMs: RATE_LIMITS.FINANCIAL.windowMs,
  max: RATE_LIMITS.FINANCIAL.max, // 10 purchases per minute
  message: 'Too many purchase operations. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.user?.id || req.ip // Per-user limit
});

// Even stricter limit for deposit operations (potential fraud vector)
const depositLimiter = rateLimit({
  windowMs: RATE_LIMITS.DEPOSIT.windowMs,
  max: RATE_LIMITS.DEPOSIT.max, // 5 deposits per minute
  message: 'Too many deposit attempts. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.user?.id || req.ip
});

// Legacy financialLimiter for backward compatibility (batch operations)
const financialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50, // 50 for batch operations that need higher limit
  message: 'Too many financial operations, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
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
        discountTier: user.tier_name,
        lockedBonus: parseFloat(user.locked_bonus) || 0,
        unlockAmount: parseFloat(user.locked_bonus_unlock_amount) || 100
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
 *
 * NEW: Supports promo code for first-deposit bonus
 * - If promoCode is valid and deposit >= $100 and user hasn't received bonus yet:
 *   - User gets +$100 bonus
 *   - Promo code owner gets +$50 to referral_balance
 */
router.post(
  '/deposit',
  authMiddleware,
  depositLimiter, // Stricter rate limit for deposits (5/min)
  [
    body('amount')
      .isFloat({ min: 0.01, max: 10000 })
      .withMessage('Amount must be between $0.01 and $10,000'),
    body('description').optional().isString().trim(),
    body('promoCode')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Promo code must be max 50 characters')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { amount, description, promoCode } = req.body;

      const result = await billingService.addBalance(
        req.user.id,
        amount,
        description || 'Balance deposit',
        null, // adminId
        promoCode || null
      );

      res.json({
        success: true,
        data: {
          newBalance: result.newBalance,
          amount: result.amount,
          bonusAmount: result.bonusAmount || 0,
          totalAdded: result.totalAdded || result.amount,
          bonusApplied: result.bonusApplied || false
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
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
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
router.post(
  '/purchase',
  authMiddleware,
  purchaseLimiter, // Stricter rate limit for purchases (10/min)
  [
    body('projectId').isInt({ min: 1 }).withMessage('Valid project ID required'),
    body('siteId').isInt({ min: 1 }).withMessage('Valid site ID required'),
    body('type').isIn(['link', 'article']).withMessage('Type must be "link" or "article"'),
    body('contentIds')
      .isArray({ min: 1, max: 1 })
      .withMessage('Content IDs must be an array with exactly 1 item'),
    body('contentIds.*').isInt({ min: 1 }).withMessage('Each content ID must be a valid integer'),
    body('scheduledDate')
      .optional()
      .isISO8601()
      .withMessage('Scheduled date must be valid ISO8601 date'),
    body('autoRenewal').optional().isBoolean().withMessage('Auto renewal must be boolean'),
    // SECURITY: Optional idempotency key to prevent duplicate purchases
    body('idempotencyKey')
      .optional()
      .isUUID()
      .withMessage('Idempotency key must be a valid UUID')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { projectId, siteId, type, contentIds, scheduledDate, autoRenewal, idempotencyKey } =
        req.body;

      // SECURITY: Check idempotency key to prevent duplicate purchases
      if (idempotencyKey) {
        const cache = require('../services/cache.service');
        const idempotencyKeyCache = `idempotency:purchase:${req.user.id}:${idempotencyKey}`;
        const existingResult = await cache.get(idempotencyKeyCache);

        if (existingResult) {
          // Return cached result for duplicate request
          logger.info('Idempotent purchase request detected', {
            userId: req.user.id,
            idempotencyKey
          });
          return res.json({
            success: true,
            data: existingResult,
            idempotent: true
          });
        }
      }

      // Validate scheduled date if provided
      if (scheduledDate) {
        const scheduled = new Date(scheduledDate);
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 90);

        if (scheduled > maxDate) {
          return res
            .status(400)
            .json({ error: 'Scheduled date cannot be more than 90 days in the future' });
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

      const responseData = {
        placement: result.placement,
        newBalance: result.newBalance,
        newDiscount: result.newDiscount,
        newTier: result.newTier
      };

      // SECURITY: Cache result for idempotency (24 hour TTL)
      if (idempotencyKey) {
        const cache = require('../services/cache.service');
        const idempotencyKeyCache = `idempotency:purchase:${req.user.id}:${idempotencyKey}`;
        await cache.set(idempotencyKeyCache, responseData, 86400); // 24 hours
      }

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      return handleSmartError(res, error, 'Failed to purchase placement', 400);
    }
  }
);

/**
 * POST /api/billing/batch-purchase
 * Batch purchase multiple placements in parallel (5-10x faster)
 */
router.post(
  '/batch-purchase',
  authMiddleware,
  financialLimiter,
  [
    body('purchases')
      .isArray({ min: 1, max: 100 })
      .withMessage('Purchases must be an array with 1-100 items'),
    body('purchases.*.projectId')
      .isInt({ min: 1 })
      .withMessage('Each purchase requires valid project ID'),
    body('purchases.*.siteId')
      .isInt({ min: 1 })
      .withMessage('Each purchase requires valid site ID'),
    body('purchases.*.type')
      .isIn(['link', 'article'])
      .withMessage('Type must be "link" or "article"'),
    body('purchases.*.contentIds')
      .isArray({ min: 1, max: 1 })
      .withMessage('Content IDs must be an array with exactly 1 item'),
    body('purchases.*.scheduledDate')
      .optional()
      .isISO8601()
      .withMessage('Scheduled date must be valid ISO8601')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { purchases } = req.body;

      logger.info('Batch purchase request', {
        userId: req.user.id,
        purchaseCount: purchases.length
      });

      const result = await billingService.batchPurchasePlacements(req.user.id, purchases);

      res.json({
        success: true,
        data: {
          successful: result.successful,
          failed: result.failed,
          results: result.results,
          errors: result.errors,
          finalBalance: result.finalBalance,
          durationMs: result.durationMs
        }
      });
    } catch (error) {
      logger.error('Batch purchase failed', { userId: req.user.id, error: error.message });
      return handleSmartError(res, error, 'Failed to process batch purchase', 500);
    }
  }
);

/**
 * POST /api/billing/renew/:placementId
 * Renew a placement (links only)
 */
router.post('/renew/:placementId', authMiddleware, financialLimiter, async (req, res) => {
  try {
    const placementId = parseInt(req.params.placementId, 10);

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
});

/**
 * PATCH /api/billing/auto-renewal/:placementId
 * Toggle auto-renewal for placement
 */
router.patch(
  '/auto-renewal/:placementId',
  authMiddleware,
  [body('enabled').isBoolean().withMessage('Enabled must be boolean')],
  validateRequest,
  async (req, res) => {
    try {
      const placementId = parseInt(req.params.placementId, 10);
      const { enabled } = req.body;

      if (isNaN(placementId)) {
        return res.status(400).json({ error: 'Invalid placement ID' });
      }

      const result = await billingService.toggleAutoRenewal(placementId, req.user.id, enabled);

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
 * GET /api/billing/statistics/spending
 * Get user spending statistics for all periods (day/week/month/year)
 */
router.get('/statistics/spending', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query: dbQuery } = require('../config/database');

    // Get spending for all periods in parallel
    const [dayResult, weekResult, monthResult, yearResult] = await Promise.all([
      // Day
      dbQuery(
        `SELECT
          COALESCE(SUM(ABS(amount)), 0) as total,
          COUNT(*) as count
        FROM transactions
        WHERE user_id = $1
          AND type IN ('purchase', 'renewal', 'auto_renewal')
          AND created_at >= NOW() - INTERVAL '1 day'`,
        [userId]
      ),
      // Week
      dbQuery(
        `SELECT
          COALESCE(SUM(ABS(amount)), 0) as total,
          COUNT(*) as count
        FROM transactions
        WHERE user_id = $1
          AND type IN ('purchase', 'renewal', 'auto_renewal')
          AND created_at >= NOW() - INTERVAL '7 days'`,
        [userId]
      ),
      // Month
      dbQuery(
        `SELECT
          COALESCE(SUM(ABS(amount)), 0) as total,
          COUNT(*) as count
        FROM transactions
        WHERE user_id = $1
          AND type IN ('purchase', 'renewal', 'auto_renewal')
          AND created_at >= NOW() - INTERVAL '1 month'`,
        [userId]
      ),
      // Year
      dbQuery(
        `SELECT
          COALESCE(SUM(ABS(amount)), 0) as total,
          COUNT(*) as count
        FROM transactions
        WHERE user_id = $1
          AND type IN ('purchase', 'renewal', 'auto_renewal')
          AND created_at >= NOW() - INTERVAL '1 year'`,
        [userId]
      )
    ]);

    res.json({
      success: true,
      data: {
        day: { total: dayResult.rows[0].total, count: parseInt(dayResult.rows[0].count, 10) },
        week: { total: weekResult.rows[0].total, count: parseInt(weekResult.rows[0].count, 10) },
        month: { total: monthResult.rows[0].total, count: parseInt(monthResult.rows[0].count, 10) },
        year: { total: yearResult.rows[0].total, count: parseInt(yearResult.rows[0].count, 10) }
      }
    });
  } catch (error) {
    logger.error('Failed to get spending statistics', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get spending statistics' });
  }
});

/**
 * GET /api/billing/statistics/placements
 * Get user placement statistics for selected period
 */
router.get('/statistics/placements', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || 'week';
    const { query: dbQuery } = require('../config/database');

    // Calculate date range
    let interval;
    switch (period) {
      case 'day':
        interval = '1 day';
        break;
      case 'week':
        interval = '7 days';
        break;
      case 'month':
        interval = '1 month';
        break;
      case 'year':
        interval = '1 year';
        break;
      default:
        interval = '7 days';
    }

    // Get placements stats
    const placementsResult = await dbQuery(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE type = 'link') as links,
        COUNT(*) FILTER (WHERE type = 'article') as articles,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled
      FROM placements
      WHERE user_id = $1
        AND placed_at >= NOW() - INTERVAL '${interval}'`,
      [userId]
    );

    // Get spending by type
    const spendingResult = await dbQuery(
      `SELECT
        COALESCE(SUM(ABS(amount)) FILTER (WHERE type = 'purchase'), 0) as purchases,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE type IN ('renewal', 'auto_renewal')), 0) as renewals
      FROM transactions
      WHERE user_id = $1
        AND type IN ('purchase', 'renewal', 'auto_renewal')
        AND created_at >= NOW() - INTERVAL '${interval}'`,
      [userId]
    );

    const stats = placementsResult.rows[0];
    const spending = spendingResult.rows[0];

    res.json({
      success: true,
      data: {
        placements: {
          total: parseInt(stats.total, 10),
          links: parseInt(stats.links, 10),
          articles: parseInt(stats.articles, 10),
          scheduled: parseInt(stats.scheduled, 10)
        },
        spending: {
          purchases: parseFloat(spending.purchases || 0),
          renewals: parseFloat(spending.renewals || 0)
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get placement statistics', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get placement statistics' });
  }
});

/**
 * GET /api/billing/statistics/timeline
 * Get user spending timeline for chart
 */
router.get('/statistics/timeline', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || 'week';
    const { query: dbQuery } = require('../config/database');

    // Calculate date range
    let startDate = new Date();
    let groupBy = 'day';

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        groupBy = 'month';
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    const result = await dbQuery(
      `SELECT
        DATE_TRUNC($1, created_at) as period,
        type,
        SUM(ABS(amount)) as total_amount
      FROM transactions
      WHERE user_id = $2
        AND type IN ('purchase', 'renewal', 'auto_renewal')
        AND created_at >= $3
      GROUP BY DATE_TRUNC($1, created_at), type
      ORDER BY period`,
      [groupBy, userId, startDate.toISOString()]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Failed to get spending timeline', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get spending timeline' });
  }
});

/**
 * GET /api/billing/statistics/recent-purchases
 * Get user's recent purchases
 */
router.get('/statistics/recent-purchases', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { query: dbQuery } = require('../config/database');

    const result = await dbQuery(
      `SELECT
        p.id,
        p.type,
        p.status,
        p.placed_at as purchased_at,
        p.final_price,
        p.discount_applied,
        s.site_name,
        s.site_url,
        proj.name as project_name
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      JOIN projects proj ON p.project_id = proj.id
      WHERE p.user_id = $1
      ORDER BY p.placed_at DESC
      LIMIT $2`,
      [userId, limit]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Failed to get recent purchases', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get recent purchases' });
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
