/**
 * Centralized error handler utility
 * Prevents information disclosure through error messages in production
 */

const logger = require('../config/logger');

/**
 * Safe error handler for controllers
 * Logs full error details but returns sanitized message to client
 *
 * @param {object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} userMessage - Safe message to show to user
 * @param {number} statusCode - HTTP status code (default: 500)
 */
function handleError(res, error, userMessage = 'Operation failed', statusCode = 500) {
  // Log full error details for debugging
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    name: error.name,
    statusCode: statusCode
  });

  // In production, only return safe user message
  if (process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({
      error: userMessage
    });
  }

  // In development, include error details for debugging
  return res.status(statusCode).json({
    error: userMessage,
    details: error.message,
    stack: error.stack
  });
}

/**
 * Safe error handler for validation errors (400 status)
 */
function handleValidationError(res, error, userMessage = 'Invalid input') {
  return handleError(res, error, userMessage, 400);
}

/**
 * Safe error handler for not found errors (404 status)
 */
function handleNotFoundError(res, error, userMessage = 'Resource not found') {
  return handleError(res, error, userMessage, 404);
}

/**
 * Safe error handler for authentication errors (401 status)
 */
function handleAuthError(res, error, userMessage = 'Authentication failed') {
  return handleError(res, error, userMessage, 401);
}

/**
 * Safe error handler for authorization errors (403 status)
 */
function handleForbiddenError(res, error, userMessage = 'Access denied') {
  return handleError(res, error, userMessage, 403);
}

/**
 * Check if error message is safe to expose to client
 * Safe messages are business logic errors (e.g., "Insufficient balance")
 * Unsafe messages are system errors (e.g., "ECONNREFUSED", SQL errors)
 */
function isSafeErrorMessage(error) {
  // List of safe error prefixes (business logic errors)
  const safeErrorPrefixes = [
    'Insufficient balance',
    'Site not found',
    'Project not found',
    'Invalid',
    'Maximum',
    'Minimum',
    'Already exists',
    'Cannot delete',
    'Duplicate',
    'exhausted',
    'does not belong',
    'does not support',
    'No links provided',
    'No valid links',
    'All',  // Catches "All X links are duplicates"
    'Import failed',  // For detailed import error messages
    'violates unique constraint',  // Database constraint errors
    'unique constraint violation'
  ];

  // Check if error message starts with any safe prefix
  const message = error.message || '';
  return safeErrorPrefixes.some(prefix =>
    message.startsWith(prefix)
  );
}

/**
 * Smart error handler - exposes safe business errors, hides system errors
 */
function handleSmartError(res, error, fallbackMessage = 'Operation failed', statusCode = 500) {
  if (isSafeErrorMessage(error)) {
    // Business logic error - safe to expose
    logger.warn('Business logic error:', { message: error.message });
    return res.status(statusCode).json({
      error: error.message
    });
  }

  // System error - use safe fallback message
  return handleError(res, error, fallbackMessage, statusCode);
}

module.exports = {
  handleError,
  handleValidationError,
  handleNotFoundError,
  handleAuthError,
  handleForbiddenError,
  handleSmartError,
  isSafeErrorMessage
};
