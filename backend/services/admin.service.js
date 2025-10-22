/**
 * Admin service
 * Handles admin operations: dashboard stats, user management, revenue analytics
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');
const billingService = require('./billing.service');

/**
 * Get dashboard statistics for admin
 */
const getAdminStats = async (period = 'day') => {
  try {
    // Calculate date range based on period
    let dateFilter = '';
    switch (period) {
      case 'day':
        dateFilter = "created_at >= NOW() - INTERVAL '1 day'";
        break;
      case 'week':
        dateFilter = "created_at >= NOW() - INTERVAL '7 days'";
        break;
      case 'month':
        dateFilter = "created_at >= NOW() - INTERVAL '30 days'";
        break;
      case 'year':
        dateFilter = "created_at >= NOW() - INTERVAL '365 days'";
        break;
      default:
        dateFilter = "created_at >= NOW() - INTERVAL '7 days'";
    }

    // Get revenue stats
    const revenueResult = await query(`
      SELECT
        SUM(CASE WHEN type IN ('purchase', 'renewal', 'auto_renewal') THEN ABS(amount) ELSE 0 END) as total_revenue,
        COUNT(CASE WHEN type = 'purchase' THEN 1 END) as purchases_count,
        COUNT(CASE WHEN type = 'renewal' OR type = 'auto_renewal' THEN 1 END) as renewals_count,
        AVG(CASE WHEN type IN ('purchase', 'renewal', 'auto_renewal') THEN ABS(amount) END) as avg_transaction
      FROM transactions
      WHERE ${dateFilter}
    `);

    // Get placement stats
    const placementResult = await query(`
      SELECT
        COUNT(*) as total_placements,
        COUNT(CASE WHEN type = 'link' THEN 1 END) as link_placements,
        COUNT(CASE WHEN type = 'article' THEN 1 END) as article_placements,
        COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_placements,
        COUNT(CASE WHEN status = 'placed' THEN 1 END) as active_placements,
        COUNT(CASE WHEN auto_renewal = true THEN 1 END) as auto_renewal_count
      FROM placements
      WHERE ${dateFilter.replace('created_at', 'purchased_at')}
    `);

    // Get user stats
    const userResult = await query(`
      SELECT
        COUNT(*) as new_users,
        SUM(balance) as total_user_balance,
        SUM(total_spent) as total_user_spending
      FROM users
      WHERE ${dateFilter}
    `);

    return {
      period,
      revenue: {
        total: parseFloat(revenueResult.rows[0].total_revenue || 0),
        purchases: parseInt(revenueResult.rows[0].purchases_count),
        renewals: parseInt(revenueResult.rows[0].renewals_count),
        avgTransaction: parseFloat(revenueResult.rows[0].avg_transaction || 0)
      },
      placements: {
        total: parseInt(placementResult.rows[0].total_placements),
        links: parseInt(placementResult.rows[0].link_placements),
        articles: parseInt(placementResult.rows[0].article_placements),
        scheduled: parseInt(placementResult.rows[0].scheduled_placements),
        active: parseInt(placementResult.rows[0].active_placements),
        autoRenewal: parseInt(placementResult.rows[0].auto_renewal_count)
      },
      users: {
        newUsers: parseInt(userResult.rows[0].new_users),
        totalBalance: parseFloat(userResult.rows[0].total_user_balance || 0),
        totalSpending: parseFloat(userResult.rows[0].total_user_spending || 0)
      }
    };

  } catch (error) {
    logger.error('Failed to get admin stats', { period, error: error.message });
    throw error;
  }
};

/**
 * Get revenue breakdown by time period
 */
const getRevenueBreakdown = async (startDate, endDate, groupBy = 'day') => {
  try {
    let dateFormat = '';
    switch (groupBy) {
      case 'hour':
        dateFormat = "DATE_TRUNC('hour', created_at)";
        break;
      case 'day':
        dateFormat = "DATE_TRUNC('day', created_at)";
        break;
      case 'week':
        dateFormat = "DATE_TRUNC('week', created_at)";
        break;
      case 'month':
        dateFormat = "DATE_TRUNC('month', created_at)";
        break;
      default:
        dateFormat = "DATE_TRUNC('day', created_at)";
    }

    const result = await query(`
      SELECT
        ${dateFormat} as period,
        type,
        COUNT(*) as transaction_count,
        SUM(ABS(amount)) as total_amount
      FROM transactions
      WHERE created_at BETWEEN $1 AND $2
        AND type IN ('purchase', 'renewal', 'auto_renewal')
      GROUP BY period, type
      ORDER BY period DESC, type
    `, [startDate || '2020-01-01', endDate || new Date()]);

    return result.rows;

  } catch (error) {
    logger.error('Failed to get revenue breakdown', { startDate, endDate, groupBy, error: error.message });
    throw error;
  }
};

