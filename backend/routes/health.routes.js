/**
 * Health check routes
 * Monitors system components status
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const cache = require('../services/cache.service');
const queueService = require('../config/queue');

// Health check endpoint - checks all system components
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    components: {}
  };

  // Check database
  try {
    await query('SELECT 1');
    health.components.database = { status: 'healthy', message: 'Connected' };
  } catch (error) {
    health.status = 'unhealthy';
    health.components.database = { status: 'unhealthy', message: error.message };
  }

  // Check Redis
  try {
    await cache.set('health:check', '1', 10);
    const value = await cache.get('health:check');
    health.components.redis =
      value === '1'
        ? { status: 'healthy', message: 'Connected' }
        : { status: 'degraded', message: 'Connection issue' };
  } catch (_error) {
    health.components.redis = {
      status: 'degraded',
      message: 'Not available (graceful degradation active)'
    };
  }

  // Check queue system
  try {
    const placementQueue = queueService.getQueue('placement');
    if (placementQueue) {
      const jobCounts = await placementQueue.getJobCounts();
      health.components.queue = {
        status: 'healthy',
        message: 'Running',
        stats: {
          waiting: jobCounts.waiting,
          active: jobCounts.active,
          completed: jobCounts.completed,
          failed: jobCounts.failed
        }
      };
    } else {
      health.components.queue = { status: 'degraded', message: 'Queue not initialized' };
    }
  } catch (_error) {
    health.components.queue = { status: 'degraded', message: 'Not available' };
  }

  // Set HTTP status based on overall health
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
