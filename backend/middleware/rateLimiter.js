const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../config/constants');
const { getClientIP } = require('../utils/ipUtils');

const createLimiter = config =>
  rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    // SECURITY: Use validated connection IP (not spoofable X-Forwarded-For)
    keyGenerator: req => getClientIP(req)
  });

const loginLimiter = createLimiter(RATE_LIMITS.LOGIN);
const apiLimiter = createLimiter(RATE_LIMITS.API);
const createOperationLimiter = createLimiter(RATE_LIMITS.CREATE);
const placementLimiter = createLimiter(RATE_LIMITS.PLACEMENT);
const wordpressLimiter = createLimiter(RATE_LIMITS.WORDPRESS);
const financialLimiter = createLimiter(RATE_LIMITS.FINANCIAL);
const depositLimiter = createLimiter(RATE_LIMITS.DEPOSIT);

// General limiter - same as API limiter (100 requests per minute)
const generalLimiter = createLimiter(RATE_LIMITS.API);

module.exports = {
  loginLimiter,
  apiLimiter,
  createOperationLimiter,
  placementLimiter,
  wordpressLimiter,
  financialLimiter,
  depositLimiter,
  generalLimiter
};