/**
 * Get all users with pagination and search
 */
const getUsers = async ({ page = 1, limit = 50, search = null, role = null }) => {
  try {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (username ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }

    if (role) {
      params.push(role);
      whereClause += ` AND role = $${params.length}`;
    }

    // Get users with placement count
    const result = await query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.balance,
        u.total_spent,
        u.current_discount,
        u.last_login,
        u.email_verified,
        u.created_at,
        COUNT(DISTINCT p.id) as placement_count,
        COUNT(DISTINCT pr.id) as project_count
      FROM users u
      LEFT JOIN placements p ON u.id = p.user_id
      LEFT JOIN projects pr ON u.id = pr.user_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as count
      FROM users u
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows,
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
    logger.error('Failed to get users', { error: error.message });
    throw error;
  }
};

/**
 * Adjust user balance (admin only)
 */
const adjustUserBalance = async (userId, amount, reason, adminId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get user with lock
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate new balance
    const newBalance = parseFloat(user.balance) + parseFloat(amount);

    if (newBalance < 0) {
      throw new Error('Insufficient balance for adjustment');
    }

    // Update balance
    await client.query(
      'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, userId]
    );

    // Create transaction
    await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, metadata
      )
      VALUES ($1, 'admin_adjustment', $2, $3, $4, $5, $6)
    `, [
      userId,
      amount,
      user.balance,
      newBalance,
      reason || 'Admin balance adjustment',
      JSON.stringify({ adjusted_by_admin: adminId })
    ]);

    // Audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, details)
      VALUES ($1, 'admin_adjust_balance', $2)
    `, [adminId, JSON.stringify({ targetUserId: userId, amount, reason })]);

    // Notification
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'balance_adjusted', $2, $3)
    `, [
      userId,
      'Баланс скорректирован',
      `Администратор скорректировал ваш баланс на $${amount}. Причина: ${reason}`
    ]);

    await client.query('COMMIT');

    logger.info('User balance adjusted by admin', { userId, adminId, amount, reason });

    return { success: true, newBalance };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to adjust user balance', { userId, adminId, amount, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get recent purchases for admin dashboard
 */
const getRecentPurchases = async (limit = 20) => {
  try {
    const result = await query(`
      SELECT
        p.id,
        p.type,
        p.status,
        p.final_price,
        p.discount_applied,
        p.purchased_at,
        u.username,
        u.email,
        pr.name as project_name,
        s.site_name,
        s.site_url
      FROM placements p
      JOIN users u ON p.user_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      JOIN sites s ON p.site_id = s.id
      ORDER BY p.purchased_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;

  } catch (error) {
    logger.error('Failed to get recent purchases', { error: error.message });
    throw error;
  }
};

/**
 * Get all placements for admin (only on their sites)
 */
const getAdminPlacements = async (adminId, { page = 1, limit = 50, status = null, type = null }) => {
  try {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE s.user_id = $1'; // Admin can only see placements on their sites
    const params = [adminId];

    if (status) {
      params.push(status);
      whereClause += ` AND p.status = $${params.length}`;
    }

    if (type) {
      params.push(type);
      whereClause += ` AND p.type = $${params.length}`;
    }

    const result = await query(`
      SELECT
        p.*,
        u.username,
        u.email,
        pr.name as project_name,
        s.site_name,
        s.site_url
      FROM placements p
      JOIN users u ON p.user_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      JOIN sites s ON p.site_id = s.id
      ${whereClause}
      ORDER BY p.purchased_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as count
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows,
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
    logger.error('Failed to get admin placements', { adminId, error: error.message });
    throw error;
  }
};

/**
 * Get multi-period revenue stats (day, week, month, year)
 */
const getMultiPeriodRevenue = async () => {
  try {
    const periods = ['day', 'week', 'month', 'year'];
    const results = {};

    for (const period of periods) {
      const stats = await getAdminStats(period);
      results[period] = stats.revenue;
    }

    return results;

  } catch (error) {
    logger.error('Failed to get multi-period revenue', { error: error.message });
    throw error;
  }
};

module.exports = {
  getAdminStats,
  getRevenueBreakdown,
  getUsers,
  adjustUserBalance,
  getRecentPurchases,
  getAdminPlacements,
  getMultiPeriodRevenue
};
