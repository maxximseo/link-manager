const logger = require('../config/logger');

const withErrorHandling = (fn, name) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`Error in ${name}:`, error);
      throw error;
    }
  };
};

module.exports = { withErrorHandling };
