/**
 * Payment Routes
 * Handles cryptocurrency payment endpoints
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiter for invoice creation (10 per minute)
const createInvoiceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Слишком много запросов. Попробуйте через минуту.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for general payment endpoints (100 per minute)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false
});

// All payment routes require authentication
router.use(authMiddleware);

// Get payment configuration (min/max amounts, supported currencies)
router.get('/config', generalLimiter, paymentController.getPaymentConfig);

// Create new deposit invoice
router.post('/create-invoice', createInvoiceLimiter, paymentController.createInvoice);

// Get invoice status
router.get('/invoice/:orderId', generalLimiter, paymentController.getInvoiceStatus);

// Get pending invoices (active payment links)
router.get('/pending', generalLimiter, paymentController.getPendingInvoices);

// Get payment history
router.get('/history', generalLimiter, paymentController.getPaymentHistory);

module.exports = router;
