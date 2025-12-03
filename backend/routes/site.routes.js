/**
 * Site routes
 * Handles site-related HTTP routes
 */

const express = require('express');
const router = express.Router();
const siteController = require('../controllers/site.controller');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting
const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { error: 'Too many site creation requests, please slow down' }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please slow down' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 WordPress registrations per minute (prevent abuse)
  message: { error: 'Too many registration attempts, please slow down' }
});

// WordPress self-registration endpoint (NO auth - uses token)
router.post('/register-from-wordpress', registerLimiter, siteController.registerFromWordPress);

// Apply auth middleware to all OTHER routes
router.use(authMiddleware);

// Registration token routes (require auth)
router.post('/generate-token', generalLimiter, siteController.generateToken);
router.get('/tokens', generalLimiter, siteController.getTokens);
router.delete('/tokens/:id', generalLimiter, siteController.deleteToken);

// Site CRUD routes
router.get('/', generalLimiter, siteController.getSites);
router.get('/marketplace', generalLimiter, siteController.getMarketplaceSites); // Must be BEFORE /:id
router.get('/:id', generalLimiter, siteController.getSite);
router.post('/', createLimiter, siteController.createSite);
router.put('/:id', generalLimiter, siteController.updateSite);
router.delete('/:id', generalLimiter, siteController.deleteSite);

// Special operations
router.post('/recalculate-stats', generalLimiter, siteController.recalculateStats);

module.exports = router;
