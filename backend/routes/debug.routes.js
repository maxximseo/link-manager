/**
 * Debug routes for Redis/Valkey connection diagnostics
 * ONLY for troubleshooting - remove in production
 */

const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

// Test Redis connection with detailed diagnostics
router.get('/redis-test', async (req, res) => {
  try {
    const Redis = require('ioredis');
    
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      username: process.env.REDIS_USER || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      connectTimeout: 30000, // Increased from 10000
      commandTimeout: 15000, // Increased from 5000
      lazyConnect: true,
      maxRetriesPerRequest: 10, // Increased from 1
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      
      // TLS/SSL configuration for DigitalOcean Valkey
      tls: process.env.REDIS_HOST && process.env.REDIS_HOST.includes('digitalocean.com') ? {
        rejectUnauthorized: false
      } : undefined,
      
      // Connection pooling
      family: 4,
      keepAlive: true
    };
    
    logger.info('Testing Redis connection', { 
      host: config.host,
      port: config.port,
      hasUser: !!config.username,
      hasPassword: !!config.password,
      db: config.db
    });
    
    const redis = new Redis(config);
    
    // Test connection
    const start = Date.now();
    const result = await redis.ping();
    const duration = Date.now() - start;
    
    // Get server info
    const info = await redis.info();
    const version = info.split('\n').find(line => line.startsWith('redis_version'));
    const clients = info.split('\n').find(line => line.startsWith('connected_clients'));
    
    await redis.disconnect();
    
    res.json({
      success: true,
      ping: result,
      duration: `${duration}ms`,
      server: {
        version: version || 'unknown',
        clients: clients || 'unknown'
      },
      config: {
        host: config.host,
        port: config.port,
        hasAuth: !!config.username && !!config.password,
        db: config.db
      }
    });
    
  } catch (error) {
    logger.error('Redis connection test failed', { 
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN',
      config: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        hasUser: !!process.env.REDIS_USER,
        hasPassword: !!process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB
      },
      troubleshooting: {
        networkAccess: 'Check Valkey trusted sources include DigitalOcean App Platform IPs',
        authentication: 'Verify REDIS_USER=default and correct password',
        endpoint: 'Confirm using public endpoint, not private network'
      }
    });
  }
});

// Environment variables check
router.get('/env-check', (req, res) => {
  res.json({
    redis: {
      host: process.env.REDIS_HOST || 'NOT_SET',
      port: process.env.REDIS_PORT || 'NOT_SET',
      user: process.env.REDIS_USER || 'NOT_SET',
      hasPassword: !!process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 'NOT_SET'
    },
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;