/**
 * Referral Routes
 * API endpoints for referral/affiliate system
 */

const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referral.controller');
const authMiddleware = require('../middleware/auth');

// Public route - validate referral code (no auth needed for registration)
router.get('/validate/:code', referralController.validateCode);

// All other routes require authentication
router.use(authMiddleware);

/**
 * GET /api/referrals/stats
 * Get referral statistics for current user
 */
router.get('/stats', referralController.getStats);

/**
 * GET /api/referrals/link
 * Get referral link for current user
 */
router.get('/link', referralController.getLink);

/**
 * GET /api/referrals/referred-users
 * Get list of referred users with their spending
 */
router.get('/referred-users', referralController.getReferredUsers);

/**
 * GET /api/referrals/transactions
 * Get referral commission transactions history
 */
router.get('/transactions', referralController.getTransactions);

/**
 * POST /api/referrals/update-code
 * Update user's referral code
 * Body: { code: string }
 */
router.post('/update-code', referralController.updateCode);

/**
 * POST /api/referrals/withdraw
 * Withdraw referral balance to main balance
 * Body: { amount?: number } - optional, defaults to full balance
 */
router.post('/withdraw', referralController.withdraw);

/**
 * GET /api/referrals/wallet
 * Get user's saved USDT TRC20 wallet address
 */
router.get('/wallet', referralController.getWallet);

/**
 * POST /api/referrals/wallet
 * Save or update user's USDT TRC20 wallet address
 * Body: { wallet: string }
 */
router.post('/wallet', referralController.saveWallet);

/**
 * POST /api/referrals/withdraw-to-wallet
 * Create withdrawal request to external USDT TRC20 wallet
 * Requires saved wallet address and minimum $200 balance
 */
router.post('/withdraw-to-wallet', referralController.withdrawToWallet);

/**
 * GET /api/referrals/withdrawals
 * Get user's withdrawal history (both balance and wallet)
 */
router.get('/withdrawals', referralController.getWithdrawalHistory);

module.exports = router;
