/**
 * Payment Service
 * Handles CryptoCloud.plus integration for cryptocurrency deposits
 */

const { query, pool } = require('../config/database');
const logger = require('../config/logger');
const billingService = require('./billing.service');
const jwt = require('jsonwebtoken');

// Configuration
const CRYPTOCLOUD_API_URL = 'https://api.cryptocloud.plus/v2';
const MIN_DEPOSIT_AMOUNT = 10; // $10 minimum
const MAX_DEPOSIT_AMOUNT = 10000; // $10,000 maximum

/**
 * Create a deposit invoice via CryptoCloud API
 * @param {number} userId - User ID
 * @param {number} amount - Amount in USD
 * @param {string} email - User email (optional)
 * @returns {Object} Invoice data with payment link
 */
const createDepositInvoice = async (userId, amount, email = null) => {
  // Validate amount
  if (amount < MIN_DEPOSIT_AMOUNT) {
    throw new Error(`Минимальная сумма пополнения: $${MIN_DEPOSIT_AMOUNT}`);
  }
  if (amount > MAX_DEPOSIT_AMOUNT) {
    throw new Error(`Максимальная сумма пополнения: $${MAX_DEPOSIT_AMOUNT}`);
  }

  // Check CryptoCloud credentials
  const apiKey = process.env.CRYPTOCLOUD_API_KEY;
  const shopId = process.env.CRYPTOCLOUD_SHOP_ID;

  if (!apiKey || !shopId) {
    logger.error('CryptoCloud credentials not configured');
    throw new Error('Платёжная система временно недоступна');
  }

  // Generate unique order_id
  const orderId = `deposit_${userId}_${Date.now()}`;

  try {
    // Call CryptoCloud API
    const response = await fetch(`${CRYPTOCLOUD_API_URL}/invoice/create`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount,
        shop_id: shopId,
        currency: 'USD',
        order_id: orderId,
        email: email || undefined
      })
    });

    const data = await response.json();

    if (data.status !== 'success' || !data.result) {
      logger.error('CryptoCloud API error', { response: data });
      throw new Error(data.error || 'Ошибка создания счёта');
    }

    const invoiceData = data.result;

    // Save invoice to database
    const result = await query(
      `
      INSERT INTO payment_invoices (
        user_id, invoice_uuid, order_id, amount, status, payment_link, expires_at
      ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
      RETURNING *
    `,
      [
        userId,
        invoiceData.uuid,
        orderId,
        amount,
        invoiceData.link,
        invoiceData.expiry_date ? new Date(invoiceData.expiry_date) : null
      ]
    );

    const invoice = result.rows[0];

    logger.info('Payment invoice created', {
      userId,
      invoiceId: invoice.id,
      invoiceUuid: invoiceData.uuid,
      amount,
      orderId
    });

    return {
      id: invoice.id,
      orderId: invoice.order_id,
      amount: parseFloat(invoice.amount),
      paymentLink: invoice.payment_link,
      expiresAt: invoice.expires_at,
      status: invoice.status
    };
  } catch (error) {
    logger.error('Failed to create payment invoice', {
      userId,
      amount,
      error: error.message
    });
    throw error;
  }
};

/**
 * Verify CryptoCloud webhook JWT signature
 * @param {string} token - JWT token from webhook
 * @returns {Object} { valid: boolean, data?: object, error?: string }
 */
const verifyWebhookSignature = token => {
  const secretKey = process.env.CRYPTOCLOUD_SECRET_KEY;

  if (!secretKey) {
    logger.error('CRYPTOCLOUD_SECRET_KEY not configured');
    return { valid: false, error: 'Secret key not configured' };
  }

  try {
    const decoded = jwt.verify(token, secretKey, {
      algorithms: ['HS256']
    });
    return { valid: true, data: decoded };
  } catch (error) {
    logger.warn('Invalid webhook signature', { error: error.message });
    return { valid: false, error: error.message };
  }
};

/**
 * Process CryptoCloud webhook
 * @param {Object} webhookData - Webhook payload
 * @returns {Object} Processing result
 */
const processWebhook = async webhookData => {
  const { status, invoice_id, amount_crypto, currency, order_id, token } = webhookData;

  logger.info('Processing CryptoCloud webhook', {
    status,
    invoiceId: invoice_id,
    orderId: order_id
  });

  // Verify JWT signature
  const verification = verifyWebhookSignature(token);
  if (!verification.valid) {
    logger.warn('Webhook signature verification failed', {
      invoiceId: invoice_id,
      error: verification.error
    });
    throw new Error('Invalid signature');
  }

  // Find invoice in database
  const invoiceResult = await query('SELECT * FROM payment_invoices WHERE order_id = $1', [
    order_id
  ]);

  if (invoiceResult.rows.length === 0) {
    logger.warn('Invoice not found for webhook', { orderId: order_id });
    throw new Error('Invoice not found');
  }

  const invoice = invoiceResult.rows[0];

  // Idempotency check - if already paid, ignore duplicate webhook
  if (invoice.status === 'paid') {
    logger.info('Invoice already paid, ignoring duplicate webhook', {
      invoiceId: invoice.id,
      orderId: order_id
    });
    return { success: true, message: 'Already processed' };
  }

  // Process based on status
  if (status === 'success') {
    return await processSuccessfulPayment(invoice, {
      cryptoCurrency: currency,
      cryptoAmount: amount_crypto,
      invoiceUuid: invoice_id
    });
  } else if (status === 'cancel' || status === 'expired') {
    return await markInvoiceCancelled(invoice.id, status);
  }

  logger.warn('Unknown webhook status', { status, orderId: order_id });
  return { success: false, message: 'Unknown status' };
};

