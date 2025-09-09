/**
 * Main routes aggregator with graceful queue integration
 */

const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

// Import legacy server for fallback
const legacyRoutes = require('./legacy');

// Import queue routes (with graceful degradation)
let queueRoutes;
try {
  const { isQueueAvailable } = require('../workers');
  if (isQueueAvailable()) {
    queueRoutes = require('./queue.routes');
  } else {
    logger.warn('Queue services not available for routes');
  }
} catch (error) {
  logger.warn('Queue routes not available - queue service disabled');
}

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    architecture: 'modular',
    queue: !!queueRoutes
  });
});

// Queue routes (if available)
if (queueRoutes) {
  router.use('/queue', queueRoutes);
}

// Debug routes for troubleshooting (remove in production)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG === 'true') {
  try {
    const debugRoutes = require('./debug.routes');
    router.use('/debug', debugRoutes);
    logger.info('Debug routes enabled');
  } catch (error) {
    logger.warn('Debug routes not available');
  }
}

// Fallback to legacy routes for all other endpoints
router.use('/', legacyRoutes);

module.exports = router;