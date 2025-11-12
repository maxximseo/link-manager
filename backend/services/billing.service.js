/**
 * Billing service
 * Handles all billing operations: balance management, transactions, discounts, purchases, renewals
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');
const cache = require('./cache.service');
const wordpressService = require('./wordpress.service');

// Pricing constants
const PRICING = {
  LINK_HOMEPAGE: 25.00,      // Homepage link placement
  ARTICLE_GUEST_POST: 15.00, // Guest post article placement
  BASE_RENEWAL_DISCOUNT: 30, // Base discount for link renewals (30%)
  RENEWAL_PERIOD_DAYS: 365   // Renewal period (1 year)
};

/**
 * Get user balance and billing info
 */
const getUserBalance = async (userId) => {
  try {
    const result = await query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.balance,
        u.total_spent,
        u.current_discount,
        dt.tier_name,
        dt.discount_percentage
      FROM users u
      LEFT JOIN discount_tiers dt ON u.current_discount = dt.discount_percentage
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get user balance', { userId, error: error.message });
    throw error;
  }
};

/**
 * Calculate discount tier based on total spent
 */
const calculateDiscountTier = async (totalSpent) => {
  try {
    const result = await query(`
      SELECT discount_percentage, tier_name
      FROM discount_tiers
      WHERE min_spent <= $1
      ORDER BY min_spent DESC
      LIMIT 1
    `, [totalSpent]);

    if (result.rows.length === 0) {
      return { discount: 0, tier: 'Стандарт' };
    }

    return {
      discount: result.rows[0].discount_percentage,
      tier: result.rows[0].tier_name
    };
  } catch (error) {
    logger.error('Failed to calculate discount tier', { totalSpent, error: error.message });
    throw error;
  }
};

/**
 * Get all discount tiers
 */
const getDiscountTiers = async () => {
  try {
    const result = await query(`
      SELECT tier_name, min_spent, discount_percentage
      FROM discount_tiers
      ORDER BY min_spent ASC
    `);

    return result.rows;
  } catch (error) {
    logger.error('Failed to get discount tiers', { error: error.message });
    throw error;
  }
};

/**
 * Add balance to user account (deposit)
 */
const addBalance = async (userId, amount, description = 'Balance deposit', adminId = null) => {
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

    // Update balance
    const newBalance = parseFloat(user.balance) + parseFloat(amount);
    await client.query(
      'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, userId]
    );

    // Create transaction record
    const metadata = adminId ? { added_by_admin: adminId } : {};
    await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, metadata
      )
      VALUES ($1, 'deposit', $2, $3, $4, $5, $6)
    `, [userId, amount, user.balance, newBalance, description, JSON.stringify(metadata)]);

    // Create notification
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'balance_deposited', $2, $3)
    `, [
      userId,
      'Баланс пополнен',
      `Ваш баланс пополнен на $${amount}. Новый баланс: $${newBalance.toFixed(2)}`
    ]);

    await client.query('COMMIT');

    logger.info('Balance added successfully', { userId, amount, newBalance });

    return { success: true, newBalance, amount };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to add balance', { userId, amount, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Purchase placement (link or article)
 */
