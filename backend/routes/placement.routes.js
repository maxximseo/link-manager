/**
 * Placement routes
 * Handles placement-related HTTP routes
 */

const express = require('express');
const router = express.Router();
const placementController = require('../controllers/placement.controller');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
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

// TEST 6: Legacy endpoint - 410 Gone
// Old placement creation endpoint is deprecated in favor of billing system
router.post('/', (req, res) => {
  res.status(410).json({
    error: 'This endpoint is deprecated and no longer available',
    message: 'Placement creation has been moved to the billing system',
    newEndpoint: 'POST /api/billing/purchase',
    migration: 'Please use the new billing API to purchase placements',
    documentation: 'See API docs for migration guide'
  });
});

// Placement routes - READ-ONLY (creation moved to billing API for payment enforcement)
router.get('/', generalLimiter, placementController.getPlacements);
router.get('/statistics', generalLimiter, placementController.getStatistics); // Must be before /:id
router.get('/available-sites/:projectId', generalLimiter, placementController.getAvailableSites); // Must be before /:id
router.get('/by-site/:siteId', generalLimiter, placementController.getPlacementsBySite); // Get placements for a site
router.get('/:id', generalLimiter, placementController.getPlacement);
// REMOVED: router.post('/batch/create') - SECURITY: Bypassed billing system
// REMOVED: router.post('/batch/async') - SECURITY: Bypassed billing system
// USE INSTEAD: POST /api/billing/purchase for paid placements
router.get('/job/:jobId', generalLimiter, placementController.getJobStatus);
router.post('/job/:jobId/cancel', generalLimiter, placementController.cancelJob);
// Publish scheduled placement NOW (manual trigger)
router.post('/:id/publish-now', generalLimiter, placementController.publishScheduledPlacement);
// ADMIN ONLY: Only administrators can delete placements (with refund)
router.delete('/:id', generalLimiter, adminMiddleware, placementController.deletePlacement);

module.exports = router;