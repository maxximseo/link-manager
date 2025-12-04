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

// SECURITY: RFC 1123 compliant domain validation with additional checks
function isValidDomain(domain) {
  // Max domain length per RFC 1035
  if (!domain || domain.length > 253) {
    return false;
  }

  // RFC 1123 compliant regex (allows digits in first position, unlike RFC 952)
  // Each label: 1-63 chars, alphanumeric or hyphen, must start/end with alphanumeric
  const domainRegex =
    /^(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

  if (!domainRegex.test(domain)) {
    return false;
  }

  // SECURITY: Block localhost and test domains
  const blockedDomains = [
    'localhost',
    'localhost.localdomain',
    'example.com',
    'example.org',
    'example.net',
    'test',
    'local',
    'internal'
  ];

  const normalizedDomain = domain.toLowerCase();
  if (blockedDomains.some(blocked => normalizedDomain === blocked || normalizedDomain.endsWith('.' + blocked))) {
    return false;
  }

  return true;
}

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

    // SECURITY: Use RFC 1123 compliant validation
    if (!isValidDomain(domain)) {
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