const purchasePlacement = async ({
  userId,
  projectId,
  siteId,
  type,           // 'link' or 'article'
  contentIds,     // Array of link/article IDs
  scheduledDate,  // Optional: scheduled publish date (ISO string)
  autoRenewal = false
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get user with lock
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found');
    }

    // 2. Validate project ownership
    const projectResult = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found or unauthorized');
    }

    // 3. Validate site exists
    const siteResult = await client.query(
      'SELECT * FROM sites WHERE id = $1',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];

    // 4. CRITICAL FIX (BUG #5): Check site quotas BEFORE creating placement
    if (type === 'link' && site.used_links >= site.max_links) {
      throw new Error(
        `Site "${site.site_name}" has reached its link limit (${site.used_links}/${site.max_links} used). ` +
        `Cannot create new link placement.`
      );
    }

    if (type === 'article' && site.used_articles >= site.max_articles) {
      throw new Error(
        `Site "${site.site_name}" has reached its article limit (${site.used_articles}/${site.max_articles} used). ` +
        `Cannot create new article placement.`
      );
    }

    // 5. Check if placement already exists for this project/site combination
    const existingPlacement = await client.query(`
      SELECT id FROM placements
      WHERE project_id = $1 AND site_id = $2 AND type = $3 AND status NOT IN ('cancelled', 'expired')
    `, [projectId, siteId, type]);

    if (existingPlacement.rows.length > 0) {
      throw new Error(`A ${type} placement already exists for this project on this site`);
    }

    // 4.5. CRITICAL: Validate content IDs BEFORE charging money

    // CRITICAL FIX (BUG #7): Enforce single contentId per placement (business logic: 1 link/article per site)
    if (!contentIds || contentIds.length === 0) {
      throw new Error('At least one content ID is required');
    }

    if (contentIds.length > 1) {
      throw new Error(
        `You can only place 1 ${type} per site per project. ` +
        `You provided ${contentIds.length} ${type}s. ` +
        `Please create separate placements for each ${type}.`
      );
    }

    const tableName = type === 'link' ? 'project_links' : 'project_articles';

    for (const contentId of contentIds) {
      // Check if content exists AND belongs to user AND is not exhausted
      const contentResult = await client.query(`
        SELECT id, project_id, usage_count, usage_limit, status
        FROM ${tableName}
        WHERE id = $1
      `, [contentId]);

      // TEST 1: Non-existent contentId
      if (contentResult.rows.length === 0) {
        throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${contentId} not found`);
      }

      const content = contentResult.rows[0];

      // TEST 2: Ownership validation - content must belong to the same project
      if (content.project_id !== projectId) {
        throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${contentId} does not belong to project ${projectId} (ownership violation)`);
      }

      // TEST 4: Exhausted content
      if (content.status === 'exhausted' || content.usage_count >= content.usage_limit) {
        throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${contentId} is exhausted (${content.usage_count}/${content.usage_limit} uses)`);
      }
    }

    // 5. Calculate price
    const basePrice = type === 'link' ? PRICING.LINK_HOMEPAGE : PRICING.ARTICLE_GUEST_POST;
    const discount = user.current_discount || 0;
    const finalPrice = basePrice * (1 - discount / 100);

    // 7. Check balance
    if (parseFloat(user.balance) < finalPrice) {
      throw new Error(`Insufficient balance. Required: $${finalPrice.toFixed(2)}, Available: $${user.balance}`);
    }

    // 8. Deduct from balance
    const newBalance = parseFloat(user.balance) - finalPrice;
    const newTotalSpent = parseFloat(user.total_spent) + finalPrice;

    await client.query(
      'UPDATE users SET balance = $1, total_spent = $2, updated_at = NOW() WHERE id = $3',
      [newBalance, newTotalSpent, userId]
    );

    // 9. Create transaction
    const transactionResult = await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, metadata
      )
      VALUES ($1, 'purchase', $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      userId,
      -finalPrice,
      user.balance,
      newBalance,
      `Purchase ${type} placement on ${site.site_name}`,
      JSON.stringify({ type, discount, basePrice, finalPrice, projectId, siteId })
    ]);

    const transactionId = transactionResult.rows[0].id;

    // 10. Calculate expiry date (only for links)
    let expiresAt = null;
    let renewalPrice = null;

    if (type === 'link') {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + PRICING.RENEWAL_PERIOD_DAYS);
      expiresAt = expiryDate.toISOString();

      // Calculate renewal price: base * (1 - 0.30) * (1 - personalDiscount/100)
      renewalPrice = basePrice * (1 - PRICING.BASE_RENEWAL_DISCOUNT / 100) * (1 - discount / 100);
    }

    // 11. Parse scheduled date
    let scheduledPublishDate = null;
    let status = 'pending';

    if (scheduledDate) {
      scheduledPublishDate = new Date(scheduledDate);

      // Validate scheduled date (max 90 days in future)
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 90);

      if (scheduledPublishDate > maxDate) {
        throw new Error('Scheduled date cannot be more than 90 days in the future');
      }

      if (scheduledPublishDate > new Date()) {
        status = 'scheduled';
      }
    }

    // 12. Create placement
    const placementResult = await client.query(`
      INSERT INTO placements (
        user_id, project_id, site_id, type,
        original_price, discount_applied, final_price,
        purchased_at, scheduled_publish_date, expires_at,
        auto_renewal, renewal_price,
        purchase_transaction_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      userId, projectId, siteId, type,
      basePrice, discount, finalPrice,
      scheduledPublishDate, expiresAt,
      autoRenewal, renewalPrice,
      transactionId, status
    ]);

    const placement = placementResult.rows[0];

    // 13. Link content (links or articles)
    for (const contentId of contentIds) {
      const columnName = type === 'link' ? 'link_id' : 'article_id';
      await client.query(`
        INSERT INTO placement_content (placement_id, ${columnName})
        VALUES ($1, $2)
      `, [placement.id, contentId]);

      // Update usage count
      const tableName = type === 'link' ? 'project_links' : 'project_articles';
      await client.query(`
        UPDATE ${tableName}
        SET usage_count = usage_count + 1,
            status = CASE WHEN usage_count + 1 >= usage_limit THEN 'exhausted' ELSE 'active' END
        WHERE id = $1
      `, [contentId]);
    }

    // 14. Update site quotas
    if (type === 'link') {
      await client.query(
        'UPDATE sites SET used_links = used_links + 1 WHERE id = $1',
        [siteId]
      );
    } else {
      await client.query(
        'UPDATE sites SET used_articles = used_articles + 1 WHERE id = $1',
        [siteId]
      );
    }

    // 15. Update discount tier if needed
    const newTier = await calculateDiscountTier(newTotalSpent);
    if (newTier.discount !== user.current_discount) {
      await client.query(
        'UPDATE users SET current_discount = $1 WHERE id = $2',
        [newTier.discount, userId]
      );

      // Notify user about tier upgrade
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message)
        VALUES ($1, 'discount_tier_achieved', $2, $3)
      `, [
        userId,
        'Новый уровень скидки!',
        `Поздравляем! Вы достигли уровня "${newTier.tier}" со скидкой ${newTier.discount}%`
      ]);
    }

    // 15. If not scheduled, publish immediately
    // TEST 3: WordPress failure must ROLLBACK entire transaction
    if (status === 'pending') {
      try {
        await publishPlacement(client, placement.id);
      } catch (publishError) {
        logger.error('Failed to publish placement - ROLLING BACK transaction', {
          placementId: placement.id,
          userId,
          error: publishError.message
        });

        // CRITICAL FIX: ROLLBACK transaction to refund user's money
        await client.query('ROLLBACK');
        throw new Error(`Failed to publish placement: ${publishError.message}. Your balance has not been charged.`);
      }
    }

    // 17. Create audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, details)
      VALUES ($1, 'purchase_placement', $2)
    `, [userId, JSON.stringify({ placementId: placement.id, type, siteId, finalPrice })]);

    await client.query('COMMIT');

    // Clear cache
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);

    logger.info('Placement purchased successfully', {
      userId,
      placementId: placement.id,
      type,
      finalPrice,
      newBalance,
      newDiscount: newTier.discount
    });

    return {
      success: true,
      placement,
      newBalance,
      newDiscount: newTier.discount,
      newTier: newTier.tier
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to purchase placement', { userId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Publish placement to WordPress (internal helper)
 */
const publishPlacement = async (client, placementId) => {
  // Get placement details
  const placementResult = await client.query(`
    SELECT p.*, s.api_key, s.site_url
    FROM placements p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = $1
  `, [placementId]);

  const placement = placementResult.rows[0];

  // Get content
  const contentResult = await client.query(`
    SELECT
      pc.*,
      pl.url, pl.anchor_text,
      pa.title, pa.content
    FROM placement_content pc
    LEFT JOIN project_links pl ON pc.link_id = pl.id
    LEFT JOIN project_articles pa ON pc.article_id = pa.id
    WHERE pc.placement_id = $1
  `, [placementId]);

  const content = contentResult.rows[0];

  // Publish to WordPress
  if (placement.type === 'article' && content.article_id) {
    const result = await wordpressService.publishArticle(
      placement.api_key,
      content.title,
      content.content,
      placement.site_url
    );

    await client.query(`
      UPDATE placements
      SET status = 'placed',
          published_at = NOW(),
          wordpress_post_id = $1
      WHERE id = $2
    `, [result.post_id, placementId]);

    logger.info('Article published successfully', { placementId, wordpressPostId: result.post_id });
  } else {
    // For links, mark as placed (actual publication handled by plugin)
    await client.query(`
      UPDATE placements
      SET status = 'placed', published_at = NOW()
      WHERE id = $1
    `, [placementId]);

    logger.info('Link placement marked as placed', { placementId });
  }
};

/**
 * Renew placement (only for links)
 */
const renewPlacement = async (placementId, userId, isAutoRenewal = false) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get placement and user with lock
    const placementResult = await client.query(`
      SELECT p.*, u.balance, u.current_discount
      FROM placements p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p, u
    `, [placementId, userId]);

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    // 2. Validate placement type
    if (placement.type !== 'link') {
      throw new Error('Only homepage links can be renewed');
    }

    // 3. Calculate renewal price
    const basePrice = PRICING.LINK_HOMEPAGE;
    const baseRenewalDiscount = PRICING.BASE_RENEWAL_DISCOUNT;
    const personalDiscount = placement.current_discount || 0;

    // Apply both discounts sequentially
    const priceAfterBaseDiscount = basePrice * (1 - baseRenewalDiscount / 100);
    const finalRenewalPrice = priceAfterBaseDiscount * (1 - personalDiscount / 100);

    // 4. Check balance
    if (parseFloat(placement.balance) < finalRenewalPrice) {
      throw new Error(`Insufficient balance for renewal. Required: $${finalRenewalPrice.toFixed(2)}, Available: $${placement.balance}`);
    }

    // 5. Deduct from balance
    const newBalance = parseFloat(placement.balance) - finalRenewalPrice;
    const newTotalSpent = parseFloat(placement.total_spent || 0) + finalRenewalPrice;

    await client.query(
      'UPDATE users SET balance = $1, total_spent = $2, updated_at = NOW() WHERE id = $3',
      [newBalance, newTotalSpent, userId]
    );

    // 6. Create transaction
    const transactionType = isAutoRenewal ? 'auto_renewal' : 'renewal';
    const transactionResult = await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, placement_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      userId,
      transactionType,
      -finalRenewalPrice,
      placement.balance,
      newBalance,
      `Renewal of placement #${placementId}`,
      placementId,
      JSON.stringify({ basePrice, baseRenewalDiscount, personalDiscount, finalPrice: finalRenewalPrice })
    ]);

    const transactionId = transactionResult.rows[0].id;

    // 7. Update placement expiry
    const newExpiryDate = new Date(placement.expires_at || new Date());
    newExpiryDate.setDate(newExpiryDate.getDate() + PRICING.RENEWAL_PERIOD_DAYS);

    await client.query(`
      UPDATE placements
      SET expires_at = $1,
          last_renewed_at = NOW(),
          renewal_count = renewal_count + 1,
          renewal_price = $2
      WHERE id = $3
    `, [newExpiryDate, finalRenewalPrice, placementId]);

    // 8. Record renewal history
    await client.query(`
      INSERT INTO renewal_history (
        placement_id, user_id, price_paid, discount_applied, new_expiry_date, transaction_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [placementId, userId, finalRenewalPrice, personalDiscount, newExpiryDate, transactionId]);

    // 9. Create notification
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, $2, $3, $4)
    `, [
      userId,
      'placement_renewed',
      'Размещение продлено',
      `Размещение #${placementId} успешно продлено до ${newExpiryDate.toLocaleDateString()}. Списано $${finalRenewalPrice.toFixed(2)}`
    ]);

    // 10. Audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, details)
      VALUES ($1, 'renew_placement', $2)
    `, [userId, JSON.stringify({ placementId, isAutoRenewal, pricePaid: finalRenewalPrice })]);

    await client.query('COMMIT');

    logger.info('Placement renewed successfully', {
      placementId,
      userId,
      isAutoRenewal,
      pricePaid: finalRenewalPrice,
      newExpiryDate
    });

    return {
      success: true,
      newExpiryDate,
      pricePaid: finalRenewalPrice,
      newBalance
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to renew placement', { placementId, userId, isAutoRenewal, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Toggle auto-renewal for placement
 */
const toggleAutoRenewal = async (placementId, userId, enabled) => {
  try {
    // Verify ownership
    const placementResult = await query(
      'SELECT * FROM placements WHERE id = $1 AND user_id = $2',
      [placementId, userId]
    );

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    if (placement.type !== 'link') {
      throw new Error('Auto-renewal is only available for homepage links');
    }

    await query(
      'UPDATE placements SET auto_renewal = $1 WHERE id = $2',
      [enabled, placementId]
    );

    logger.info('Auto-renewal toggled', { placementId, userId, enabled });

    return { success: true, enabled };

  } catch (error) {
    logger.error('Failed to toggle auto-renewal', { placementId, userId, enabled, error: error.message });
    throw error;
  }
};

/**
 * Get user transactions
 */
const getUserTransactions = async (userId, { page = 1, limit = 50, type = null }) => {
  try {
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    const params = [userId];

    if (type) {
      whereClause += ' AND type = $2';
      params.push(type);
    }

    const result = await query(`
      SELECT *
      FROM transactions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as count
      FROM transactions
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
    logger.error('Failed to get user transactions', { userId, error: error.message });
    throw error;
  }
};

