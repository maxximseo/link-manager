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
    // Active referrals = users who have spent money (calculated from transactions, not cached field)
    const result = await query(
      `SELECT
        u.referral_code,
        u.referral_balance,
        u.total_referral_earnings,
        (SELECT COUNT(*) FROM users WHERE referred_by_user_id = $1) as total_referrals,
        (SELECT COUNT(*) FROM users ref WHERE ref.referred_by_user_id = $1 AND (
          SELECT COALESCE(ABS(SUM(t.amount)), 0) FROM transactions t
          WHERE t.user_id = ref.id AND t.type IN ('purchase', 'renewal', 'slot_rental', 'slot_rental_renewal')
        ) > 0) as active_referrals,
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

    // Calculate total_spent from transactions: (purchase + renewal) - refunds
    const result = await query(
      `SELECT
        u.id,
        u.username,
        u.created_at as registered_at,
        GREATEST(0, COALESCE(ABS((
          SELECT SUM(t.amount)
          FROM transactions t
          WHERE t.user_id = u.id AND t.type IN ('purchase', 'renewal', 'slot_rental', 'slot_rental_renewal')
        )), 0) - COALESCE((
          SELECT SUM(t.amount)
          FROM transactions t
          WHERE t.user_id = u.id AND t.type = 'refund'
        ), 0)) as total_spent,
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

/**
 * Get user's saved USDT TRC20 wallet address
 */
const getWallet = async (userId) => {
  try {
    const result = await query(
      'SELECT usdt_wallet, usdt_wallet_updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const { usdt_wallet, usdt_wallet_updated_at } = result.rows[0];

    // Calculate if wallet can be changed (1 month cooldown)
    let canChangeWallet = true;
    let walletChangeAvailableAt = null;

    if (usdt_wallet && usdt_wallet_updated_at) {
      const oneMonthFromUpdate = new Date(usdt_wallet_updated_at);
      oneMonthFromUpdate.setMonth(oneMonthFromUpdate.getMonth() + 1);

      if (new Date() < oneMonthFromUpdate) {
        canChangeWallet = false;
        walletChangeAvailableAt = oneMonthFromUpdate.toISOString();
      }
    }

    return {
      wallet: usdt_wallet || null,
      walletUpdatedAt: usdt_wallet_updated_at ? usdt_wallet_updated_at.toISOString() : null,
      canChangeWallet,
      walletChangeAvailableAt
    };
  } catch (error) {
    logger.error('Failed to get wallet', { userId, error: error.message });
    throw error;
  }
};

/**
 * Save or update user's USDT TRC20 wallet address
 * Has a 1 month cooldown after first save
 */
const saveWallet = async (userId, walletAddress) => {
  try {
    // Validate wallet format
    if (!isValidTRC20Address(walletAddress)) {
      throw new Error('Invalid TRC20 wallet address format. Must start with T and be 34 characters long.');
    }

    // Check if wallet was recently updated (1 month cooldown)
    const userResult = await query(
      'SELECT usdt_wallet, usdt_wallet_updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const { usdt_wallet, usdt_wallet_updated_at } = userResult.rows[0];

    // If wallet exists and was updated, check cooldown
    if (usdt_wallet && usdt_wallet_updated_at) {
      const oneMonthFromUpdate = new Date(usdt_wallet_updated_at);
      oneMonthFromUpdate.setMonth(oneMonthFromUpdate.getMonth() + 1);

      if (new Date() < oneMonthFromUpdate) {
        const daysLeft = Math.ceil((oneMonthFromUpdate - new Date()) / (1000 * 60 * 60 * 24));
        throw new Error(
          `Кошелёк можно изменить только через ${daysLeft} дней. Следующее изменение доступно: ${oneMonthFromUpdate.toLocaleDateString('ru-RU')}`
        );
      }
    }

    // Update wallet and timestamp
    await query(
      'UPDATE users SET usdt_wallet = $1, usdt_wallet_updated_at = NOW() WHERE id = $2',
      [walletAddress, userId]
    );

    logger.info('Wallet address saved', { userId, wallet: walletAddress });

    return { success: true, wallet: walletAddress };
  } catch (error) {
    logger.error('Failed to save wallet', { userId, walletAddress, error: error.message });
    throw error;
  }
};

/**
 * Withdraw referral balance to external USDT TRC20 wallet
 * Creates a pending withdrawal request that requires admin approval
 */
const withdrawToWallet = async (userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get user with lock
    const userResult = await client.query(
      'SELECT referral_balance, usdt_wallet, username FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const referralBalance = parseFloat(user.referral_balance || 0);
    const walletAddress = user.usdt_wallet;

    // Validate wallet exists
    if (!walletAddress) {
      throw new Error('No wallet address saved. Please save your USDT TRC20 wallet address first.');
    }

    // Validate balance
    if (referralBalance < MINIMUM_WITHDRAWAL_AMOUNT) {
      throw new Error(
        `Minimum withdrawal amount is $${MINIMUM_WITHDRAWAL_AMOUNT}. Your referral balance: $${referralBalance.toFixed(2)}`
      );
    }

    // Check for existing pending withdrawal
    const pendingResult = await client.query(
      "SELECT id FROM referral_withdrawals WHERE user_id = $1 AND status = 'pending' AND withdrawal_type = 'wallet'",
      [userId]
    );

    if (pendingResult.rows.length > 0) {
      throw new Error('You already have a pending wallet withdrawal request. Please wait for it to be processed.');
    }

    // Deduct from referral balance
    const newReferralBalance = 0;

    await client.query('UPDATE users SET referral_balance = $1 WHERE id = $2', [
      newReferralBalance,
      userId
    ]);

    // Create pending withdrawal record
    const withdrawalResult = await client.query(
      `INSERT INTO referral_withdrawals (user_id, amount, status, withdrawal_type, wallet_address)
       VALUES ($1, $2, 'pending', 'wallet', $3)
       RETURNING id`,
      [userId, referralBalance, walletAddress]
    );

    const withdrawalId = withdrawalResult.rows[0].id;

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'referral_withdrawal', $2, $3)`,
      [
        userId,
        'Заявка на вывод создана',
        `Создана заявка на вывод $${referralBalance.toFixed(2)} на кошелёк ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}. Обработка занимает до 24 часов.`
      ]
    );

    // Create notification for admins
    const adminsResult = await client.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of adminsResult.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         VALUES ($1, 'admin_withdrawal_request', $2, $3, $4)`,
        [
          admin.id,
          'Новая заявка на вывод',
          `Пользователь ${user.username} запросил вывод $${referralBalance.toFixed(2)} на кошелёк USDT TRC20.`,
          JSON.stringify({ withdrawalId, userId, amount: referralBalance, wallet: walletAddress })
        ]
      );
    }

    await client.query('COMMIT');

    logger.info('Wallet withdrawal request created', {
      userId,
      amount: referralBalance,
      wallet: walletAddress,
      withdrawalId
    });

    return {
      success: true,
      withdrawalId,
      amount: referralBalance,
      wallet: walletAddress,
      status: 'pending',
      message: 'Withdrawal request created. Processing takes up to 24 hours.'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create wallet withdrawal', { userId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get pending wallet withdrawal requests (admin only)
 */
const getPendingWithdrawals = async ({ page = 1, limit = 50, status = null }) => {
  try {
    const offset = (page - 1) * limit;

    let statusFilter = '';
    const params = [limit, offset];

    if (status) {
      statusFilter = ' AND rw.status = $3';
      params.push(status);
    }

    const result = await query(
      `SELECT
        rw.id,
        rw.user_id,
        u.username,
        u.email,
        rw.amount,
        rw.status,
        rw.withdrawal_type,
        rw.wallet_address,
        rw.admin_comment,
        rw.processed_at,
        rw.processed_by,
        pa.username as processed_by_username,
        rw.created_at
      FROM referral_withdrawals rw
      JOIN users u ON rw.user_id = u.id
      LEFT JOIN users pa ON rw.processed_by = pa.id
      WHERE rw.withdrawal_type = 'wallet'${statusFilter}
      ORDER BY
        CASE WHEN rw.status = 'pending' THEN 0 ELSE 1 END,
        rw.created_at DESC
      LIMIT $1 OFFSET $2`,
      params
    );

    // Get total count
    const countParams = status ? [status] : [];
    const countQuery = status
      ? "SELECT COUNT(*) as count FROM referral_withdrawals WHERE withdrawal_type = 'wallet' AND status = $1"
      : "SELECT COUNT(*) as count FROM referral_withdrawals WHERE withdrawal_type = 'wallet'";
    const countResult = await query(countQuery, countParams);

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    // Count by status
    const statusCountResult = await query(
      `SELECT status, COUNT(*) as count
       FROM referral_withdrawals
       WHERE withdrawal_type = 'wallet'
       GROUP BY status`
    );
    const statusCounts = {};
    statusCountResult.rows.forEach((row) => {
      statusCounts[row.status] = parseInt(row.count, 10);
    });

    return {
      data: result.rows.map((w) => ({
        id: w.id,
        userId: w.user_id,
        username: w.username,
        email: w.email,
        amount: parseFloat(w.amount),
        status: w.status,
        withdrawalType: w.withdrawal_type,
        walletAddress: w.wallet_address,
        adminComment: w.admin_comment,
        processedAt: w.processed_at,
        processedBy: w.processed_by,
        processedByUsername: w.processed_by_username,
        createdAt: w.created_at
      })),
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      statusCounts
    };
  } catch (error) {
    logger.error('Failed to get pending withdrawals', { error: error.message });
    throw error;
  }
};

/**
 * Approve a wallet withdrawal (admin only)
 */
const approveWithdrawal = async (withdrawalId, adminId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get withdrawal with lock
    const withdrawalResult = await client.query(
      `SELECT rw.*, u.username
       FROM referral_withdrawals rw
       JOIN users u ON rw.user_id = u.id
       WHERE rw.id = $1 AND rw.withdrawal_type = 'wallet'
       FOR UPDATE OF rw`,
      [withdrawalId]
    );

    if (withdrawalResult.rows.length === 0) {
      throw new Error('Withdrawal not found');
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'pending') {
      throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
    }

    // Update withdrawal status
    await client.query(
      `UPDATE referral_withdrawals
       SET status = 'completed', processed_at = NOW(), processed_by = $1
       WHERE id = $2`,
      [adminId, withdrawalId]
    );

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'referral_withdrawal', $2, $3)`,
      [
        withdrawal.user_id,
        'Вывод выполнен',
        `Вывод $${parseFloat(withdrawal.amount).toFixed(2)} на кошелёк ${withdrawal.wallet_address.slice(0, 8)}...${withdrawal.wallet_address.slice(-6)} выполнен.`
      ]
    );

    await client.query('COMMIT');

    logger.info('Withdrawal approved', { withdrawalId, adminId, amount: withdrawal.amount });

    return {
      success: true,
      withdrawalId,
      amount: parseFloat(withdrawal.amount),
      wallet: withdrawal.wallet_address,
      username: withdrawal.username
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to approve withdrawal', { withdrawalId, adminId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reject a wallet withdrawal (admin only)
 */
const rejectWithdrawal = async (withdrawalId, adminId, comment) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get withdrawal with lock
    const withdrawalResult = await client.query(
      `SELECT rw.*, u.username
       FROM referral_withdrawals rw
       JOIN users u ON rw.user_id = u.id
       WHERE rw.id = $1 AND rw.withdrawal_type = 'wallet'
       FOR UPDATE OF rw`,
      [withdrawalId]
    );

    if (withdrawalResult.rows.length === 0) {
      throw new Error('Withdrawal not found');
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'pending') {
      throw new Error(`Cannot reject withdrawal with status: ${withdrawal.status}`);
    }

    // Return balance to user
    await client.query(
      'UPDATE users SET referral_balance = referral_balance + $1 WHERE id = $2',
      [withdrawal.amount, withdrawal.user_id]
    );

    // Update withdrawal status
    await client.query(
      `UPDATE referral_withdrawals
       SET status = 'rejected', processed_at = NOW(), processed_by = $1, admin_comment = $2
       WHERE id = $3`,
      [adminId, comment || 'Rejected by admin', withdrawalId]
    );

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'referral_withdrawal', $2, $3)`,
      [
        withdrawal.user_id,
        'Вывод отклонён',
        `Вывод $${parseFloat(withdrawal.amount).toFixed(2)} отклонён. Причина: ${comment || 'Не указана'}. Средства возвращены на реферальный баланс.`
      ]
    );

    await client.query('COMMIT');

    logger.info('Withdrawal rejected', { withdrawalId, adminId, comment });

    return {
      success: true,
      withdrawalId,
      amount: parseFloat(withdrawal.amount),
      username: withdrawal.username,
      comment: comment || 'Rejected by admin'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to reject withdrawal', { withdrawalId, adminId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get user's withdrawal history
 */
const getWithdrawalHistory = async (userId, { page = 1, limit = 50 }) => {
  try {
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT
        id,
        amount,
        status,
        withdrawal_type,
        wallet_address,
        admin_comment,
        processed_at,
        created_at
      FROM referral_withdrawals
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) as count FROM referral_withdrawals WHERE user_id = $1', [
      userId
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows.map((w) => ({
        id: w.id,
        amount: parseFloat(w.amount),
        status: w.status,
        withdrawalType: w.withdrawal_type,
        walletAddress: w.wallet_address,
        adminComment: w.admin_comment,
        processedAt: w.processed_at,
        createdAt: w.created_at
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
    logger.error('Failed to get withdrawal history', { userId, error: error.message });
    throw error;
  }
};

module.exports = {
  MINIMUM_WITHDRAWAL_AMOUNT,
  isValidTRC20Address,
  getReferralStats,
  getReferredUsers,
  getReferralTransactions,
  updateReferralCode,
  withdrawToBalance,
  getReferralLink,
  validateReferralCode,
  getWallet,
  saveWallet,
  withdrawToWallet,
  getPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getWithdrawalHistory
};
