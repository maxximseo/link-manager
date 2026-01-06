/**
 * WordPress routes
 * Handles WordPress integration HTTP routes
 */

const express = require('express');
const router = express.Router();
const wordpressController = require('../controllers/wordpress.controller');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting for WordPress operations
const wordpressLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 WordPress requests per minute
  message: { error: 'Too many WordPress requests, please slow down' }
});

// Stricter rate limiting for public API endpoints (prevents API key enumeration)
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later' }
});

// WordPress integration routes
// SECURITY: API key in header instead of URL to prevent logging sensitive data
router.get('/get-content', publicApiLimiter, wordpressController.getContent); // Public endpoint with strict rate limit
router.post(
  '/publish-article',
  authMiddleware,
  wordpressLimiter,
  wordpressController.publishArticle
);
// SECURITY: Rate limit verify endpoint to prevent API key brute-force enumeration
router.post('/verify', publicApiLimiter, wordpressController.verifyConnection);
router.post('/content', wordpressLimiter, wordpressController.handleContent);

// Endpoint migration - confirm that plugin has applied new endpoint
router.post(
  '/confirm-endpoint-update',
  publicApiLimiter,
  wordpressController.confirmEndpointUpdate
);

module.exports = router;
