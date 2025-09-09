/**
 * Queue management routes for Redis/Valkey integration
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');

// Import queue service
let queueService;
try {
  queueService = require('../config/queue');
} catch (error) {
  logger.error('Queue service not available for routes');
}

// Queue health check
router.get('/health', asyncHandler(async (req, res) => {
  if (!queueService) {
    return res.status(503).json({
      healthy: false,
      error: 'Queue service not available'
    });
  }

  const health = await queueService.healthCheck();
  res.status(health.healthy ? 200 : 503).json(health);
}));

// Queue status
router.get('/status', asyncHandler(async (req, res) => {
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
}));

// Get job status
router.get('/jobs/:queueName/:jobId', asyncHandler(async (req, res) => {
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
}));

module.exports = router;