/**
 * Process successful payment - add balance and update invoice
 * @param {Object} invoice - Invoice record
 * @param {Object} paymentData - Payment details
 */
const processSuccessfulPayment = async (invoice, paymentData) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update invoice status
    await client.query(
      `
      UPDATE payment_invoices
      SET status = 'paid',
          crypto_currency = $1,
          crypto_amount = $2,
          paid_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
    `,
      [paymentData.cryptoCurrency, paymentData.cryptoAmount, invoice.id]
    );

    // Add balance to user
    await billingService.addBalance(invoice.user_id, parseFloat(invoice.amount), 'crypto_deposit', {
      invoice_id: invoice.id,
      order_id: invoice.order_id,
      crypto_currency: paymentData.cryptoCurrency,
      crypto_amount: paymentData.cryptoAmount
    });

    await client.query('COMMIT');

    logger.info('Payment processed successfully', {
      userId: invoice.user_id,
      amount: invoice.amount,
      invoiceId: invoice.id,
      cryptoCurrency: paymentData.cryptoCurrency
    });

    return {
      success: true,
      message: 'Payment processed',
      userId: invoice.user_id,
      amount: parseFloat(invoice.amount)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to process payment', {
      invoiceId: invoice.id,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Mark invoice as cancelled/expired
 * @param {number} invoiceId - Invoice ID
 * @param {string} status - New status
 */
const markInvoiceCancelled = async (invoiceId, status) => {
  await query(
    `
    UPDATE payment_invoices
    SET status = $1, updated_at = NOW()
    WHERE id = $2
  `,
    [status === 'cancel' ? 'cancelled' : 'expired', invoiceId]
  );

  logger.info('Invoice marked as cancelled/expired', { invoiceId, status });
  return { success: true, message: `Invoice ${status}` };
};

/**
 * Get invoice by order_id
 * @param {string} orderId - Order ID
 * @returns {Object|null} Invoice record
 */
const getInvoiceByOrderId = async orderId => {
  const result = await query('SELECT * FROM payment_invoices WHERE order_id = $1', [orderId]);
  return result.rows[0] || null;
};

/**
 * Get invoice status for user
 * @param {number} userId - User ID
 * @param {string} orderId - Order ID
 * @returns {Object|null} Invoice with status
 */
const getInvoiceStatus = async (userId, orderId) => {
  const result = await query(
    `
    SELECT id, order_id, amount, status, payment_link, expires_at, paid_at, created_at
    FROM payment_invoices
    WHERE user_id = $1 AND order_id = $2
  `,
    [userId, orderId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const invoice = result.rows[0];
  return {
    id: invoice.id,
    orderId: invoice.order_id,
    amount: parseFloat(invoice.amount),
    status: invoice.status,
    paymentLink: invoice.payment_link,
    expiresAt: invoice.expires_at,
    paidAt: invoice.paid_at,
    createdAt: invoice.created_at
  };
};

/**
 * Get user payment history
 * @param {number} userId - User ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} Paginated payment history
 */
const getUserPayments = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;

  const [paymentsResult, countResult] = await Promise.all([
    query(
      `
      SELECT id, order_id, amount, status, crypto_currency, crypto_amount,
             expires_at, paid_at, created_at
      FROM payment_invoices
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM payment_invoices WHERE user_id = $1', [userId])
  ]);

  const total = parseInt(countResult.rows[0].count, 10);

  return {
    payments: paymentsResult.rows.map(p => ({
      id: p.id,
      orderId: p.order_id,
      amount: parseFloat(p.amount),
      status: p.status,
      cryptoCurrency: p.crypto_currency,
      cryptoAmount: p.crypto_amount ? parseFloat(p.crypto_amount) : null,
      expiresAt: p.expires_at,
      paidAt: p.paid_at,
      createdAt: p.created_at
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Cancel expired invoices (cleanup job)
 * @returns {number} Number of invoices cancelled
 */
const cancelExpiredInvoices = async () => {
  const result = await query(
    `
    UPDATE payment_invoices
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING id
  `
  );

  const count = result.rows.length;
  if (count > 0) {
    logger.info('Expired invoices cancelled', { count });
  }
  return count;
};

/**
 * Get pending invoices for user (to show active payment links)
 * @param {number} userId - User ID
 * @returns {Array} List of pending invoices
 */
const getPendingInvoices = async userId => {
  const result = await query(
    `
    SELECT id, order_id, amount, payment_link, expires_at, created_at
    FROM payment_invoices
    WHERE user_id = $1
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 5
  `,
    [userId]
  );

  return result.rows.map(p => ({
    id: p.id,
    orderId: p.order_id,
    amount: parseFloat(p.amount),
    paymentLink: p.payment_link,
    expiresAt: p.expires_at,
    createdAt: p.created_at
  }));
};

module.exports = {
  createDepositInvoice,
  verifyWebhookSignature,
  processWebhook,
  getInvoiceByOrderId,
  getInvoiceStatus,
  getUserPayments,
  cancelExpiredInvoices,
  getPendingInvoices,
  MIN_DEPOSIT_AMOUNT,
  MAX_DEPOSIT_AMOUNT
};
