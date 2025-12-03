const logger = require('../config/logger');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handler
const errorHandler = (err, req, res, _next) => {
  const error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error handler:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
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

  // Default error response (NEVER expose stack traces to clients)
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error'
    // Stack traces are logged server-side only (line 14-21)
  });
};

module.exports = { asyncHandler, errorHandler };
