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

// Placement routes - READ-ONLY (creation moved to billing API for payment enforcement)
router.get('/', generalLimiter, placementController.getPlacements);
router.get('/statistics', generalLimiter, placementController.getStatistics); // Must be before /:id
router.get('/available-sites/:projectId', generalLimiter, placementController.getAvailableSites); // Must be before /:id
router.get('/:id', generalLimiter, placementController.getPlacement);
// REMOVED: router.post('/batch/create') - SECURITY: Bypassed billing system
// REMOVED: router.post('/batch/async') - SECURITY: Bypassed billing system
// USE INSTEAD: POST /api/billing/purchase for paid placements
router.get('/job/:jobId', generalLimiter, placementController.getJobStatus);
router.post('/job/:jobId/cancel', generalLimiter, placementController.cancelJob);
router.delete('/:id', generalLimiter, placementController.deletePlacement);

module.exports = router;