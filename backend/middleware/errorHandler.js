const logger = require('../config/logger');
const { notify500Error } = require('../services/security-alerts.service');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handler
// Note: Sentry.setupExpressErrorHandler() runs BEFORE this middleware
// and automatically captures exceptions with request context
const errorHandler = (err, req, res, _next) => {
  const error = { ...err };
  error.message = err.message;

  // Log error (Sentry handles the exception capture via setupExpressErrorHandler)
  logger.error('Error handler:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    sentryId: res.sentry // Sentry event ID attached by setupExpressErrorHandler
  });

  // Database connection errors
  if (err.code === 'ECONNREFUSED') {
    error.message = 'Database connection failed';
    error.statusCode = 503;
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error.message = message.join(', ');
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Determine final status code
  const statusCode = error.statusCode || 500;

  // SECURITY: Notify admins about 500 errors (async, don't block response)
  if (statusCode >= 500) {
    notify500Error(err, req).catch(notifyErr =>
      logger.error('Failed to send 500 error notification', { err: notifyErr.message })
    );
  }

  // Default error response (NEVER expose stack traces to clients)
  res.status(statusCode).json({
    success: false,
    error: error.message || 'Server Error'
    // Stack traces are logged server-side only (line 14-21)
  });
};

module.exports = { asyncHandler, errorHandler };