/**
 * Calculate pricing for user (with their discount)
 */
const getPricingForUser = async (userId) => {
  try {
    const user = await getUserBalance(userId);
    const discount = user.current_discount || 0;

    const linkPrice = PRICING.LINK_HOMEPAGE * (1 - discount / 100);
    const articlePrice = PRICING.ARTICLE_GUEST_POST * (1 - discount / 100);

    // Calculate renewal price
    const renewalPrice = PRICING.LINK_HOMEPAGE
      * (1 - PRICING.BASE_RENEWAL_DISCOUNT / 100)
      * (1 - discount / 100);

    const maxDiscount = Math.min(60, PRICING.BASE_RENEWAL_DISCOUNT + discount);

    return {
      link: {
        basePrice: PRICING.LINK_HOMEPAGE,
        discount: discount,
        finalPrice: linkPrice
      },
      article: {
        basePrice: PRICING.ARTICLE_GUEST_POST,
        discount: discount,
        finalPrice: articlePrice
      },
      renewal: {
        basePrice: PRICING.LINK_HOMEPAGE,
        baseDiscount: PRICING.BASE_RENEWAL_DISCOUNT,
        personalDiscount: discount,
        totalDiscount: maxDiscount,
        finalPrice: renewalPrice
      },
      currentTier: {
        name: user.tier_name,
        discount: discount
      },
      discountTiers: await getDiscountTiers()
    };

  } catch (error) {
    logger.error('Failed to get pricing for user', { userId, error: error.message });
    throw error;
  }
};

