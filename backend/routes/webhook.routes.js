/**
 * Webhook Routes
 * Handles external payment provider webhooks (PUBLIC - no authentication)
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const logger = require('../config/logger');

// Middleware to log all webhook requests
const webhookLogger = (req, res, next) => {
  logger.info('Webhook received', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type')
  });
  next();
};

router.use(webhookLogger);

// CryptoCloud.plus payment webhook
// POST /api/webhooks/cryptocloud
// Note: NO authentication - signature verification happens in controller
router.post('/cryptocloud', paymentController.handleCryptoCloudWebhook);

module.exports = router;
