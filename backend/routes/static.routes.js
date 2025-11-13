/**
 * Static PHP widget routes
 * Public API endpoints for static PHP sites
 */

const express = require('express');
const router = express.Router();
const wordpressService = require('../services/wordpress.service');
const logger = require('../config/logger');
const rateLimit = require('express-rate-limit');

// Stricter rate limiting for public API endpoints
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later' }
});

// GET /api/static/get-content-by-domain?domain=example.com
// Public endpoint - no authentication required
// NOTE: This is a legacy endpoint for backward compatibility
// New static sites should use API key authentication via /api/wordpress/get-content
router.get('/get-content-by-domain', publicApiLimiter, async (req, res) => {
  try {
    const domain = req.query.domain;

    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    // Validate domain format (basic check)
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    const content = await wordpressService.getContentByDomain(domain);

    res.json(content);
  } catch (error) {
    logger.error('Get static content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

module.exports = router;
