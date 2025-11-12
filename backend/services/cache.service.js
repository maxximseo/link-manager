/**
 * Cache service using Redis
 * Provides simple get/set/del operations with TTL support
 */

const Redis = require('ioredis');
const logger = require('../config/logger');

let redis = null;
let cacheAvailable = false;

// Initialize Redis connection
function initRedis() {
  try {
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.warn('Redis connection failed after 10 retries - cache disabled');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      },
      maxRetriesPerRequest: 10,
      connectTimeout: 30000,
      commandTimeout: 15000,
      enableReadyCheck: true,
      lazyConnect: true
    };

    // Add password if provided
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    // Add username if provided (DigitalOcean uses 'default')
    if (process.env.REDIS_USER) {
      config.username = process.env.REDIS_USER;
    }

    // Enable TLS for DigitalOcean Managed Redis
    if (process.env.REDIS_HOST && process.env.REDIS_HOST.includes('ondigitalocean.com')) {
      config.tls = {
        rejectUnauthorized: false // Accept self-signed certificates
      };
      logger.info('Redis TLS enabled for DigitalOcean');
    }

    redis = new Redis(config);

    redis.on('connect', () => {
      cacheAvailable = true;
      logger.info('Redis cache connected successfully');
    });

    redis.on('error', (err) => {
      cacheAvailable = false;
      logger.warn('Redis cache error:', err.message);
    });

    redis.on('close', () => {
      cacheAvailable = false;
      logger.warn('Redis cache connection closed');
    });

    // Connect to Redis
    redis.connect().catch((err) => {
      logger.warn('Failed to connect to Redis cache:', err.message);
      cacheAvailable = false;
    });

  } catch (error) {
    logger.warn('Redis initialization failed:', error.message);
    cacheAvailable = false;
  }
}

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Parsed value or null
 */
async function get(key) {
  if (!cacheAvailable || !redis) return null;

  try {
    const value = await redis.get(key);
    if (value) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    logger.warn('Cache get error:', error.message);
    return null;
  }
}

/**
 * Set value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {Promise<boolean>} - Success status
 */
async function set(key, value, ttl = 300) {
  if (!cacheAvailable || !redis) return false;

  try {
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttl, serialized);
    return true;
  } catch (error) {
    logger.warn('Cache set error:', error.message);
    return false;
  }
}

/**
 * Delete value from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - Success status
 */
async function del(key) {
  if (!cacheAvailable || !redis) return false;

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.warn('Cache del error:', error.message);
    return false;
  }
}

/**
 * Delete all keys matching pattern
 * @param {string} pattern - Key pattern (e.g., "wp:*")
 * @returns {Promise<number>} - Number of keys deleted
 */
async function delPattern(pattern) {
  if (!cacheAvailable || !redis) return 0;

  try {
    let cursor = '0';
    let deletedCount = 0;

    // Use SCAN instead of KEYS to avoid blocking Redis server
    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (error) {
    logger.warn('Cache delPattern error:', error.message);
    return 0;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<object>} - Cache stats
 */
async function getStats() {
  if (!cacheAvailable || !redis) {
    return { available: false };
  }

  try {
    const info = await redis.info('stats');
    const keyCount = await redis.dbsize();

    return {
      available: true,
      connected: cacheAvailable,
      keyCount,
      info
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

// Initialize on module load
initRedis();

module.exports = {
  get,
  set,
  del,
  delPattern,
  getStats,
  isAvailable: () => cacheAvailable
};
