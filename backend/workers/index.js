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
      return {
        success: false,
        message: 'Queue service not available - Redis/Valkey not configured'
      };
    }

    try {
      // Initialize Redis connection
      const redisClient = queueService.initializeRedis();
      
      // Test connection
      await redisClient.ping();
      
      // Initialize queues
      const queues = queueService.initializeQueues();
      
      // Start workers
      this.startWorkers(queues);
      
      this.isHealthy = true;
      isInitialized = true;
      
      return {
        success: true,
        workers: this.workers.length,
        queues: Object.keys(queues)
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