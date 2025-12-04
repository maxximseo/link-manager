/**
 * Legacy routes wrapper - imports all routes from existing server.js
 * This allows gradual migration while maintaining compatibility
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const logger = require('../config/logger');

// Validate JWT secret is provided in environment
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set in environment variables. This is a security risk.');
  throw new Error(
    'JWT_SECRET environment variable is required for security. Please set it in .env file.'
  );
}

// Rate limiting (copied from server.js)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Temporary increase from 5 to 50 for login issues
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// General API rate limiting (100 req/min)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Auth middleware
const authMiddleware = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// Legacy auth routes
router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    logger.info('User logged in:', username);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Projects routes
router.get('/projects', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const usePagination = page && limit;

    let query_text = 'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC';
    const values = [req.user.userId];

    if (usePagination) {
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      query_text += ' LIMIT $2 OFFSET $3';
      values.push(parseInt(limit, 10), offset);
    }

    const result = await query(query_text, values);

    if (usePagination) {
      const countResult = await query('SELECT COUNT(*) FROM projects WHERE user_id = $1', [
        req.user.userId
      ]);
      const total = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.ceil(total / parseInt(limit, 10));

      res.json({
        data: result.rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: totalPages,
          hasNext: parseInt(page, 10) < totalPages,
          hasPrev: parseInt(page, 10) > 1
        }
      });
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    logger.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Basic sites route
router.get('/sites', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const result = await query('SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC', [
      req.user.userId
    ]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get sites error:', error);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// Basic placements route
router.get('/placements', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const result = await query(
      `
      SELECT
        p.id,
        p.user_id,
        p.project_id,
        p.site_id,
        p.type,
        p.status,
        p.wordpress_post_id,
        p.placed_at,
        p.created_at,
        p.updated_at,
        p.original_price,
        p.discount_applied,
        p.final_price,
        p.purchased_at,
        p.scheduled_publish_date,
        p.published_at,
        p.expires_at,
        p.auto_renewal,
        p.renewal_price,
        p.last_renewed_at,
        p.renewal_count,
        p.purchase_transaction_id,
        pr.name as project_name,
        s.site_name,
        s.site_url
      FROM placements p
      JOIN projects pr ON p.project_id = pr.id
      JOIN sites s ON p.site_id = s.id
      WHERE pr.user_id = $1
      ORDER BY p.placed_at DESC
    `,
      [req.user.id]
    ); // Fixed: was req.user.userId, should be req.user.id

    res.json(result.rows);
  } catch (error) {
    logger.error('Get placements error:', error);
    res.status(500).json({ error: 'Failed to fetch placements' });
  }
});

// REMOVED: Batch placement endpoint - SECURITY: Bypassed billing system
// This legacy endpoint allowed free placement creation without payment
// Use POST /api/billing/purchase instead for paid placements
router.post('/placements/batch/create', authMiddleware, apiLimiter, (req, res) => {
  return res.status(410).json({
    error: 'This endpoint has been removed for security reasons',
    reason: 'Bypassed billing system - all placements must be paid',
    alternative: 'Use POST /api/billing/purchase to create paid placements',
    documentation: 'See /api/billing/pricing for current pricing'
  });
});

module.exports = router;
