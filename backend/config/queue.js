const Redis = require('ioredis');
const Queue = require('bull');
const logger = require('./logger');

// Redis connection configuration for Valkey
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  username: process.env.REDIS_USER || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  
  // Connection pooling
  family: 4,
  keepAlive: true,
  
  // Timeouts
  connectTimeout: 10000,
  commandTimeout: 5000,
  
  // Retry configuration
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
};

// Queue configurations
const queueOptions = {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  },
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1,
    retryProcessDelay: 5000
  }
};

// Initialize Redis clients
let redisClient;
let queues = {};

function initializeRedis() {
  try {
    logger.info('Initializing Redis/Valkey connection', {
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db,
      hasPassword: !!redisConfig.password
    });
    
    redisClient = new Redis(redisConfig);
    
    redisClient.on('connect', () => {
      logger.info('✅ Redis/Valkey client connected successfully');
    });
    
    redisClient.on('ready', () => {
      logger.info('✅ Redis/Valkey client ready for commands');
    });
    
    redisClient.on('error', (error) => {
      logger.error('❌ Redis/Valkey client error', { 
        error: error.message,
        code: error.code,
        host: redisConfig.host,
        port: redisConfig.port
      });
    });
    
    redisClient.on('close', () => {
      logger.warn('⚠️ Redis/Valkey client disconnected');
    });
    
    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis/Valkey client reconnecting...');
    });
    
    // Test connection immediately
    redisClient.ping()
      .then(() => {
        logger.info('✅ Redis/Valkey PING successful - connection verified');
      })
      .catch((error) => {
        logger.error('❌ Redis/Valkey PING failed', { 
          error: error.message,
          config: {
            host: redisConfig.host,
            port: redisConfig.port,
            db: redisConfig.db
          }
        });
      });
    
    return redisClient;
  } catch (error) {
    logger.error('❌ Failed to initialize Redis/Valkey connections', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

function initializeQueues() {
  try {
    // Placement operations queue - high priority
    queues.placement = new Queue('placement', {
      ...queueOptions,
      defaultJobOptions: {
        ...queueOptions.defaultJobOptions,
        priority: 10 // HIGH
      }
    });
    
    // WordPress operations queue - normal priority  
    queues.wordpress = new Queue('wordpress', {
      ...queueOptions,
      defaultJobOptions: {
        ...queueOptions.defaultJobOptions,
        priority: 5 // NORMAL
      }
    });
    
    // Batch operations queue - low priority
    queues.batch = new Queue('batch', {
      ...queueOptions,
      defaultJobOptions: {
        ...queueOptions.defaultJobOptions,
        priority: 1, // LOW
        attempts: 5
      }
    });
    
    // Add global error handlers
    Object.keys(queues).forEach(queueName => {
      const queue = queues[queueName];
      
      queue.on('error', (error) => {
        logger.error(`Queue ${queueName} error`, { error: error.message });
      });
      
      queue.on('failed', (job, err) => {
        logger.error(`Job failed in ${queueName} queue`, {
          jobId: job.id,
          error: err.message,
          attempts: job.attemptsMade,
          data: job.data
        });
      });
      
      queue.on('completed', (job, result) => {
        logger.info(`Job completed in ${queueName} queue`, {
          jobId: job.id,
          duration: job.finishedOn - job.processedOn
        });
      });
    });
    
    logger.info('All queues initialized successfully', {
      queues: Object.keys(queues)
    });
    
    return queues;
  } catch (error) {
    logger.error('Failed to initialize queues', { error: error.message });
    throw error;
  }
}

// Health check for queues
async function healthCheck() {
  try {
    // Check Redis connection
    await redisClient.ping();
    
    // Check queue health
    const statuses = {};
    for (const [name, queue] of Object.entries(queues)) {
      try {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const failed = await queue.getFailed();
        
        statuses[name] = {
          waiting: waiting.length,
          active: active.length,
          failed: failed.length
        };
      } catch (error) {
        statuses[name] = { error: error.message };
      }
    }
    
    return {
      healthy: true,
      redis: 'connected',
      queues: statuses
    };
  } catch (error) {
    return {
      healthy: false,
      redis: 'disconnected',
      error: error.message
    };
  }
}

// Get queue by name
function getQueue(name) {
  if (!queues[name]) {
    throw new Error(`Queue ${name} not found`);
  }
  return queues[name];
}

module.exports = {
  initializeRedis,
  initializeQueues,
  getQueue,
  healthCheck,
  queues,
  redisClient: () => redisClient
};