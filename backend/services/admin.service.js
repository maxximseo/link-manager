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
      'UPDATE users SET balance = $1 WHERE id = $2',
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
const getAdminPlacements = async (adminId, { page = 1, limit = 5000, status = null, type = null }) => {
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

/**
 * Manually refund a placement (admin only)
 * @param {number} placementId - Placement ID to refund
 * @param {string} reason - Reason for manual refund
 * @param {number} adminId - Admin user ID issuing refund
 * @param {boolean} deleteWordPressPost - Whether to delete WordPress post
 * @returns {object} Refund result with amount, new balance, tier info
 */
const refundPlacement = async (placementId, reason, adminId, deleteWordPressPost = false) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get placement details with site info
    const placementResult = await client.query(`
      SELECT
        p.id,
        p.user_id,
        p.project_id,
        p.site_id,
        p.type,
        p.final_price,
        p.original_price,
        p.discount_applied,
        p.wordpress_post_id,
        s.site_name,
        s.site_url,
        s.api_key,
        s.site_type,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1
      FOR UPDATE
    `, [placementId]);

    if (placementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];
    const finalPrice = parseFloat(placement.final_price || 0);

    if (finalPrice <= 0) {
      await client.query('ROLLBACK');
      throw new Error('Placement has no refundable amount (free placement)');
    }

    // 2. Delete WordPress post if requested and possible
    let wordpressPostDeleted = false;
    if (deleteWordPressPost && placement.type === 'article' && placement.wordpress_post_id) {
      if (placement.site_type === 'wordpress' && placement.api_key) {
        const wordpressService = require('./wordpress.service');
        try {
          const result = await wordpressService.deleteArticle(
            placement.site_url,
            placement.api_key,
            placement.wordpress_post_id
          );
          wordpressPostDeleted = result.success;

          if (wordpressPostDeleted) {
            logger.info('WordPress post deleted during admin refund', {
              adminId,
              placementId,
              wordpressPostId: placement.wordpress_post_id
            });
          }
        } catch (error) {
          logger.warn('Failed to delete WordPress post during admin refund', {
            adminId,
            placementId,
            error: error.message
          });
          // Continue with refund even if WP deletion fails
        }
      }
    }

    // 3. Process refund using reusable billing service function
    const refundResult = await billingService.refundPlacementInTransaction(client, placement);

    if (!refundResult.refunded) {
      await client.query('ROLLBACK');
      throw new Error('Failed to process refund');
    }

    // 4. Restore usage counts
    await billingService.restoreUsageCountsInTransaction(client, placementId);

    // 5. Create admin audit log entry
    await client.query(`
      INSERT INTO audit_log (
        user_id, action, entity_type, entity_id, details
      ) VALUES ($1, 'admin_refund_placement', 'placement', $2, $3)
    `, [
      adminId,
      placementId,
      JSON.stringify({
        placement_id: placementId,
        user_id: placement.user_id,
        refund_amount: finalPrice,
        reason,
        wordpress_post_deleted: wordpressPostDeleted,
        site_name: placement.site_name,
        project_name: placement.project_name,
        type: placement.type
      })
    ]);

    // 6. Delete placement
    await client.query('DELETE FROM placements WHERE id = $1', [placementId]);

    // 7. COMMIT transaction
    await client.query('COMMIT');

    // 8. Clear cache
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${placement.user_id}:*`);
    await cache.delPattern(`projects:user:${placement.user_id}:*`);
    await cache.delPattern(`wp:content:*`);

    logger.info('Admin manual refund completed', {
      adminId,
      placementId,
      userId: placement.user_id,
      refundAmount: finalPrice,
      reason,
      tierChanged: refundResult.tierChanged,
      newTier: refundResult.newTier,
      wordpressPostDeleted
    });

    return {
      refunded: true,
      refundAmount: finalPrice,
      newBalance: refundResult.newBalance,
      tierChanged: refundResult.tierChanged,
      newTier: refundResult.newTier,
      wordpressPostDeleted
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Admin refund failed - transaction rolled back', {
      adminId,
      placementId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get placements pending admin approval (moderation queue)
 */
const getPendingApprovals = async () => {
  try {
    const result = await query(`
      SELECT
        p.*,
        u.username as buyer_username,
        u.email as buyer_email,
        pr.name as project_name,
        s.site_name,
        s.site_url,
        s.user_id as site_owner_id,
        owner.username as site_owner_username,
        pc.link_id,
        pc.article_id,
        COALESCE(pl.anchor_text, pa.title) as content_title,
        COALESCE(pl.url, '') as link_url,
        COALESCE(pl.html_context, '') as link_context,
        pa.content as article_content
      FROM placements p
      JOIN users u ON p.user_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      JOIN sites s ON p.site_id = s.id
      JOIN users owner ON s.user_id = owner.id
      LEFT JOIN placement_content pc ON pc.placement_id = p.id
      LEFT JOIN project_links pl ON pc.link_id = pl.id
      LEFT JOIN project_articles pa ON pc.article_id = pa.id
      WHERE p.status = 'pending_approval'
      ORDER BY p.purchased_at DESC
    `);

    return result.rows;

  } catch (error) {
    logger.error('Failed to get pending approvals', { error: error.message });
    throw error;
  }
};

/**
 * Get count of placements pending approval
 */
const getPendingApprovalsCount = async () => {
  try {
    const result = await query(
      "SELECT COUNT(*) as count FROM placements WHERE status = 'pending_approval'"
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error('Failed to get pending approvals count', { error: error.message });
    throw error;
  }
};

/**
 * Approve a placement and trigger publication
 */
const approvePlacement = async (placementId, adminId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get placement with site info
    const placementResult = await client.query(`
      SELECT p.*, s.site_url, s.api_key, s.site_type
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      WHERE p.id = $1
      FOR UPDATE OF p
    `, [placementId]);

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];

    if (placement.status !== 'pending_approval') {
      throw new Error(`Placement is not pending approval (current status: ${placement.status})`);
    }

    // Determine new status: scheduled or pending (for publication)
    let newStatus = 'pending';
    if (placement.scheduled_publish_date && new Date(placement.scheduled_publish_date) > new Date()) {
      newStatus = 'scheduled';
    }

    // Update placement status
    await client.query(`
      UPDATE placements
      SET status = $1, approved_at = NOW(), approved_by = $2
      WHERE id = $3
    `, [newStatus, adminId, placementId]);

    // Audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
      VALUES ($1, 'approve_placement', 'placement', $2, $3)
    `, [
      adminId,
      placementId,
      JSON.stringify({ newStatus, userId: placement.user_id })
    ]);

    // Notify user
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'placement_approved', $2, $3)
    `, [
      placement.user_id,
      'Размещение одобрено',
      `Ваше размещение #${placementId} было одобрено администратором и будет опубликовано.`
    ]);

    await client.query('COMMIT');

    // Trigger async publication if status is 'pending' (not scheduled)
    if (newStatus === 'pending') {
      const site = {
        site_url: placement.site_url,
        api_key: placement.api_key,
        site_type: placement.site_type
      };

      // Import publishPlacementAsync from billing service
      const { publishPlacementAsync } = require('./billing.service');

      publishPlacementAsync(placementId, site).catch(publishError => {
        logger.error('Publication after approval failed', {
          placementId,
          adminId,
          error: publishError.message
        });
      });
    }

    logger.info('Placement approved by admin', {
      placementId,
      adminId,
      newStatus,
      userId: placement.user_id
    });

    return { success: true, newStatus };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to approve placement', { placementId, adminId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reject a placement and refund the user
 */
