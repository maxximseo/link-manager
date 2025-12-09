/**
 * Main routes aggregator with graceful queue integration
 */

const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

// Import modular routes
const authRoutes = require('./auth.routes');
const projectRoutes = require('./project.routes');
const siteRoutes = require('./site.routes');
const placementRoutes = require('./placement.routes');
const wordpressRoutes = require('./wordpress.routes');
const staticRoutes = require('./static.routes');
const billingRoutes = require('./billing.routes');
const adminRoutes = require('./admin.routes');
const notificationRoutes = require('./notification.routes');
const referralRoutes = require('./referral.routes');
const paymentRoutes = require('./payment.routes');
const webhookRoutes = require('./webhook.routes');

// Import legacy server for fallback (for routes not yet modularized)
const legacyRoutes = require('./legacy');

// Import queue routes (lazy loading for proper initialization timing)
let queueRoutes;
try {
  queueRoutes = require('./queue.routes');
  logger.info('Queue routes loaded successfully');
} catch (error) {
  logger.warn('Queue routes not available - queue service disabled', { error: error.message });
}

// Health check
router.get('/health', (req, res) => {
  let queueStatus = false;

  // Check if queue routes are loaded and workers are available
  if (queueRoutes) {
    try {
      const { isQueueAvailable } = require('../workers');
      queueStatus = isQueueAvailable();
    } catch (_error) {
      // Queue workers not available
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    architecture: 'modular',
    queue: queueStatus
  });
});

// Modular routes (specific routes first for priority)
router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/sites', siteRoutes);
router.use('/placements', placementRoutes);
router.use('/wordpress', wordpressRoutes);
router.use('/static', staticRoutes); // Public API for static PHP widgets
router.use('/billing', billingRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/referrals', referralRoutes);

// Queue routes (if available)
if (queueRoutes) {
  router.use('/queue', queueRoutes);
}

// Debug routes for troubleshooting (ONLY in development)
if (process.env.NODE_ENV === 'development') {
  try {
    const debugRoutes = require('./debug.routes');
    router.use('/debug', debugRoutes);
    logger.info('Debug routes enabled in development mode');
  } catch (error) {
    logger.warn('Debug routes not available', { error: error.message });
  }
} else {
  logger.info('Debug routes disabled in production for security');
}

// Fallback to legacy routes for all other endpoints not yet modularized
router.use('/', legacyRoutes);

// CSRF token endpoint (optional, primarily for form-based authentication)
// Note: JWT in Authorization headers already provides CSRF protection
const { getCsrfToken } = require('../middleware/csrf.middleware');
router.get('/csrf-token', getCsrfToken);

module.exports = router;
