/**
 * Legacy routes wrapper - imports all routes from existing server.js
 * This allows gradual migration while maintaining compatibility
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool, query } = require('../config/database');
const logger = require('../config/logger');

// Import existing middleware and utilities from server.js
const crypto = require('crypto');

// Generate JWT secret if not provided
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  logger.info('Generated JWT secret');
}

// Rate limiting (copied from server.js)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth middleware
const authMiddleware = async (req, res, next) => {
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
router.get('/projects', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const usePagination = page && limit;
    
    let query_text = 'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC';
    let values = [req.user.userId];
    
    if (usePagination) {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query_text += ' LIMIT $2 OFFSET $3';
      values.push(parseInt(limit), offset);
    }
    
    const result = await query(query_text, values);
    
    if (usePagination) {
      const countResult = await query('SELECT COUNT(*) FROM projects WHERE user_id = $1', [req.user.userId]);
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / parseInt(limit));
      
      res.json({
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
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
router.get('/sites', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get sites error:', error);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// Basic placements route  
router.get('/placements', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, pr.name as project_name, s.site_name, s.site_url
      FROM placements p
      JOIN projects pr ON p.project_id = pr.id
      JOIN sites s ON p.site_id = s.id
      WHERE pr.user_id = $1
      ORDER BY p.placed_at DESC
    `, [req.user.userId]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Get placements error:', error);
    res.status(500).json({ error: 'Failed to fetch placements' });
  }
});

// Batch placement endpoint with queue integration
router.post('/placements/batch/create', authMiddleware, async (req, res) => {
  const { project_id, site_ids, link_ids = [], article_ids = [] } = req.body;
  
  // Check if queue is available
  let queueService;
  try {
    queueService = require('../config/queue');
  } catch (error) {
    return res.status(503).json({
      error: 'Batch operations not available - queue service disabled'
    });
  }
  
  // For small batches, process synchronously
  if (site_ids.length < 10) {
    return res.status(400).json({
      error: 'Use individual placement creation for small batches'
    });
  }
  
  try {
    // Add job to queue
    const queue = queueService.getQueue('placement');
    const job = await queue.add('batch-placement', {
      project_id,
      site_ids,
      link_ids,
      article_ids,
      user_id: req.user.userId
    });
    
    res.status(201).json({
      type: 'async',
      jobId: job.id,
      status: 'queued',
      message: `Batch placement job created for ${site_ids.length} sites`,
      siteCount: site_ids.length
    });
  } catch (error) {
    logger.error('Batch placement error:', error);
    res.status(500).json({ error: 'Failed to create batch placement job' });
  }
});

module.exports = router;