const rejectPlacement = async (placementId, adminId, reason = 'Rejected by admin') => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get placement details
    const placementResult = await client.query(`
      SELECT p.*, s.site_name, pr.name as project_name
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.id = $1
      FOR UPDATE OF p
    `, [placementId]);

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];

    if (placement.status !== 'pending_approval') {
      throw new Error(`Placement is not pending approval (current status: ${placement.status})`);
    }

    const finalPrice = parseFloat(placement.final_price || 0);

    // 1. Refund user balance
    if (finalPrice > 0) {
      await client.query(`
        UPDATE users
        SET balance = balance + $1, total_spent = total_spent - $1
        WHERE id = $2
      `, [finalPrice, placement.user_id]);

      // Create refund transaction
      await client.query(`
        INSERT INTO transactions (user_id, type, amount, description, metadata)
        VALUES ($1, 'refund', $2, $3, $4)
      `, [
        placement.user_id,
        finalPrice,
        `Refund: Placement #${placementId} rejected`,
        JSON.stringify({ placementId, reason, adminId })
      ]);
    }

    // 2. Update rejection reason
    await client.query(`
      UPDATE placements
      SET status = 'rejected', rejection_reason = $1, approved_by = $2
      WHERE id = $3
    `, [reason, adminId, placementId]);

    // 3. Restore usage counts
    await billingService.restoreUsageCountsInTransaction(client, placementId);

    // 4. Restore site quotas
    if (placement.type === 'link') {
      await client.query(
        'UPDATE sites SET used_links = GREATEST(0, used_links - 1) WHERE id = $1',
        [placement.site_id]
      );
    } else {
      await client.query(
        'UPDATE sites SET used_articles = GREATEST(0, used_articles - 1) WHERE id = $1',
        [placement.site_id]
      );
    }

    // 5. Audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
      VALUES ($1, 'reject_placement', 'placement', $2, $3)
    `, [
      adminId,
      placementId,
      JSON.stringify({ reason, refundAmount: finalPrice, userId: placement.user_id })
    ]);

    // 6. Notify user
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'placement_rejected', $2, $3)
    `, [
      placement.user_id,
      'Размещение отклонено',
      `Ваше размещение #${placementId} было отклонено. Причина: ${reason}. Средства возвращены на баланс.`
    ]);

    await client.query('COMMIT');

    // Clear cache
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${placement.user_id}:*`);
    await cache.delPattern(`projects:user:${placement.user_id}:*`);

    logger.info('Placement rejected by admin', {
      placementId,
      adminId,
      reason,
      refundAmount: finalPrice,
      userId: placement.user_id
    });

    return {
      success: true,
      refundAmount: finalPrice,
      reason
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to reject placement', { placementId, adminId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Set site public status (admin only)
 * @param {number} siteId - Site ID
 * @param {boolean} isPublic - New public status
 * @param {number} adminId - Admin user ID
 * @returns {object} Updated site
 */
const setSitePublicStatus = async (siteId, isPublic, adminId) => {
  try {
    // Update site public status
    const result = await query(
      `UPDATE sites
       SET is_public = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [isPublic, siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    const site = result.rows[0];

    // Create audit log
    await query(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
      VALUES ($1, 'set_site_public_status', 'site', $2, $3)
    `, [
      adminId,
      siteId,
      JSON.stringify({ is_public: isPublic, site_name: site.site_name })
    ]);

    logger.info('Site public status changed by admin', {
      adminId,
      siteId,
      siteName: site.site_name,
      isPublic
    });

    return site;

  } catch (error) {
    logger.error('Failed to set site public status', { siteId, adminId, error: error.message });
    throw error;
  }
};

/**
 * Get all sites for admin (with user info)
 */
const getAllSites = async ({ page = 1, limit = 50, search = null, isPublic = null }) => {
  try {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (s.site_name ILIKE $${params.length} OR s.site_url ILIKE $${params.length})`;
    }

    if (isPublic !== null) {
      params.push(isPublic);
      whereClause += ` AND s.is_public = $${params.length}`;
    }

    const result = await query(`
      SELECT
        s.*,
        u.username as owner_username,
        u.email as owner_email
      FROM sites s
      JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as count
      FROM sites s
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
    logger.error('Failed to get all sites', { error: error.message });
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
  getMultiPeriodRevenue,
  refundPlacement,
  // Moderation functions
  getPendingApprovals,
  getPendingApprovalsCount,
  approvePlacement,
  rejectPlacement,
  // Site management
  setSitePublicStatus,
  getAllSites
};
