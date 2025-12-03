/**
 * Worker manager for Redis Queue system
 * Gracefully handles Redis/Valkey unavailability
 */

const logger = require('../config/logger');

let queueService;
let isInitialized = false;

// Try to load queue service
try {
  queueService = require('../config/queue');
} catch (error) {
  logger.warn('Queue service not available, batch operations will be disabled', {
    error: error.message
  });
}

class WorkerManager {
  constructor() {
    this.workers = [];
    this.isHealthy = false;
  }

  async initialize() {
    if (!queueService) {
      logger.warn('Queue service not available - Redis/Valkey not configured');
      return {
        success: false,
        message: 'Queue service not available - Redis/Valkey not configured'
      };
    }

    try {
      // Try to create queues - if Redis is unavailable, createQueue will return null
      const queues = {
        placement: queueService.createQueue('placement'),
        wordpress: queueService.createQueue('wordpress'),
        batch: queueService.createQueue('batch')
      };

      // Filter out null queues (failed to create)
      const availableQueues = Object.keys(queues).filter(k => queues[k] !== null);

      if (availableQueues.length === 0) {
        logger.warn('Redis not available - no queues could be created');
        return {
          success: false,
          message: 'Redis not available - queue workers disabled'
        };
      }

      // Start workers for available queues
      this.startWorkers(queues);
      this.isHealthy = true;
      isInitialized = true;

      logger.info(`Queue workers initialized successfully`, {
        workers: this.workers.length,
        queues: availableQueues
      });

      return {
        success: true,
        workers: this.workers.length,
        queues: availableQueues
      };
    } catch (error) {
      logger.error('Failed to initialize queue workers', { error: error.message });
      return {
        success: false,
        message: `Queue initialization failed: ${error.message}`
      };
    }
  }

  startWorkers(queues) {
    // Placement worker
    if (queues.placement) {
      queues.placement.process('batch-placement', 5, require('./placement.worker'));
      this.workers.push('placement-worker');
    }

    // WordPress worker
    if (queues.wordpress) {
      queues.wordpress.process('publish-articles', 3, require('./wordpress.worker'));
      this.workers.push('wordpress-worker');
    }

    // Batch worker
    if (queues.batch) {
      queues.batch.process('export', 2, require('./batch.worker'));
      this.workers.push('batch-worker');
    }

    logger.info(`Started ${this.workers.length} queue workers`);
  }

  async shutdown() {
    if (!queueService || !isInitialized) {
      return;
    }

    try {
      const queues = queueService.queues;
      for (const [name, queue] of Object.entries(queues)) {
        await queue.close();
        logger.info(`Queue ${name} closed`);
      }

      this.isHealthy = false;
      logger.info('All queue workers shut down');
    } catch (error) {
      logger.error('Error shutting down workers', { error: error.message });
    }
  }

  getStatus() {
    return {
      initialized: isInitialized,
      healthy: this.isHealthy,
      workers: this.workers.length,
      queueAvailable: !!queueService
    };
  }
}

let workerManager = null;

function getWorkerManager() {
  if (!workerManager) {
    workerManager = new WorkerManager();
  }
  return workerManager;
}

module.exports = {
  getWorkerManager,
  isQueueAvailable: () => !!queueService && isInitialized
};
