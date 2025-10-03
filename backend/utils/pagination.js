const { PAGINATION } = require('../config/constants');

function getPaginationParams(query) {
  const page = parseInt(query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(
    parseInt(query.limit) || PAGINATION.DEFAULT_LIMIT,
    PAGINATION.MAX_LIMIT
  );

  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { getPaginationParams };
