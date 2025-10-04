const Queue = require('bull');
const logger = require('./logger');

let redisAvailable = false;

// Build Redis config for Bull
function getRedisConfig() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    db: parseInt(process.env.REDIS_DB) || 0
  };

  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }

  if (process.env.REDIS_USER) {
    config.username = process.env.REDIS_USER;
  }

  // Enable TLS for DigitalOcean
  if (process.env.REDIS_HOST && process.env.REDIS_HOST.includes('ondigitalocean.com')) {
    config.tls = {
      rejectUnauthorized: false
    };
  }

  return config;
}

const createQueue = (name) => {
  // Don't check redisAvailable - it's set asynchronously
  // Just try to create queue and handle errors gracefully
  try {
    const queue = new Queue(name, {
      redis: getRedisConfig()
    });
    return queue;
  } catch (error) {
    logger.warn(`Queue ${name} creation failed: ${error.message}`);
    return null;
  }
};

// Test Redis connection
(async () => {
  try {
    const testQueue = new Queue('test', {
      redis: getRedisConfig()
    });

    await testQueue.isReady();
    redisAvailable = true;
    await testQueue.close();
    logger.info('Bull Queue available - async workers enabled');
  } catch (error) {
    logger.warn('Bull Queue unavailable - async workers disabled:', error.message);
  }
})();

module.exports = { createQueue, redisAvailable };
