/**
 * Common validation utilities
 */

/**
 * Validate and sanitize pagination parameters
 * @param {object} query - Express req.query object
 * @param {object} options - Options { maxLimit, defaultLimit, defaultPage }
 * @returns {object} Validated { page, limit } parameters
 */
const validatePagination = (query, options = {}) => {
  const { maxLimit = 5000, defaultLimit = 20, defaultPage = 1, maxPage = 10000 } = options;

  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  // Validate page
  if (isNaN(page) || page < 1) {
    page = defaultPage;
  } else if (page > maxPage) {
    throw new Error(`Page number cannot exceed ${maxPage}`);
  }

  // Validate limit
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    throw new Error(`Limit cannot exceed ${maxLimit}`);
  }

  return { page, limit };
};

/**
 * Validate numeric ID parameter
 * @param {string|number} id - ID to validate
 * @param {string} paramName - Parameter name for error message
 * @returns {number} Validated positive integer ID
 */
const validateId = (id, paramName = 'id') => {
  const numId = parseInt(id, 10);

  if (isNaN(numId) || numId < 1 || !Number.isInteger(numId)) {
    throw new Error(`Invalid ${paramName}: must be a positive integer`);
  }

  return numId;
};

/**
 * Validate array length for batch operations
 * @param {Array} array - Array to validate
 * @param {number} maxLength - Maximum allowed length
 * @param {string} arrayName - Array name for error message
 */
const validateArrayLength = (array, maxLength, arrayName = 'array') => {
  if (!Array.isArray(array)) {
    throw new Error(`${arrayName} must be an array`);
  }

  if (array.length === 0) {
    throw new Error(`${arrayName} cannot be empty`);
  }

  if (array.length > maxLength) {
    throw new Error(`${arrayName} cannot contain more than ${maxLength} items`);
  }
};

module.exports = {
  validatePagination,
  validateId,
  validateArrayLength
};
