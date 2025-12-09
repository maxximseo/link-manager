/**
 * Referral Controller
 * Handles HTTP endpoints for referral/affiliate system
 */

const referralService = require('../services/referral.service');
const logger = require('../config/logger');

/**
 * GET /api/referrals/stats
 * Get referral statistics for current user
 */
const getStats = async (req, res) => {
  try {
    const stats = await referralService.getReferralStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Failed to get referral stats', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get referral statistics' });
  }
};

/**
 * GET /api/referrals/link
 * Get referral link for current user
 */
const getLink = async (req, res) => {
  try {
    // Use request host or fallback to serparium.com
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host') || 'serparium.com';
    const baseUrl = `${protocol}://${host}`;

    const result = await referralService.getReferralLink(req.user.id, baseUrl);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to get referral link', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get referral link' });
  }
};

/**
 * GET /api/referrals/referred-users
 * Get list of referred users
 */
const getReferredUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const result = await referralService.getReferredUsers(req.user.id, { page, limit });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to get referred users', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get referred users' });
  }
};

/**
 * GET /api/referrals/transactions
 * Get referral transactions history
 */
const getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const result = await referralService.getReferralTransactions(req.user.id, { page, limit });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to get referral transactions', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get referral transactions' });
  }
};

/**
 * POST /api/referrals/update-code
 * Update referral code
 */
const updateCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    const result = await referralService.updateReferralCode(req.user.id, code);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to update referral code', { userId: req.user.id, error: error.message });

    // Return user-friendly error messages
    if (error.message.includes('already taken') || error.message.includes('Invalid referral code format')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to update referral code' });
  }
};

/**
 * POST /api/referrals/withdraw
 * Withdraw referral balance to main balance
 */
const withdraw = async (req, res) => {
  try {
    const { amount } = req.body;

    const result = await referralService.withdrawToBalance(req.user.id, amount || null);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to withdraw referral balance', { userId: req.user.id, error: error.message });

    // Return user-friendly error messages for validation errors
    if (error.message.includes('Minimum') || error.message.includes('Insufficient')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to withdraw referral balance' });
  }
};

/**
 * GET /api/referrals/validate/:code
 * Validate a referral code (public endpoint for registration)
 */
const validateCode = async (req, res) => {
  try {
    const { code } = req.params;

    const result = await referralService.validateReferralCode(code);

    if (!result.valid) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        referrerUsername: result.referrerUsername
      }
    });
  } catch (error) {
    logger.error('Failed to validate referral code', { code: req.params.code, error: error.message });
    res.status(500).json({ error: 'Failed to validate referral code' });
  }
};

module.exports = {
  getStats,
  getLink,
  getReferredUsers,
  getTransactions,
  updateCode,
  withdraw,
  validateCode
};