/**
 * Refund a placement deletion
 * Called when a paid placement is deleted
 */
const refundPlacement = async (placementId, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get placement with billing data and lock it
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
        p.purchase_transaction_id,
        p.placed_at,
        s.site_name,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p
    `, [placementId, userId]);

    if (placementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    // Check if it's a paid placement
    const finalPrice = parseFloat(placement.final_price || 0);

    if (finalPrice <= 0) {
      // Free placement, no refund needed
      await client.query('ROLLBACK');
      return { refunded: false, amount: 0, reason: 'No payment made for this placement' };
    }

    // Get user balance with lock
    const userResult = await client.query(
      'SELECT id, balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const balanceBefore = parseFloat(user.balance);
    const balanceAfter = balanceBefore + finalPrice;

    // Refund the amount
    await client.query(
      'UPDATE users SET balance = $1 WHERE id = $2',
      [balanceAfter, userId]
    );

    // Create refund transaction
    const transactionResult = await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after,
        description, related_placement_id
      ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [
      userId,
      finalPrice, // Positive amount for refund
      balanceBefore,
      balanceAfter,
      `Refund for ${placement.type} placement on ${placement.site_name} (${placement.project_name})`,
      placementId
    ]);

    const transaction = transactionResult.rows[0];

    // Add audit log
    await client.query(`
      INSERT INTO audit_log (
        user_id, action, entity_type, entity_id, details
      ) VALUES ($1, 'placement_refund', 'placement', $2, $3)
    `, [
      userId,
      placementId,
      JSON.stringify({
        refund_amount: finalPrice,
        original_price: placement.original_price,
        discount_applied: placement.discount_applied,
        transaction_id: transaction.id,
        site_name: placement.site_name,
        project_name: placement.project_name,
        type: placement.type
      })
    ]);

    await client.query('COMMIT');

    logger.info('Placement refunded successfully', {
      placementId,
      userId,
      refundAmount: finalPrice,
      newBalance: balanceAfter,
      transactionId: transaction.id
    });

    return {
      refunded: true,
      amount: finalPrice,
      newBalance: balanceAfter,
      transactionId: transaction.id,
      transactionDate: transaction.created_at
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to refund placement', {
      placementId,
      userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * CRITICAL FIX: Atomic delete with refund (single transaction)
 * Prevents race conditions and ensures money safety
 */
const deleteAndRefundPlacement = async (placementId, userId) => {
  const client = await pool.connect();
  const placementService = require('./placement.service');

  try {
    await client.query('BEGIN');

    // 1. Get placement with lock and verify ownership
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
        p.purchase_transaction_id,
        p.placed_at,
        p.status,
        s.site_name,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1
      FOR UPDATE OF p
    `, [placementId]);

    if (placementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];

    // 2. Verify ownership
    if (placement.user_id !== userId) {
      await client.query('ROLLBACK');
      throw new Error('Unauthorized to delete this placement');
    }

    // 3. Process refund if paid
    let refundResult = { refunded: false, amount: 0 };
    const finalPrice = parseFloat(placement.final_price || 0);

    if (finalPrice > 0) {
      // Get user with lock
      const userResult = await client.query(
        'SELECT id, balance FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      const balanceBefore = parseFloat(user.balance);
      const balanceAfter = balanceBefore + finalPrice;

      // Refund money
      await client.query(
        'UPDATE users SET balance = $1 WHERE id = $2',
        [balanceAfter, userId]
      );

      // Create refund transaction
      await client.query(`
        INSERT INTO transactions (
          user_id, type, amount, balance_before, balance_after,
          description, related_placement_id
        ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
      `, [
        userId,
        finalPrice,
        balanceBefore,
        balanceAfter,
        `Refund for ${placement.type} placement on ${placement.site_name} (${placement.project_name})`,
        placementId
      ]);

      // Audit log for refund
      await client.query(`
        INSERT INTO audit_log (
          user_id, action, entity_type, entity_id, details
        ) VALUES ($1, 'placement_refund', 'placement', $2, $3)
      `, [
        userId,
        placementId,
        JSON.stringify({
          refund_amount: finalPrice,
          original_price: placement.original_price,
          discount_applied: placement.discount_applied,
          site_name: placement.site_name,
          project_name: placement.project_name,
          type: placement.type
        })
      ]);

      refundResult = {
        refunded: true,
        amount: finalPrice,
        newBalance: balanceAfter
      };

      logger.info('Refund processed within delete transaction', {
        placementId,
        userId,
        refundAmount: finalPrice,
        newBalance: balanceAfter
      });
    }

    // 4. Delete placement content and placement itself
    // Get content IDs
    const contentResult = await client.query(`
      SELECT
        array_agg(DISTINCT link_id) FILTER (WHERE link_id IS NOT NULL) as link_ids,
        array_agg(DISTINCT article_id) FILTER (WHERE article_id IS NOT NULL) as article_ids,
        COUNT(DISTINCT link_id) as link_count,
        COUNT(DISTINCT article_id) as article_count
      FROM placement_content
      WHERE placement_id = $1
    `, [placementId]);

    const { link_ids, article_ids, link_count, article_count } = contentResult.rows[0];

    // Delete placement (cascade will delete placement_content)
    await client.query('DELETE FROM placements WHERE id = $1', [placementId]);

    // Update site quotas
    if (parseInt(link_count) > 0) {
      await client.query(
        'UPDATE sites SET used_links = GREATEST(0, used_links - $1) WHERE id = $2',
        [link_count, placement.site_id]
      );
    }
    if (parseInt(article_count) > 0) {
      await client.query(
        'UPDATE sites SET used_articles = GREATEST(0, used_articles - $1) WHERE id = $2',
        [article_count, placement.site_id]
      );
    }

    // Decrement usage_count for links
    if (link_ids && link_ids.length > 0) {
      for (const linkId of link_ids) {
        await client.query(`
          UPDATE project_links
          SET usage_count = GREATEST(0, usage_count - 1),
              status = CASE
                WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
                ELSE status
              END
          WHERE id = $1
        `, [linkId]);
      }
    }

    // Decrement usage_count for articles
    if (article_ids && article_ids.length > 0) {
      for (const articleId of article_ids) {
        await client.query(`
          UPDATE project_articles
          SET usage_count = GREATEST(0, usage_count - 1),
              status = CASE
                WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'published'
                ELSE status
              END
          WHERE id = $1
        `, [articleId]);
      }
    }

    // 5. Audit log for deletion
    await client.query(`
      INSERT INTO audit_log (
        user_id, action, entity_type, entity_id, details
      ) VALUES ($1, 'placement_delete', 'placement', $2, $3)
    `, [
      userId,
      placementId,
      JSON.stringify({
        placement_type: placement.type,
        site_name: placement.site_name,
        project_name: placement.project_name,
        refunded: refundResult.refunded,
        refund_amount: refundResult.amount
      })
    ]);

    // 6. COMMIT everything atomically
    await client.query('COMMIT');

    // Clear cache
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    await cache.delPattern(`wp:content:*`);

    logger.info('Placement deleted atomically with refund', {
      placementId,
      userId,
      refunded: refundResult.refunded,
      refundAmount: refundResult.amount
    });

    return {
      deleted: true,
      ...refundResult
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Atomic delete with refund failed - transaction rolled back', {
      placementId,
      userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  PRICING,
  getUserBalance,
  calculateDiscountTier,
  getDiscountTiers,
  addBalance,
  purchasePlacement,
  renewPlacement,
  toggleAutoRenewal,
  getUserTransactions,
  getPricingForUser,
  refundPlacement,
  deleteAndRefundPlacement
};
