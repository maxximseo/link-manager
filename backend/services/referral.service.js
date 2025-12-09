/**
 * Referral/Affiliate Service
 * Handles all referral program operations: stats, withdrawals, code updates
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');

// Constants
const MINIMUM_WITHDRAWAL_AMOUNT = 200; // $200 minimum withdrawal

/**
 * Validate TRC20 wallet address format
 * TRC20 addresses start with 'T' and are 34 characters long (Base58)
 */
const isValidTRC20Address = (address) => {
  if (!address || typeof address !== 'string') return false;
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
};

/**
 * Get referral statistics for a user
 */
const getReferralStats = async (userId) => {
  try {
    const result = await query(
      `SELECT
        u.referral_code,
        u.referral_balance,
        u.total_referral_earnings,
        (SELECT COUNT(*) FROM users WHERE referred_by_user_id = $1) as total_referrals,
        (SELECT COUNT(*) FROM users WHERE referred_by_user_id = $1 AND total_spent > 0) as active_referrals,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM referral_transactions WHERE referrer_id = $1 AND status = 'credited') as pending_balance,
        (SELECT COALESCE(SUM(amount), 0) FROM referral_withdrawals WHERE user_id = $1 AND status = 'completed') as total_withdrawn
      FROM users u
      WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const stats = result.rows[0];

    return {
      referralCode: stats.referral_code,
      referralBalance: parseFloat(stats.referral_balance || 0),
      totalEarnings: parseFloat(stats.total_referral_earnings || 0),
      totalReferrals: parseInt(stats.total_referrals, 10),
      activeReferrals: parseInt(stats.active_referrals, 10),
      totalWithdrawn: parseFloat(stats.total_withdrawn || 0),
      minimumWithdrawal: MINIMUM_WITHDRAWAL_AMOUNT,
      canWithdraw: parseFloat(stats.referral_balance || 0) >= MINIMUM_WITHDRAWAL_AMOUNT
    };
  } catch (error) {
    logger.error('Failed to get referral stats', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get list of referred users with their spending
 */
const getReferredUsers = async (userId, { page = 1, limit = 50 }) => {
  try {
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT
        u.id,
        u.username,
        u.created_at as registered_at,
        u.total_spent,
        COALESCE(
          (SELECT SUM(commission_amount) FROM referral_transactions WHERE referrer_id = $1 AND referee_id = u.id),
          0
        ) as commission_earned
      FROM users u
      WHERE u.referred_by_user_id = $1
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM users WHERE referred_by_user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows.map(u => ({
        id: u.id,
        username: u.username,
        registeredAt: u.registered_at,
        totalSpent: parseFloat(u.total_spent || 0),
        commissionEarned: parseFloat(u.commission_earned || 0)
      })),
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    logger.error('Failed to get referred users', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get referral transactions history
 */
const getReferralTransactions = async (userId, { page = 1, limit = 50 }) => {
  try {
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT
        rt.id,
        rt.referee_id,
        u.username as referee_username,
        rt.transaction_amount,
        rt.commission_rate,
        rt.commission_amount,
        rt.status,
        rt.created_at
      FROM referral_transactions rt
      JOIN users u ON rt.referee_id = u.id
      WHERE rt.referrer_id = $1
      ORDER BY rt.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM referral_transactions WHERE referrer_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows.map(t => ({
        id: t.id,
        refereeId: t.referee_id,
        refereeUsername: t.referee_username,
        transactionAmount: parseFloat(t.transaction_amount || 0),
        commissionRate: parseInt(t.commission_rate, 10),
        commissionAmount: parseFloat(t.commission_amount || 0),
        status: t.status,
        createdAt: t.created_at
      })),
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    logger.error('Failed to get referral transactions', { userId, error: error.message });
    throw error;
  }
};

/**
 * Update user's referral code
 */
const updateReferralCode = async (userId, newCode) => {
  try {
    // Validate code format
    if (!newCode || !/^[a-zA-Z0-9_-]{3,30}$/.test(newCode)) {
      throw new Error('Invalid referral code format. Use 3-30 characters: letters, numbers, underscores, hyphens.');
    }

    // Check if code is already taken (case-insensitive)
    const existingResult = await query(
      'SELECT id FROM users WHERE LOWER(referral_code) = LOWER($1) AND id != $2',
      [newCode, userId]
    );

    if (existingResult.rows.length > 0) {
      throw new Error('This referral code is already taken. Please choose another.');
    }

    // Update code
    await query(
      'UPDATE users SET referral_code = $1 WHERE id = $2',
      [newCode, userId]
    );

    logger.info('Referral code updated', { userId, newCode });

    return { success: true, referralCode: newCode };
  } catch (error) {
    logger.error('Failed to update referral code', { userId, newCode, error: error.message });
    throw error;
  }
};

/**
 * Withdraw referral balance to main balance
 */
const withdrawToBalance = async (userId, amount = null) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get user with lock
    const userResult = await client.query(
      'SELECT referral_balance, balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const referralBalance = parseFloat(user.referral_balance || 0);

    // Determine withdrawal amount (all available if not specified)
    const withdrawalAmount = amount ? parseFloat(amount) : referralBalance;

    // Validate
    if (referralBalance < MINIMUM_WITHDRAWAL_AMOUNT) {
      throw new Error(`Minimum withdrawal amount is $${MINIMUM_WITHDRAWAL_AMOUNT}. Your referral balance: $${referralBalance.toFixed(2)}`);
    }

    if (withdrawalAmount > referralBalance) {
      throw new Error(`Insufficient referral balance. Available: $${referralBalance.toFixed(2)}`);
    }

    if (withdrawalAmount < MINIMUM_WITHDRAWAL_AMOUNT) {
      throw new Error(`Minimum withdrawal amount is $${MINIMUM_WITHDRAWAL_AMOUNT}`);
    }

    // Update balances
    const newReferralBalance = referralBalance - withdrawalAmount;
    const newMainBalance = parseFloat(user.balance) + withdrawalAmount;

    await client.query(
      'UPDATE users SET referral_balance = $1, balance = $2 WHERE id = $3',
      [newReferralBalance, newMainBalance, userId]
    );

    // Create withdrawal record
    await client.query(
      `INSERT INTO referral_withdrawals (user_id, amount, status)
       VALUES ($1, $2, 'completed')`,
      [userId, withdrawalAmount]
    );

    // Create transaction record for main balance
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description)
       VALUES ($1, 'referral_withdrawal', $2, $3, $4, $5)`,
      [userId, withdrawalAmount, user.balance, newMainBalance, 'Withdrawal from referral balance']
    );

    // Create notification
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'referral_withdrawal', $2, $3)`,
      [
        userId,
        'Вывод реферального баланса',
        `$${withdrawalAmount.toFixed(2)} переведено с реферального баланса на основной. Новый основной баланс: $${newMainBalance.toFixed(2)}`
      ]
    );

    await client.query('COMMIT');

    logger.info('Referral withdrawal completed', {
      userId,
      amount: withdrawalAmount,
      newReferralBalance,
      newMainBalance
    });

    return {
      success: true,
      withdrawnAmount: withdrawalAmount,
      newReferralBalance,
      newMainBalance
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to withdraw referral balance', { userId, amount, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get referral link URL
 */
const getReferralLink = async (userId, baseUrl = 'https://serparium.com') => {
  try {
    const result = await query(
      'SELECT referral_code FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].referral_code) {
      throw new Error('User not found or no referral code');
    }

    const referralCode = result.rows[0].referral_code;

    return {
      code: referralCode,
      link: `${baseUrl}/ref/${referralCode}`
    };
  } catch (error) {
    logger.error('Failed to get referral link', { userId, error: error.message });
    throw error;
  }
};

/**
 * Validate referral code (for registration)
 */
const validateReferralCode = async (code) => {
  try {
    if (!code) {
      return { valid: false, error: 'Referral code is required' };
    }

    // Case-insensitive search for referral code
    const result = await query(
      'SELECT id, username FROM users WHERE LOWER(referral_code) = LOWER($1)',
      [code]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'Invalid referral code' };
    }

    return {
      valid: true,
      referrerId: result.rows[0].id,
      referrerUsername: result.rows[0].username
    };
  } catch (error) {
    logger.error('Failed to validate referral code', { code, error: error.message });
    throw error;
  }
};

module.exports = {
  MINIMUM_WITHDRAWAL_AMOUNT,
  getReferralStats,
  getReferredUsers,
  getReferralTransactions,
  updateReferralCode,
  withdrawToBalance,
  getReferralLink,
  validateReferralCode
};
