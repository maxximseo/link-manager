const Queue = require('bull');
const logger = require('./logger');

let redisAvailable = false;

const createQueue = (name) => {
  if (!redisAvailable) return null;

  try {
    return new Queue(name, {
      redis: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });
  } catch (error) {
    logger.warn(`Queue ${name} creation failed: ${error.message}`);
    return null;
  }
};

// Test Redis connection
(async () => {
  try {
    const testQueue = createQueue('test');
    if (testQueue) {
      await testQueue.isReady();
      redisAvailable = true;
      await testQueue.close();
      logger.info('Redis available - queues enabled');
    }
  } catch {
    logger.warn('Redis unavailable - queues disabled');
  }
})();

module.exports = { createQueue, redisAvailable };
