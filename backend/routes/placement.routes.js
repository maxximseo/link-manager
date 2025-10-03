/**
 * Placement routes
 * Handles placement-related HTTP routes
 */

const express = require('express');
const router = express.Router();
const placementController = require('../controllers/placement.controller');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting
const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 placements per minute
  message: { error: 'Too many placement requests, please slow down' }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please slow down' }
});

// Apply auth middleware to all routes
router.use(authMiddleware);

// Placement routes - batch-only approach
router.get('/', generalLimiter, placementController.getPlacements);
router.get('/statistics', generalLimiter, placementController.getStatistics); // Must be before /:id
router.get('/:id', generalLimiter, placementController.getPlacement);
router.post('/batch/create', createLimiter, placementController.createBatchPlacement);
router.delete('/:id', generalLimiter, placementController.deletePlacement);

module.exports = router;