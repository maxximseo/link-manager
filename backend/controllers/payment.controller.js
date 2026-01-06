/**
 * Payment Controller
 * Handles cryptocurrency payment requests via CryptoCloud.plus
 */

const paymentService = require('../services/payment.service');
const logger = require('../config/logger');

/**
 * Create deposit invoice
 * POST /api/payments/create-invoice
 */
const createInvoice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, email } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: 'Укажите сумму пополнения' });
    }

    const numAmount = parseFloat(amount);

    if (numAmount < paymentService.MIN_DEPOSIT_AMOUNT) {
      return res.status(400).json({
        error: `Минимальная сумма пополнения: $${paymentService.MIN_DEPOSIT_AMOUNT}`
      });
    }

    if (numAmount > paymentService.MAX_DEPOSIT_AMOUNT) {
      return res.status(400).json({
        error: `Максимальная сумма пополнения: $${paymentService.MAX_DEPOSIT_AMOUNT}`
      });
    }

    const invoice = await paymentService.createDepositInvoice(userId, numAmount, email);

    res.json({
      success: true,
      invoice: invoice
    });
  } catch (error) {
    logger.error('Failed to create invoice', {
      userId: req.user?.id,
      error: error.message
    });
    res.status(500).json({ error: error.message || 'Не удалось создать счёт' });
  }
};

/**
 * Get invoice status
 * GET /api/payments/invoice/:orderId
 */
const getInvoiceStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    const invoice = await paymentService.getInvoiceStatus(userId, orderId);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (error) {
    logger.error('Failed to get invoice status', {
      orderId: req.params?.orderId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get invoice status' });
  }
};

/**
 * Get payment history
 * GET /api/payments/history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const result = await paymentService.getUserPayments(userId, page, limit);

    res.json(result);
  } catch (error) {
    logger.error('Failed to get payment history', {
      userId: req.user?.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get payment history' });
  }
};

/**
 * Get pending invoices
 * GET /api/payments/pending
 */
const getPendingInvoices = async (req, res) => {
  try {
    const userId = req.user.id;

    const invoices = await paymentService.getPendingInvoices(userId);

    res.json({ invoices });
  } catch (error) {
    logger.error('Failed to get pending invoices', {
      userId: req.user?.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get pending invoices' });
  }
};

/**
 * Handle CryptoCloud webhook (PUBLIC endpoint - no auth)
 * POST /api/webhooks/cryptocloud
 */
const handleCryptoCloudWebhook = async (req, res) => {
  try {
    logger.info('Received CryptoCloud webhook', {
      body: req.body,
      ip: req.ip
    });

    const result = await paymentService.processWebhook(req.body);

    res.json({ status: 'ok', ...result });
  } catch (error) {
    logger.error('Webhook processing failed', {
      error: error.message,
      body: req.body
    });

    // Return 200 OK even on error to prevent CryptoCloud from retrying
    // (we've logged the error for manual investigation)
    if (error.message === 'Invalid signature') {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (error.message === 'Invoice not found') {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Generic server error
    res.status(500).json({ error: 'Processing failed' });
  }
};

/**
 * Get payment configuration (min/max amounts, etc.)
 * GET /api/payments/config
 */
const getPaymentConfig = async (req, res) => {
  try {
    // Check if payment system is configured
    const isConfigured = !!(process.env.CRYPTOCLOUD_API_KEY && process.env.CRYPTOCLOUD_SHOP_ID);

    res.json({
      enabled: isConfigured,
      minAmount: paymentService.MIN_DEPOSIT_AMOUNT,
      maxAmount: paymentService.MAX_DEPOSIT_AMOUNT,
      currencies: ['USDT', 'BTC', 'ETH', 'LTC', 'TRX', 'XMR', 'DOGE', 'TON']
    });
  } catch (error) {
    logger.error('Failed to get payment config', { error: error.message });
    res.status(500).json({ error: 'Failed to get payment config' });
  }
};

module.exports = {
  createInvoice,
  getInvoiceStatus,
  getPaymentHistory,
  getPendingInvoices,
  handleCryptoCloudWebhook,
  getPaymentConfig
};
