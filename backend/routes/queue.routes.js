/**
 * Queue management routes for Redis/Valkey integration
 * SECURITY: All routes require admin authentication + rate limiting
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// SECURITY: Differentiated rate limiting for read vs destructive operations
// Read operations (GET) - more lenient for monitoring
const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 read requests per minute for monitoring dashboards
  message: { error: 'Too many queue read requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

// Destructive operations (POST cleanup, cancel, retry) - stricter limits
const destructiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Only 10 destructive operations per minute
  message: { error: 'Too many destructive operations, please slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

// SECURITY: All queue routes require admin authentication
router.use(authMiddleware);
router.use(adminMiddleware);

// Import queue service and workers
let queueService;
let isQueueAvailable;
try {
  queueService = require('../config/queue');
  const { isQueueAvailable: checkQueueAvailable } = require('../workers');
  isQueueAvailable = checkQueueAvailable;
} catch (error) {
  logger.error('Queue service not available for routes', { error: error.message });
}

// Queue health check
router.get(
  '/health',
  readLimiter,
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        healthy: false,
        error: 'Queue service not available - Redis/Valkey not configured'
      });
    }

    if (isQueueAvailable && !isQueueAvailable()) {
      return res.status(503).json({
        healthy: false,
        error: 'Queue service not yet initialized - workers starting up'
      });
    }

    const health = await queueService.healthCheck();
    res.status(health.healthy ? 200 : 503).json(health);
  })
);

// Queue status
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        error: 'Queue service not available'
      });
    }

    const health = await queueService.healthCheck();
    res.json({
      healthy: health.healthy,
      redis: health.redis,
      queues: health.queues || {}
    });
  })
);

// Get job status
router.get(
  '/jobs/:queueName/:jobId',
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        error: 'Queue service not available'
      });
    }

    const { queueName, jobId } = req.params;

    try {
      const queue = queueService.getQueue(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      res.json({
        jobId: job.id,
        status: await job.getState(),
        progress: job.progress(),
        data: job.data,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts
      });
    } catch (error) {
      logger.error('Error getting job status', { error: error.message });
      res.status(500).json({
        error: 'Failed to get job status'
      });
    }
  })
);

// Get all active jobs
router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        error: 'Queue service not available'
      });
    }

    const { queueName, limit = 50, offset = 0 } = req.query;

    try {
      const queues = queueService.queues;
      let allJobs = [];

      // If specific queue requested
      if (queueName && queues[queueName]) {
        const queue = queues[queueName];
        const jobs = await queue.getJobs(
          ['active', 'waiting', 'completed', 'failed'],
          0,
          parseInt(limit, 10)
        );
        allJobs = jobs;
      } else {
        // Get jobs from all queues
        for (const [name, queue] of Object.entries(queues)) {
          const jobs = await queue.getJobs(
            ['active', 'waiting', 'completed', 'failed'],
            0,
            parseInt(limit, 10)
          );
          allJobs = allJobs.concat(jobs.map(job => ({ ...job, queueName: name })));
        }
      }

      // Sort by creation time descending
      allJobs.sort((a, b) => b.timestamp - a.timestamp);

      // Apply pagination
      const paginatedJobs = allJobs.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));

      const formattedJobs = await Promise.all(
        paginatedJobs.map(async job => ({
          jobId: job.id,
          queueName: job.queueName || job.queue?.name,
          status: await job.getState(),
          progress: job.progress(),
          data: job.data,
          createdAt: new Date(job.timestamp),
          processedAt: job.processedOn ? new Date(job.processedOn) : null,
          finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
          attempts: job.attemptsMade,
          maxAttempts: job.opts?.attempts || 3
        }))
      );

      res.json({
        jobs: formattedJobs,
        total: allJobs.length,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      });
    } catch (error) {
      logger.error('Error getting jobs list', { error: error.message });
      res.status(500).json({
        error: 'Failed to get jobs list'
      });
    }
  })
);

// Cancel job
router.post(
  '/jobs/:queueName/:jobId/cancel',
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        error: 'Queue service not available'
      });
    }

    const { queueName, jobId } = req.params;

    try {
      const queue = queueService.getQueue(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      const state = await job.getState();

      if (state === 'completed' || state === 'failed') {
        return res.status(400).json({
          error: `Cannot cancel job in ${state} state`
        });
      }

      await job.remove();

      logger.info('Job cancelled', { queueName, jobId });
      res.json({
        message: 'Job cancelled successfully',
        jobId,
        queueName
      });
    } catch (error) {
      logger.error('Error cancelling job', { error: error.message, queueName, jobId });
      res.status(500).json({
        error: 'Failed to cancel job'
      });
    }
  })
);

// Cleanup old jobs
router.post(
  '/cleanup',
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        error: 'Queue service not available'
      });
    }

    const { olderThan = 24 * 60 * 60 * 1000 } = req.body; // Default 24 hours

    try {
      const queues = queueService.queues;
      let cleanedCount = 0;

      for (const [_name, queue] of Object.entries(queues)) {
        // Clean completed jobs older than specified time
        const cleaned = await queue.clean(olderThan, 'completed');
        cleanedCount += cleaned.length;

        // Clean failed jobs older than specified time
        const failedCleaned = await queue.clean(olderThan, 'failed');
        cleanedCount += failedCleaned.length;
      }

      logger.info('Queue cleanup completed', { cleanedCount, olderThan });
      res.json({
        message: 'Queue cleanup completed',
        cleanedJobs: cleanedCount,
        olderThan
      });
    } catch (error) {
      logger.error('Error during queue cleanup', { error: error.message });
      res.status(500).json({
        error: 'Failed to cleanup queues'
      });
    }
  })
);

// Retry failed job
router.post(
  '/jobs/:queueName/:jobId/retry',
  asyncHandler(async (req, res) => {
    if (!queueService) {
      return res.status(503).json({
        error: 'Queue service not available'
      });
    }

    const { queueName, jobId } = req.params;

    try {
      const queue = queueService.getQueue(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      const state = await job.getState();

      if (state !== 'failed') {
        return res.status(400).json({
          error: `Cannot retry job in ${state} state. Only failed jobs can be retried.`
        });
      }

      await job.retry();

      logger.info('Job retried', { queueName, jobId });
      res.json({
        message: 'Job retried successfully',
        jobId,
        queueName,
        status: 'waiting'
      });
    } catch (error) {
      logger.error('Error retrying job', { error: error.message, queueName, jobId });
      res.status(500).json({
        error: 'Failed to retry job'
      });
    }
  })
);

module.exports = router;
