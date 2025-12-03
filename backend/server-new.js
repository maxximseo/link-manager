/**
 * Server entry point for new modular architecture with Redis Queue support
 * Gracefully degrades to legacy functionality when Redis/Valkey unavailable
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

// Initialize Sentry FIRST (before any other imports)
const Sentry = require('./instrument');

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
} catch (_error) {
  logger.warn('Queue workers not available - running without queue support');
}

// Cron jobs
const { initCronJobs } = require('./cron');

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

    // Initialize cron jobs
    try {
      initCronJobs();
      logger.info('Cron jobs initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize cron jobs', { error: error.message });
      // Continue without cron jobs - they can be run manually if needed
    }

    // Log Sentry status
    if (process.env.SENTRY_DSN) {
      logger.info('Sentry error monitoring initialized');
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

// Graceful shutdown - defined at module level for access from unhandledRejection handler
function gracefulShutdown(signal) {
  logger.info(`${signal} signal received: starting graceful shutdown`);

  if (!server) {
    logger.warn('Server not started yet, exiting immediately');
    process.exit(0);
    return;
  }

  // Close HTTP server first
  server.close(() => {
    logger.info('HTTP server closed');

    // Shutdown workers if available
    if (workerManager) {
      workerManager
        .shutdown()
        .then(() => {
          logger.info('Queue workers shut down successfully');
        })
        .catch(error => {
          logger.error('Error shutting down queue workers', { error: error.message });
        })
        .finally(() => {
          logger.info('Graceful shutdown complete');
          process.exit(0);
        });
    } else {
      logger.info('Graceful shutdown complete');
      process.exit(0);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
}

const serverPromise = startServer().then(s => {
  server = s;

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  // Send to Sentry before exit
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
    Sentry.close(2000).then(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);

  // Send to Sentry
  if (process.env.SENTRY_DSN && reason instanceof Error) {
    Sentry.captureException(reason);
  }

  // Only exit on critical database/system failures
  // Log and continue for application-level errors
  const isCritical =
    reason?.code === 'ECONNREFUSED' ||
    reason?.message?.includes('FATAL') ||
    reason?.message?.includes('database connection');

  if (isCritical) {
    logger.error('Critical system failure detected - initiating shutdown');
    gracefulShutdown('CRITICAL_ERROR');
  } else {
    // Log but don't crash - let error handling middleware deal with it
    logger.warn('Unhandled rejection logged - service continues');
  }
});

module.exports = serverPromise;
