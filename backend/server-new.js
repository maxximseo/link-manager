/**
 * Server entry point for new modular architecture with Redis Queue support
 * Gracefully degrades to legacy functionality when Redis/Valkey unavailable
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const app = require('./app');
const logger = require('./config/logger');
const { initDatabase, query } = require('./config/database');

// Debug environment variables
logger.info('Environment check:', {
  DATABASE_URL: process.env.DATABASE_URL ? 'provided' : 'missing',
  DB_HOST: process.env.DB_HOST || 'missing',
  DB_PORT: process.env.DB_PORT || 'missing',
  DB_NAME: process.env.DB_NAME || 'missing',
  DB_USER: process.env.DB_USER || 'missing',
  DB_PASSWORD: process.env.DB_PASSWORD ? 'provided' : 'missing',
  NODE_ENV: process.env.NODE_ENV || 'development'
});

// Queue workers - graceful degradation if not available
let workerManager;
try {
  const { getWorkerManager } = require('./workers');
  workerManager = getWorkerManager();
} catch (error) {
  logger.warn('Queue workers not available - running without queue support');
}

const PORT = process.env.PORT || 3000;

// Initialize application
async function startServer() {
  try {
    // Initialize database
    await initDatabase();
    
    // Warm up bcrypt to avoid cold start delay
    const bcrypt = require('bcryptjs');
    const warmupStart = Date.now();
    await bcrypt.hash('warmup', process.env.NODE_ENV === 'development' ? 8 : 10);
    logger.info(`Bcrypt warmed up in ${Date.now() - warmupStart}ms`);
    
    // Warm up database connection pool
    const dbStart = Date.now();
    await query('SELECT 1');
    logger.info(`Database pool warmed up in ${Date.now() - dbStart}ms`);
    
    // Initialize queue workers if available
    if (workerManager) {
      try {
        const workerStart = Date.now();
        const result = await workerManager.initialize();
        if (result.success) {
          logger.info(`Queue workers initialized in ${Date.now() - workerStart}ms`, {
            workers: result.workers
          });
        } else {
          logger.warn('Queue workers initialization failed', { message: result.message });
        }
      } catch (error) {
        logger.error('Failed to initialize queue workers', { error: error.message });
        // Continue without workers - graceful degradation
      }
    }
    
    logger.info('Application initialized successfully');
    
    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 New architecture server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔧 Architecture: Modular with Redis Queue support`);
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Start the server
let server;
const serverPromise = startServer().then(s => {
  server = s;
  
  // Graceful shutdown
  async function gracefulShutdown(signal) {
    logger.info(`${signal} signal received: starting graceful shutdown`);
    
    // Close HTTP server first
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Shutdown workers if available
      if (workerManager) {
        try {
          logger.info('Shutting down queue workers...');
          await workerManager.shutdown();
          logger.info('Queue workers shut down successfully');
        } catch (error) {
          logger.error('Error shutting down queue workers', { error: error.message });
        }
      }
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  return server;
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = serverPromise;