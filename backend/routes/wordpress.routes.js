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

// WordPress integration routes
router.get('/get-content/:api_key', wordpressController.getContent); // No auth for WordPress plugin
router.post('/publish-article', authMiddleware, wordpressLimiter, wordpressController.publishArticle);
router.post('/verify', wordpressController.verifyConnection); // No auth for verification
router.post('/content', wordpressLimiter, wordpressController.handleContent);

module.exports = router;