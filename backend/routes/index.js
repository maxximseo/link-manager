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
    } catch (error) {
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

// Queue routes (if available)
if (queueRoutes) {
  router.use('/queue', queueRoutes);
}

// Debug routes for troubleshooting  
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG === 'true') {
  try {
    const debugRoutes = require('./debug.routes');
    router.use('/debug', debugRoutes);
    logger.info('Debug routes enabled', { 
      nodeEnv: process.env.NODE_ENV, 
      debugEnabled: process.env.ENABLE_DEBUG 
    });
  } catch (error) {
    logger.warn('Debug routes not available', { error: error.message });
  }
} else {
  logger.info('Debug routes disabled for production - set ENABLE_DEBUG=true to enable');
}

// Fallback to legacy routes for all other endpoints not yet modularized
router.use('/', legacyRoutes);

module.exports = router;