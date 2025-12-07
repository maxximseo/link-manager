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
const emailService = require('../services/email.service');

// Anomaly thresholds
const THRESHOLDS = {
  AVG_RESPONSE_TIME_MS: 500, // Alert if avg response > 500ms
  ERROR_RATE_PERCENT: 5, // Alert if error rate > 5%
  MEMORY_USAGE_PERCENT: 85, // Alert if memory usage > 85%
  DB_WAITING_CONNECTIONS: 5 // Alert if waiting connections > 5
};

// Debounce email alerts (1 per 30 minutes per type)
const lastAlertSent = {};
const ALERT_DEBOUNCE_MS = 30 * 60 * 1000; // 30 minutes

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

// Detailed metrics endpoint for monitoring
router.get('/metrics', healthLimiter, async (_req, res) => {
  const { pool } = require('../config/database');

  // Calculate uptime
  const uptimeMs = Date.now() - serverStartTime;
  const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

  // Calculate average response time
  const avgResponseTime =
    requestMetrics.responseTimes.length > 0
      ? Math.round(
          requestMetrics.responseTimes.reduce((a, b) => a + b, 0) /
            requestMetrics.responseTimes.length
        )
      : 0;

  // Get database pool stats
  const dbStats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  };

  // Get Redis status
  let redisStatus = 'disconnected';
  try {
    await cache.set('metrics:ping', '1', 5);
    const val = await cache.get('metrics:ping');
    redisStatus = val === '1' ? 'connected' : 'degraded';
  } catch (_e) {
    redisStatus = 'disconnected';
  }

  // Get queue stats
  let queueStats = null;
  try {
    const placementQueue = queueService.getQueue('placement');
    if (placementQueue) {
      const counts = await placementQueue.getJobCounts();
      queueStats = {
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed
      };
    }
  } catch (_e) {
    queueStats = null;
  }

  // Get database stats
  let dbRecordCounts = {};
  try {
    const [users, projects, sites, placements] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM projects'),
      query('SELECT COUNT(*) as count FROM sites'),
      query('SELECT COUNT(*) as count FROM placements')
    ]);
    dbRecordCounts = {
      users: parseInt(users.rows[0].count) || 0,
      projects: parseInt(projects.rows[0].count) || 0,
      sites: parseInt(sites.rows[0].count) || 0,
      placements: parseInt(placements.rows[0].count) || 0
    };
  } catch (_e) {
    dbRecordCounts = { error: 'Failed to fetch counts' };
  }

  // Top 5 endpoints by traffic
  const topEndpoints = Object.entries(requestMetrics.byEndpoint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([endpoint, count]) => ({ endpoint, count }));

  res.json({
    uptime: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`,
    uptimeSeconds: Math.floor(uptimeMs / 1000),
    requests: {
      total: requestMetrics.total,
      avgResponseTimeMs: avgResponseTime,
      errors: requestMetrics.errors
    },
    topEndpoints,
    database: {
      pool: dbStats,
      records: dbRecordCounts
    },
    redis: {
      status: redisStatus
    },
    queue: queueStats,
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    timestamp: new Date().toISOString()
  });
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

/**
 * Check for system anomalies and send email alerts
 * Called by cron job every 5 minutes
 */
async function checkAnomaliesAndAlert() {
  const { pool } = require('../config/database');
  const anomalies = [];

  // Calculate average response time
  const avgResponseTime =
    requestMetrics.responseTimes.length > 0
      ? requestMetrics.responseTimes.reduce((a, b) => a + b, 0) / requestMetrics.responseTimes.length
      : 0;

  // Check response time
  if (avgResponseTime > THRESHOLDS.AVG_RESPONSE_TIME_MS) {
    anomalies.push(`Высокое время ответа: ${Math.round(avgResponseTime)}ms (порог: ${THRESHOLDS.AVG_RESPONSE_TIME_MS}ms)`);
  }

  // Check error rate
  if (requestMetrics.total > 100) {
    const errorRate = (requestMetrics.errors.count / requestMetrics.total) * 100;
    if (errorRate > THRESHOLDS.ERROR_RATE_PERCENT) {
      anomalies.push(`Высокий процент ошибок: ${errorRate.toFixed(1)}% (порог: ${THRESHOLDS.ERROR_RATE_PERCENT}%)`);
    }
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  if (heapUsedPercent > THRESHOLDS.MEMORY_USAGE_PERCENT) {
    anomalies.push(`Высокое использование памяти: ${heapUsedPercent.toFixed(1)}% (порог: ${THRESHOLDS.MEMORY_USAGE_PERCENT}%)`);
  }

  // Check database pool
  if (pool.waitingCount > THRESHOLDS.DB_WAITING_CONNECTIONS) {
    anomalies.push(`Много ожидающих DB соединений: ${pool.waitingCount} (порог: ${THRESHOLDS.DB_WAITING_CONNECTIONS})`);
  }

  // Check Redis
  let redisStatus = 'connected';
  try {
    await cache.set('anomaly:check', '1', 5);
    const val = await cache.get('anomaly:check');
    if (val !== '1') redisStatus = 'degraded';
  } catch (_e) {
    redisStatus = 'disconnected';
    anomalies.push('Redis недоступен');
  }

  // If anomalies found, send alert (with debounce)
  if (anomalies.length > 0) {
    const alertKey = anomalies.sort().join('|');
    const now = Date.now();

    if (!lastAlertSent[alertKey] || now - lastAlertSent[alertKey] > ALERT_DEBOUNCE_MS) {
      lastAlertSent[alertKey] = now;

      const uptimeMs = Date.now() - serverStartTime;
      const metrics = {
        uptime: `${Math.floor(uptimeMs / (1000 * 60 * 60 * 24))}d ${Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))}h`,
        memory: {
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
        },
        database: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount
        },
        redis: { status: redisStatus },
        requests: {
          total: requestMetrics.total,
          avgResponseTimeMs: Math.round(avgResponseTime),
          errors: requestMetrics.errors
        }
      };

      await emailService.sendHealthAlert(metrics, anomalies);
      return { alerted: true, anomalies };
    }
  }

  return { alerted: false, anomalies };
}

module.exports = router;
module.exports.trackRequest = trackRequest;
module.exports.checkAnomaliesAndAlert = checkAnomaliesAndAlert;
module.exports.requestMetrics = requestMetrics;
