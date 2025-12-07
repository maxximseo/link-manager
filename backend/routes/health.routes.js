/**
 * Health check routes
 * Monitors system components status
 * SECURITY: Rate limited to prevent abuse
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { query } = require('../config/database');
const cache = require('../services/cache.service');
const queueService = require('../config/queue');
const Sentry = require('@sentry/node');
const { runManualBackup } = require('../cron/database-backup.cron');

// Track server start time and request metrics
const serverStartTime = Date.now();
const requestMetrics = {
  total: 0,
  byEndpoint: {},
  responseTimes: [],
  errors: { count: 0, last: null }
};

// Middleware to track requests (call this from app.js)
function trackRequest(req, res, next) {
  const start = Date.now();
  requestMetrics.total++;

  const endpoint = `${req.method} ${req.path}`;
  requestMetrics.byEndpoint[endpoint] = (requestMetrics.byEndpoint[endpoint] || 0) + 1;

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Keep last 100 response times for averaging
    requestMetrics.responseTimes.push(duration);
    if (requestMetrics.responseTimes.length > 100) {
      requestMetrics.responseTimes.shift();
    }

    if (res.statusCode >= 500) {
      requestMetrics.errors.count++;
      requestMetrics.errors.last = new Date().toISOString();
    }
  });

  next();
}

// SECURITY: Constant-time comparison to prevent timing attacks
function secureCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Rate limiting for health check (60 req/min - allow monitoring systems)
const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute (1 per second for monitoring)
  message: { error: 'Too many health check requests' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for backup endpoint (5 req/min - very restrictive)
const backupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: { error: 'Too many backup requests' },
  standardHeaders: true,
  legacyHeaders: false
});

// Health check endpoint - checks all system components
router.get('/', healthLimiter, async (req, res) => {
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
router.get('/sentry-test', healthLimiter, (req, res) => {
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
router.post('/backup', backupLimiter, async (req, res) => {
  // SECURITY: Use dedicated BACKUP_ADMIN_KEY env var with constant-time comparison
  // NEVER derive backup key from JWT_SECRET (weak key derivation)
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.BACKUP_ADMIN_KEY;

  if (!expectedKey) {
    return res.status(500).json({ error: 'Backup admin key not configured' });
  }

  if (!secureCompare(adminKey, expectedKey)) {
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
