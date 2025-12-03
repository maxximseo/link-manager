/**
 * Health check routes
 * Monitors system components status
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const cache = require('../services/cache.service');
const queueService = require('../config/queue');
const Sentry = require('@sentry/node');
const { runManualBackup } = require('../cron/database-backup.cron');

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

  // Check Sentry
  health.components.sentry = process.env.SENTRY_DSN
    ? { status: 'healthy', message: 'Configured' }
    : { status: 'disabled', message: 'Not configured (SENTRY_DSN not set)' };

  // Set HTTP status based on overall health
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Sentry test endpoint (development only)
router.get('/sentry-test', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  if (!process.env.SENTRY_DSN) {
    return res.status(400).json({ error: 'SENTRY_DSN not configured' });
  }

  // Send a test error to Sentry
  try {
    throw new Error('Sentry test error - triggered manually for verification');
  } catch (error) {
    Sentry.captureException(error);
    res.json({
      success: true,
      message: 'Test error sent to Sentry. Check your Sentry dashboard.',
      eventId: Sentry.lastEventId()
    });
  }
});

// Manual backup endpoint (requires admin key for security)
router.post('/backup', async (req, res) => {
  // Simple key-based auth for backup endpoint
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET?.slice(0, 32)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Check if backup is configured
  if (!process.env.DO_SPACES_KEY || !process.env.BACKUP_ENCRYPTION_KEY) {
    return res.status(400).json({ error: 'Backup not configured' });
  }

  try {
    const result = await runManualBackup();
    res.json({
      success: true,
      message: 'Backup completed successfully',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Backup failed',
      message: error.message
    });
  }
});

module.exports = router;
