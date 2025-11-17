module.exports = {
  PLACEMENT_TYPES: {
    MANUAL: 'manual',
    WORDPRESS: 'wordpress'
  },

  RATE_LIMITS: {
    LOGIN: { windowMs: 15 * 60 * 1000, max: 5 },
    API: { windowMs: 60 * 1000, max: 100 },
    CREATE: { windowMs: 60 * 1000, max: 10 },
    PLACEMENT: { windowMs: 60 * 1000, max: 20 },
    WORDPRESS: { windowMs: 60 * 1000, max: 30 }
  },

  JWT_EXPIRY: '7d',

  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 5000
  }
};
