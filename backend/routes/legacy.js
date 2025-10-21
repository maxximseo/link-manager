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

// Validate JWT secret is provided in environment
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set in environment variables. This is a security risk.');
  throw new Error('JWT_SECRET environment variable is required for security. Please set it in .env file.');
}

// Rate limiting (copied from server.js)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Temporary increase from 5 to 50 for login issues
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
  
  // Check if queue is available
  let queueService;
  try {
    queueService = require('../config/queue');
  } catch (error) {
    return res.status(503).json({
      error: 'Batch operations not available - queue service disabled',
      fallback: 'Use individual placement creation'
    });
  }
  
  // For small batches, suggest synchronous processing
  if (site_ids.length < 5) {
    return res.status(400).json({
      error: 'Use individual placement creation for small batches (< 5 sites)',
      threshold: 5,
      provided: site_ids.length
    });
  }
  
  try {
    // Verify project exists and belongs to user
    const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [project_id, req.user.userId]);
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Project not found or access denied'
      });
    }
    
    // Verify sites exist and belong to user
    const siteCheck = await query(
      'SELECT id FROM sites WHERE id = ANY($1) AND user_id = $2', 
      [site_ids, req.user.userId]
    );
    if (siteCheck.rows.length !== site_ids.length) {
      return res.status(404).json({
        error: 'Some sites not found or access denied',
        found: siteCheck.rows.length,
        expected: site_ids.length
      });
    }
    
    // Verify links exist if provided
    if (link_ids.length > 0) {
      const linkCheck = await query(
        'SELECT id FROM project_links WHERE id = ANY($1) AND project_id = $2',
        [link_ids, project_id]
      );
      if (linkCheck.rows.length !== link_ids.length) {
        return res.status(404).json({
          error: 'Some links not found in project',
          found: linkCheck.rows.length,
          expected: link_ids.length
        });
      }
    }
    
    // Verify articles exist if provided
    if (article_ids.length > 0) {
      const articleCheck = await query(
        'SELECT id FROM project_articles WHERE id = ANY($1) AND project_id = $2',
        [article_ids, project_id]
      );
      if (articleCheck.rows.length !== article_ids.length) {
        return res.status(404).json({
          error: 'Some articles not found in project',
          found: articleCheck.rows.length,
          expected: article_ids.length
        });
      }
    }
    
    // Add job to queue with priority based on batch size
    const queue = queueService.getQueue('placement');
    const priority = site_ids.length >= 50 ? 'high' : 
                    site_ids.length >= 20 ? 'normal' : 'low';
    
    const job = await queue.add('batch-placement', {
      project_id,
      site_ids,
      link_ids,
      article_ids,
      user_id: req.user.userId,
      priority,
      metadata: {
        totalSites: site_ids.length,
        totalLinks: link_ids.length,
        totalArticles: article_ids.length,
        estimatedDuration: site_ids.length * 2 // 2 seconds per site estimate
      }
    }, {
      priority: priority === 'high' ? 1 : priority === 'normal' ? 5 : 10,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 10,
      removeOnFail: 5
    });
    
    logger.info('Batch placement job created', {
      jobId: job.id,
      projectId: project_id,
      siteCount: site_ids.length,
      linkCount: link_ids.length,
      articleCount: article_ids.length,
      priority,
      userId: req.user.userId
    });
    
    res.status(201).json({
      type: 'async',
      jobId: job.id,
      queueName: 'placement',
      status: 'queued',
      priority,
      message: `Batch placement job created for ${site_ids.length} sites`,
      details: {
        siteCount: site_ids.length,
        linkCount: link_ids.length,
        articleCount: article_ids.length,
        estimatedDuration: `${Math.ceil(site_ids.length * 2 / 60)} minutes`
      },
      tracking: {
        statusUrl: `/api/queue/jobs/placement/${job.id}`,
        allJobsUrl: '/api/queue/jobs?queueName=placement'
      }
    });
  } catch (error) {
    logger.error('Batch placement error:', {
      error: error.message,
      stack: error.stack,
      projectId: project_id,
      siteIds: site_ids,
      userId: req.user.userId
    });
    res.status(500).json({ 
      error: 'Failed to create batch placement job',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;