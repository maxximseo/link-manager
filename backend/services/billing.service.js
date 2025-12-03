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
  OWNER_RATE: 0.10,          // Special rate for placing content on own sites
  BASE_RENEWAL_DISCOUNT: 30, // Base discount for link renewals (30%)
  RENEWAL_PERIOD_DAYS: 365,  // Renewal period (1 year)
  MAX_TOTAL_DISCOUNT: 60     // Maximum combined discount (base + personal tier)
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
      'UPDATE users SET balance = $1 WHERE id = $2',
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

    // 3. Validate site exists AND lock for quota check (prevent race condition)
    const siteResult = await client.query(
      'SELECT * FROM sites WHERE id = $1 FOR UPDATE',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];

    // 3.1. NEW: Check site visibility authorization
    // User can purchase if:
    // - Site is public (is_public = TRUE), OR
    // - User owns the site (site.user_id === userId)
    if (!site.is_public && site.user_id !== userId) {
      throw new Error(
        `Сайт "${site.site_name}" приватный. ` +
        `Только владелец может размещать контент на приватных сайтах.`
      );
    }

    // 3.5. Validate site type - static_php sites cannot purchase articles
    if (site.site_type === 'static_php' && type === 'article') {
      throw new Error(
        `Site "${site.site_name}" is a static PHP site and does not support article placements. ` +
        `Static PHP sites can only purchase link placements.`
      );
    }

    // 3.6. Validate allow_articles flag - check if site allows article placements
    if (type === 'article' && !site.allow_articles) {
      throw new Error(
        `Site "${site.site_name}" does not allow article placements. ` +
        `The site owner has disabled article purchases. Only link placements are permitted on this site.`
      );
    }

    // 3.7. Validate available_for_purchase flag - check if site is open for new placements
    if (site.available_for_purchase === false) {
      throw new Error(
        `Site "${site.site_name}" is not available for purchase. ` +
        `The site owner has temporarily closed this site for new placements.`
      );
    }

    // 4. CRITICAL FIX (BUG #5): Check site quotas BEFORE creating placement (with lock to prevent race condition)
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

    // OPTIMIZATION: Batch content validation (1 query instead of N queries)
    // OLD: for-loop with N queries (200-300ms per item)
    // NEW: Single query with ANY operator (50ms total)
    const tableName = type === 'link' ? 'project_links' : 'project_articles';

    const contentResult = await client.query(`
      SELECT id, project_id, usage_count, usage_limit, status,
             ${type === 'link' ? 'anchor_text, url' : 'title'}
      FROM ${tableName}
      WHERE id = ANY($1::int[])
      FOR UPDATE
    `, [contentIds]);

    // TEST 1: Non-existent contentId
    if (contentResult.rows.length !== contentIds.length) {
      const foundIds = contentResult.rows.map(r => r.id);
      const missingIds = contentIds.filter(id => !foundIds.includes(id));
      throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID(s) ${missingIds.join(', ')} not found`);
    }

    // Validate each content item
    for (const content of contentResult.rows) {
      // TEST 2: Ownership validation - content must belong to the same project
      if (content.project_id !== projectId) {
        throw new Error(`${type === 'link' ? 'Link' : 'Article'} with ID ${content.id} does not belong to project ${projectId} (ownership violation)`);
      }

      // TEST 4: Exhausted content
      if (content.status === 'exhausted' || content.usage_count >= content.usage_limit) {
        const displayName = type === 'link' ? content.anchor_text : content.title;
        throw new Error(`${type === 'link' ? 'Link' : 'Article'} "${displayName}" is exhausted (${content.usage_count}/${content.usage_limit} uses)`);
      }
    }

    // 5. Calculate price
    // SPECIAL PRICING: If user owns the site, flat rate of $0.10 (no discounts applied)
    const isOwnSite = site.user_id === userId;

    let basePrice, discount, finalPrice;

    if (isOwnSite) {
      // Owner's special rate for both links and articles
      basePrice = PRICING.OWNER_RATE;
      discount = 0;
      finalPrice = PRICING.OWNER_RATE;
      logger.info('Owner pricing applied', { userId, siteId, siteName: site.site_name, price: finalPrice });
    } else {
      // Standard pricing with user's discount tier
      basePrice = type === 'link' ? PRICING.LINK_HOMEPAGE : PRICING.ARTICLE_GUEST_POST;
      discount = parseFloat(user.current_discount) || 0;
      finalPrice = basePrice * (1 - discount / 100);
    }

    // 7. Check balance
    if (parseFloat(user.balance) < finalPrice) {
      throw new Error(`Insufficient balance. Required: $${finalPrice.toFixed(2)}, Available: $${user.balance}`);
    }

    // 8. Deduct from balance
    const newBalance = parseFloat(user.balance) - finalPrice;
    const newTotalSpent = parseFloat(user.total_spent) + finalPrice;

    await client.query(
      'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
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

      // Calculate renewal price
      if (isOwnSite) {
        // Owner's renewal price: same flat rate
        renewalPrice = PRICING.OWNER_RATE;
      } else {
        // Standard renewal: base * (1 - 0.30) * (1 - personalDiscount/100)
        renewalPrice = basePrice * (1 - PRICING.BASE_RENEWAL_DISCOUNT / 100) * (1 - discount / 100);
      }
    }

    // 11. Parse scheduled date and determine moderation status
    let scheduledPublishDate = null;
    let status = 'pending';

    // MODERATION LOGIC:
    // - Admin (role='admin') → no moderation needed
    // - User on OWN site (site.user_id === userId) → no moderation needed
    // - User on SOMEONE ELSE's site → requires admin approval
    const isAdmin = user.role === 'admin';
    const needsApproval = !isAdmin && !isOwnSite;

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

    // Override status if moderation is required
    if (needsApproval) {
      status = 'pending_approval';
      logger.info('Placement requires admin approval', {
        userId,
        siteId,
        siteName: site.site_name,
        siteOwner: site.user_id
      });
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
    if (newTier.discount !== parseFloat(user.current_discount)) {
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

    // 16. Get project name for notifications
    const project = projectResult.rows[0];
    const typeLabel = type === 'link' ? 'ссылка' : 'статья';

    // 17. NOTIFICATION: Create notification for user about purchase
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES ($1, 'placement_purchased', $2, $3, $4)
    `, [
      userId,
      'Размещение куплено',
      `${typeLabel === 'ссылка' ? 'Куплена' : 'Куплена'} ${typeLabel} на сайте "${site.site_name}" для проекта "${project.name}". Списано $${finalPrice.toFixed(2)}.`,
      JSON.stringify({ placementId: placement.id, type, siteId, siteName: site.site_name, projectId, projectName: project.name, price: finalPrice })
    ]);

    // 18. NOTIFICATION: Create notification for other admins about purchase (exclude buyer to avoid duplicates)
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message, metadata)
      SELECT id, 'admin_placement_purchased', $1, $2, $3
      FROM users WHERE role = 'admin' AND id != $4
    `, [
      'Новая покупка',
      `Пользователь "${user.username}" купил ${typeLabel === 'ссылка' ? 'ссылку' : 'статью'} на "${site.site_name}" за $${finalPrice.toFixed(2)}.`,
      JSON.stringify({ placementId: placement.id, userId, username: user.username, type, siteId, siteName: site.site_name, projectId, projectName: project.name, price: finalPrice }),
      userId
    ]);

    // 19. OPTIMIZATION: Publish AFTER transaction commit (async)
    // OLD: WordPress publication inside transaction blocked for 500-1000ms
    // NEW: Commit first, then publish async (no blocking)

    // 17. Create audit log
    await client.query(`
      INSERT INTO audit_log (user_id, action, details)
      VALUES ($1, 'purchase_placement', $2)
    `, [userId, JSON.stringify({ placementId: placement.id, type, siteId, finalPrice })]);

    await client.query('COMMIT');

    // OPTIMIZATION: Async cache invalidation (don't await - save 60-150ms)
    // Cache staleness is acceptable (2 min TTL)
    cache.delPattern(`placements:user:${userId}:*`).catch(err =>
      logger.error('Cache invalidation failed (placements)', { userId, err })
    );
    cache.delPattern(`projects:user:${userId}:*`).catch(err =>
      logger.error('Cache invalidation failed (projects)', { userId, err })
    );

    // CRITICAL FIX: Invalidate WordPress/Static content cache for this site
    // This ensures the plugin/widget shows updated content immediately
    if (site.site_type === 'wordpress' && site.api_key) {
      cache.del(`wp:content:${site.api_key}`).catch(err =>
        logger.error('Cache invalidation failed (wp content)', { apiKey: site.api_key, err })
      );
    } else if (site.site_type === 'static_php' && site.site_url) {
      // Normalize domain for cache key
      const normalizedDomain = site.site_url
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
      cache.del(`static:content:${normalizedDomain}`).catch(err =>
        logger.error('Cache invalidation failed (static content)', { domain: normalizedDomain, err })
      );
    }

    // OPTIMIZATION: Async WordPress publication (after commit)
    // Don't block response - publish in background
    // NOTE: Placements with status 'pending_approval' skip publication until admin approves
    if (status === 'pending') {
      publishPlacementAsync(placement.id, site).catch(publishError => {
        logger.error('Async publication failed - placement remains pending', {
          placementId: placement.id,
          userId,
          error: publishError.message
        });
        // NOTE: User has been charged, placement marked as 'pending'
        // Admin can manually retry publication from UI
      });
    } else if (status === 'pending_approval') {
      logger.info('Placement awaiting admin approval - publication deferred', {
        placementId: placement.id,
        userId,
        siteId
      });
    }

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
 * Publish placement to WordPress ASYNC (after transaction commit)
 * OPTIMIZATION: Runs in background, doesn't block purchase response
 */
const publishPlacementAsync = async (placementId, site) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get placement details
    const placementResult = await client.query(`
      SELECT p.*
      FROM placements p
      WHERE p.id = $1
    `, [placementId]);

    const placement = placementResult.rows[0];

    if (!placement) {
      throw new Error(`Placement ${placementId} not found`);
    }

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
        site.site_url,
        site.api_key,
        {
          title: content.title,
          content: content.content,
          slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        }
      );

      await client.query(`
        UPDATE placements
        SET status = 'placed',
            published_at = NOW(),
            wordpress_post_id = $1
        WHERE id = $2
      `, [result.post_id, placementId]);

      logger.info('Article published successfully (async)', { placementId, wordpressPostId: result.post_id });
    } else {
      // For links, mark as placed (actual publication handled by plugin)
      await client.query(`
        UPDATE placements
        SET status = 'placed', published_at = NOW()
        WHERE id = $1
      `, [placementId]);

      logger.info('Link placement marked as placed (async)', { placementId });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Async publication failed', { placementId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Publish scheduled placement NOW (manual trigger or cron)
 * Changes status from 'scheduled' to 'pending' or 'placed'
 */
const publishScheduledPlacement = async (placementId, userId = null) => {
  try {
    // Get placement with site info
    const placementResult = await query(`
      SELECT p.*, s.api_key, s.site_url, s.site_type
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      WHERE p.id = $1
    `, [placementId]);

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];

    // Validate status
    if (placement.status !== 'scheduled') {
      throw new Error(`Placement status is '${placement.status}', not 'scheduled'. Cannot publish.`);
    }

    // Authorization check (if userId provided)
    if (userId && placement.user_id !== userId) {
      throw new Error('Unauthorized: You can only publish your own placements');
    }

    // Create site object for publishPlacementAsync
    const site = {
      id: placement.site_id,
      api_key: placement.api_key,
      site_url: placement.site_url,
      site_type: placement.site_type
    };

    // Trigger async publication
    await publishPlacementAsync(placementId, site);

    logger.info('Scheduled placement published', { placementId, userId });

    return {
      success: true,
      placementId,
      message: 'Placement is being published'
    };
  } catch (error) {
    logger.error('Failed to publish scheduled placement', { placementId, userId, error: error.message });
    throw error;
  }
};

/**
 * Publish placement to WordPress (internal helper) - DEPRECATED
 * Use publishPlacementAsync instead for better performance
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
      placement.site_url,
      placement.api_key,
      {
        title: content.title,
        content: content.content,
        slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      }
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

    // 1. Get placement, user, and site with lock
    const placementResult = await client.query(`
      SELECT p.*, u.balance, u.current_discount, u.total_spent, s.user_id as site_owner_id
      FROM placements p
      JOIN users u ON p.user_id = u.id
      JOIN sites s ON p.site_id = s.id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p, u
    `, [placementId, userId]);

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    // Extract user financial data from locked row (FOR UPDATE ensures these are current)
    // NOTE: placement object contains joined user data (u.balance, u.current_discount, u.total_spent)
    const userBalance = parseFloat(placement.balance);
    const userCurrentDiscount = parseFloat(placement.current_discount) || 0;
    const userTotalSpent = parseFloat(placement.total_spent || 0);

    // 2. Validate placement type
    if (placement.type !== 'link') {
      throw new Error('Only homepage links can be renewed');
    }

    // 3. Calculate renewal price
    // SPECIAL PRICING: If user owns the site, flat rate of $0.10
    const isOwnSite = placement.site_owner_id === userId;

    let finalRenewalPrice;
    let basePrice, baseRenewalDiscount, personalDiscount;

    if (isOwnSite) {
      // Owner's renewal price: flat rate
      finalRenewalPrice = PRICING.OWNER_RATE;
      basePrice = PRICING.OWNER_RATE;
      baseRenewalDiscount = 0;
      personalDiscount = 0;
      logger.info('Owner renewal pricing applied', { userId, placementId, price: finalRenewalPrice });
    } else {
      // Standard renewal pricing
      basePrice = PRICING.LINK_HOMEPAGE;
      baseRenewalDiscount = PRICING.BASE_RENEWAL_DISCOUNT;
      personalDiscount = userCurrentDiscount;

      // Apply both discounts sequentially
      const priceAfterBaseDiscount = basePrice * (1 - baseRenewalDiscount / 100);
      finalRenewalPrice = priceAfterBaseDiscount * (1 - personalDiscount / 100);
    }

    // 4. Check balance (using locked user data)
    if (userBalance < finalRenewalPrice) {
      throw new Error(`Insufficient balance for renewal. Required: $${finalRenewalPrice.toFixed(2)}, Available: $${userBalance.toFixed(2)}`);
    }

    // 5. Deduct from balance
    const newBalance = userBalance - finalRenewalPrice;
    const newTotalSpent = userTotalSpent + finalRenewalPrice;

    await client.query(
      'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
      [newBalance, newTotalSpent, userId]
    );

    // CRITICAL FIX (BUG #12): Recalculate discount tier after renewal
    // User may qualify for higher tier after total_spent increase from renewal
    const newTier = await calculateDiscountTier(newTotalSpent);
    // CRITICAL FIX: Compare with actual current_discount from locked user row, not personalDiscount
    // personalDiscount could be 0 for own-site renewals, but current_discount is the real value
    const currentUserDiscount = parseFloat(placement.current_discount) || 0;
    if (newTier.discount !== currentUserDiscount) {
      await client.query(
        'UPDATE users SET current_discount = $1 WHERE id = $2',
        [newTier.discount, userId]
      );

      logger.info('Discount tier upgraded after renewal', {
        userId,
        oldDiscount: currentUserDiscount,
        newDiscount: newTier.discount,
        newTier: newTier.tier,
        totalSpent: newTotalSpent
      });

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

    // CRITICAL: Clear cache after renewal so UI shows updated data
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    await cache.delPattern('wp:content:*');

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

    // Clear cache after toggle so UI shows updated data
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);

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
    const discount = parseFloat(user.current_discount) || 0;

    const linkPrice = PRICING.LINK_HOMEPAGE * (1 - discount / 100);
    const articlePrice = PRICING.ARTICLE_GUEST_POST * (1 - discount / 100);

    // Calculate renewal price
    const renewalPrice = PRICING.LINK_HOMEPAGE
      * (1 - PRICING.BASE_RENEWAL_DISCOUNT / 100)
      * (1 - discount / 100);

    const maxDiscount = Math.min(PRICING.MAX_TOTAL_DISCOUNT, PRICING.BASE_RENEWAL_DISCOUNT + discount);

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
      'SELECT id, balance, total_spent, current_discount FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const balanceBefore = parseFloat(user.balance);
    const balanceAfter = balanceBefore + finalPrice;

    // CRITICAL FIX (BUG #10): Decrement total_spent on refund to prevent discount tier exploitation
    const totalSpentBefore = parseFloat(user.total_spent || 0);
    const totalSpentAfter = Math.max(0, totalSpentBefore - finalPrice);

    // Refund the amount and decrement total_spent
    await client.query(
      'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
      [balanceAfter, totalSpentAfter, userId]
    );

    // CRITICAL FIX (BUG #11): Recalculate discount tier after refund
    const newTier = await calculateDiscountTier(totalSpentAfter);
    if (newTier.discount !== parseFloat(user.current_discount)) {
      await client.query(
        'UPDATE users SET current_discount = $1 WHERE id = $2',
        [newTier.discount, userId]
      );

      logger.info('Discount tier changed after refundPlacement', {
        userId,
        oldDiscount: parseFloat(user.current_discount),
        newDiscount: newTier.discount,
        newTier: newTier.tier,
        totalSpentAfter
      });
    }

    // Create refund transaction
    const transactionResult = await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after,
        description, placement_id
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
 * Reusable refund logic for placements within an existing transaction
 * Used by both direct placement deletion and site deletion
 *
 * @param {object} client - PostgreSQL client with active transaction
 * @param {object} placement - Placement object with all fields
 * @returns {object} Refund result { refunded: boolean, amount: number, newBalance: number, tierChanged: boolean, newTier: string }
 */
const refundPlacementInTransaction = async (client, placement) => {
  const finalPrice = parseFloat(placement.final_price || 0);

  // No refund needed for free placements
  if (finalPrice <= 0) {
    return { refunded: false, amount: 0, tierChanged: false };
  }

  // Get placement owner with lock
  const userResult = await client.query(
    'SELECT id, balance, total_spent, current_discount FROM users WHERE id = $1 FOR UPDATE',
    [placement.user_id]
  );

  if (userResult.rows.length === 0) {
    throw new Error('Placement owner not found');
  }

  const user = userResult.rows[0];
  const balanceBefore = parseFloat(user.balance);
  const balanceAfter = balanceBefore + finalPrice;

  // Decrement total_spent to prevent discount tier exploitation
  const totalSpentBefore = parseFloat(user.total_spent || 0);
  const totalSpentAfter = Math.max(0, totalSpentBefore - finalPrice);

  // Refund money and decrement total_spent
  await client.query(
    'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
    [balanceAfter, totalSpentAfter, placement.user_id]
  );

  // Recalculate discount tier after refund
  let tierChanged = false;
  let newTierName = null;
  const newTier = await calculateDiscountTier(totalSpentAfter);

  if (newTier.discount !== parseFloat(user.current_discount)) {
    await client.query(
      'UPDATE users SET current_discount = $1 WHERE id = $2',
      [newTier.discount, placement.user_id]
    );

    tierChanged = true;
    newTierName = newTier.tier;

    logger.info('Discount tier downgraded after refund', {
      userId: placement.user_id,
      oldDiscount: parseFloat(user.current_discount),
      newDiscount: newTier.discount,
      newTier: newTier.tier,
      totalSpentAfter
    });

    // Notify placement owner about tier downgrade
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'discount_tier_changed', $2, $3)
    `, [
      placement.user_id,
      'Изменение уровня скидки',
      `Ваш уровень скидки изменён на "${newTier.tier}" (${newTier.discount}%) после возврата средств.`
    ]);
  }

  // Create refund transaction
  await client.query(`
    INSERT INTO transactions (
      user_id, type, amount, balance_before, balance_after,
      description, placement_id
    ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
  `, [
    placement.user_id,
    finalPrice,
    balanceBefore,
    balanceAfter,
    `Refund for ${placement.type} placement on ${placement.site_name || 'site'} (${placement.project_name || 'project'})`,
    placement.id
  ]);

  logger.info('Refund processed within transaction', {
    placementId: placement.id,
    userId: placement.user_id,
    refundAmount: finalPrice,
    newBalance: balanceAfter,
    tierChanged,
    newTier: newTierName
  });

  return {
    refunded: true,
    amount: finalPrice,
    newBalance: balanceAfter,
    tierChanged,
    newTier: newTierName,
    oldDiscount: parseFloat(user.current_discount),
    newDiscount: newTier.discount
  };
};

/**
 * Restore usage counts for links and articles after placement refund
 * Used by both direct placement deletion and site deletion
 *
 * @param {object} client - PostgreSQL client with active transaction
 * @param {number} placementId - ID of placement being refunded
 * @returns {object} Counts of restored items { linkCount: number, articleCount: number }
 */
const restoreUsageCountsInTransaction = async (client, placementId) => {
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

  // Decrement usage_count for links (batch UPDATE - 1 query instead of N)
  if (link_ids && link_ids.length > 0) {
    await client.query(`
      UPDATE project_links
      SET usage_count = GREATEST(0, usage_count - 1),
          status = CASE
            WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
            ELSE status
          END
      WHERE id = ANY($1::int[])
    `, [link_ids]);
  }

  // Decrement usage_count for articles (batch UPDATE - 1 query instead of N)
  if (article_ids && article_ids.length > 0) {
    await client.query(`
      UPDATE project_articles
      SET usage_count = GREATEST(0, usage_count - 1),
          status = CASE
            WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
            ELSE status
          END
      WHERE id = ANY($1::int[])
    `, [article_ids]);
  }

  return {
    linkCount: parseInt(link_count) || 0,
    articleCount: parseInt(article_count) || 0
  };
};

/**
 * CRITICAL FIX: Atomic delete with refund (single transaction)
 * Prevents race conditions and ensures money safety
 *
 * @param {number} placementId - ID of placement to delete
 * @param {number} userId - ID of user requesting deletion (for refund target)
 * @param {string} userRole - Role of user ('admin' or 'user')
 *
 * ADMIN-ONLY: Only administrators can delete placements
 * - Admins can delete ANY placement (no ownership check)
 * - Refund always goes to the placement owner, not the admin
 */
const deleteAndRefundPlacement = async (placementId, userId, userRole = 'user') => {
  const client = await pool.connect();
  const placementService = require('./placement.service');

  try {
    await client.query('BEGIN');

    // 1. Get placement with lock
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

    // 2. ADMIN-ONLY: Verify authorization
    // Only admins can delete placements (enforced by adminMiddleware at route level)
    // This is a safety check in case service is called directly
    if (userRole !== 'admin') {
      await client.query('ROLLBACK');
      throw new Error('Unauthorized: Only administrators can delete placements');
    }

    // Note: Refund will go to placement.user_id (the owner), not the admin who deleted it
    const refundUserId = placement.user_id;

    // 3. Process refund if paid
    let refundResult = { refunded: false, amount: 0 };
    const finalPrice = parseFloat(placement.final_price || 0);

    if (finalPrice > 0) {
      // Get placement owner (refund recipient) with lock
      const userResult = await client.query(
        'SELECT id, balance, total_spent, current_discount FROM users WHERE id = $1 FOR UPDATE',
        [refundUserId]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Placement owner not found');
      }

      const user = userResult.rows[0];
      const balanceBefore = parseFloat(user.balance);
      const balanceAfter = balanceBefore + finalPrice;

      // CRITICAL FIX (BUG #10): Decrement total_spent on refund to prevent discount tier exploitation
      // Scenario: User buys $500 → gets 10% discount → deletes all → without this fix keeps 10% discount
      const totalSpentBefore = parseFloat(user.total_spent || 0);
      const totalSpentAfter = Math.max(0, totalSpentBefore - finalPrice);

      // Refund money and decrement total_spent
      await client.query(
        'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
        [balanceAfter, totalSpentAfter, refundUserId]
      );

      // CRITICAL FIX (BUG #11): Recalculate discount tier after refund
      // User may no longer qualify for their current tier after total_spent decrease
      const newTier = await calculateDiscountTier(totalSpentAfter);
      if (newTier.discount !== parseFloat(user.current_discount)) {
        await client.query(
          'UPDATE users SET current_discount = $1 WHERE id = $2',
          [newTier.discount, refundUserId]
        );

        logger.info('Discount tier downgraded after refund', {
          userId: refundUserId,
          oldDiscount: parseFloat(user.current_discount),
          newDiscount: newTier.discount,
          newTier: newTier.tier,
          totalSpentAfter
        });

        // Notify placement owner about tier downgrade
        await client.query(`
          INSERT INTO notifications (user_id, type, title, message)
          VALUES ($1, 'discount_tier_changed', $2, $3)
        `, [
          refundUserId,
          'Изменение уровня скидки',
          `Ваш уровень скидки изменён на "${newTier.tier}" (${newTier.discount}%) после возврата средств.`
        ]);
      }

      // Create refund transaction (for placement owner)
      await client.query(`
        INSERT INTO transactions (
          user_id, type, amount, balance_before, balance_after,
          description, placement_id
        ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
      `, [
        refundUserId,
        finalPrice,
        balanceBefore,
        balanceAfter,
        `Refund for ${placement.type} placement on ${placement.site_name} (${placement.project_name})`,
        placementId
      ]);

      // Audit log for refund (for placement owner)
      await client.query(`
        INSERT INTO audit_log (
          user_id, action, details
        ) VALUES ($1, 'placement_refund', $2)
      `, [
        refundUserId,
        JSON.stringify({
          entity_type: 'placement',
          entity_id: placementId,
          refund_amount: finalPrice,
          original_price: placement.original_price,
          discount_applied: placement.discount_applied,
          site_name: placement.site_name,
          project_name: placement.project_name,
          type: placement.type,
          deleted_by_admin: userId // Track which admin deleted it
        })
      ]);

      refundResult = {
        refunded: true,
        amount: finalPrice,
        newBalance: balanceAfter
      };

      logger.info('Refund processed within delete transaction', {
        placementId,
        ownerId: refundUserId,
        adminId: userId,
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

    // Decrement usage_count for links (batch UPDATE - 1 query instead of N)
    if (link_ids && link_ids.length > 0) {
      await client.query(`
        UPDATE project_links
        SET usage_count = GREATEST(0, usage_count - 1),
            status = CASE
              WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
              ELSE status
            END
        WHERE id = ANY($1::int[])
      `, [link_ids]);
    }

    // Decrement usage_count for articles (batch UPDATE - 1 query instead of N)
    if (article_ids && article_ids.length > 0) {
      await client.query(`
        UPDATE project_articles
        SET usage_count = GREATEST(0, usage_count - 1),
            status = CASE
              WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
              ELSE status
            END
        WHERE id = ANY($1::int[])
      `, [article_ids]);
    }

    // 5. Audit log for deletion (track admin who deleted)
    await client.query(`
      INSERT INTO audit_log (
        user_id, action, details
      ) VALUES ($1, 'placement_delete', $2)
    `, [
      userId, // Admin who performed the deletion
      JSON.stringify({
        entity_type: 'placement',
        entity_id: placementId,
        placement_owner_id: refundUserId,
        placement_type: placement.type,
        site_name: placement.site_name,
        project_name: placement.project_name,
        refunded: refundResult.refunded,
        refund_amount: refundResult.amount
      })
    ]);

    // 6. COMMIT everything atomically
    await client.query('COMMIT');

    // Clear cache for both placement owner and admin
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${refundUserId}:*`); // Owner's cache
    await cache.delPattern(`projects:user:${refundUserId}:*`); // Owner's cache
    await cache.delPattern(`wp:content:*`);

    logger.info('Placement deleted atomically with refund by admin', {
      placementId,
      ownerId: refundUserId,
      adminId: userId,
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
      adminId: userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Batch purchase placements (parallel processing)
 * OPTIMIZATION: Process multiple purchases in parallel for 5-10x speed improvement
 *
 * @param {number} userId - User making the purchases
 * @param {Array} purchases - Array of purchase objects: { projectId, siteId, type, contentIds, scheduledDate }
 * @returns {Object} - { successful: number, failed: number, results: Array, errors: Array }
 */
const batchPurchasePlacements = async (userId, purchases) => {
  const startTime = Date.now();

  logger.info('Starting batch purchase', {
    userId,
    totalPurchases: purchases.length
  });

  // Process in chunks to avoid exhausting DB connection pool
  // Pool has 25 connections, each purchase uses 1 connection, so process 15 at a time
  const CONCURRENCY_LIMIT = 15;
  const successful = [];
  const failed = [];
  let lastBalance = null;

  for (let i = 0; i < purchases.length; i += CONCURRENCY_LIMIT) {
    const chunk = purchases.slice(i, i + CONCURRENCY_LIMIT);

    const chunkResults = await Promise.allSettled(
      chunk.map(async (purchase) => {
        try {
          const result = await purchasePlacement({
            userId,
            projectId: purchase.projectId,
            siteId: purchase.siteId,
            type: purchase.type,
            contentIds: purchase.contentIds,
            scheduledDate: purchase.scheduledDate,
            autoRenewal: purchase.autoRenewal || false
          });

          return {
            siteId: purchase.siteId,
            success: true,
            placement: result.placement,
            newBalance: result.newBalance
          };
        } catch (error) {
          return {
            siteId: purchase.siteId,
            success: false,
            error: error.message
          };
        }
      })
    );

    // Aggregate chunk results
    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.success) {
          successful.push(data);
          lastBalance = data.newBalance;
        } else {
          failed.push({ siteId: data.siteId, error: data.error });
        }
      } else {
        failed.push({
          siteId: chunk[idx]?.siteId,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    // Log progress for long batches
    if (purchases.length > CONCURRENCY_LIMIT) {
      logger.info('Batch purchase progress', {
        userId,
        processed: Math.min(i + CONCURRENCY_LIMIT, purchases.length),
        total: purchases.length,
        successful: successful.length,
        failed: failed.length
      });
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Batch purchase completed', {
    userId,
    totalPurchases: purchases.length,
    successful: successful.length,
    failed: failed.length,
    durationMs: duration,
    avgTimePerPurchase: Math.round(duration / purchases.length)
  });

  // NOTIFICATION: Create grouped notification for batch purchase (if more than 1 successful)
  if (successful.length > 1) {
    try {
      // Get project names for the notification
      const projectIds = [...new Set(purchases.map(p => p.projectId))];
      const projectResult = await query(`
        SELECT id, name FROM projects WHERE id = ANY($1::int[])
      `, [projectIds]);
      const projectNames = projectResult.rows.map(p => p.name).join(', ');

      // Calculate total spent
      const totalSpent = successful.reduce((sum, r) => {
        const placement = r.placement;
        return sum + (parseFloat(placement?.final_price) || 0);
      }, 0);

      // Get user info for admin notification
      const userResult = await query('SELECT username FROM users WHERE id = $1', [userId]);
      const username = userResult.rows[0]?.username || 'Unknown';

      // User notification (grouped)
      await query(`
        INSERT INTO notifications (user_id, type, title, message, metadata)
        VALUES ($1, 'batch_placement_purchased', $2, $3, $4)
      `, [
        userId,
        'Массовая покупка',
        `Куплено ${successful.length} размещений для проекта "${projectNames}". Списано $${totalSpent.toFixed(2)}.`,
        JSON.stringify({ count: successful.length, projectIds, totalSpent })
      ]);

      // Admin notification (grouped) - exclude buyer to avoid duplicates
      await query(`
        INSERT INTO notifications (user_id, type, title, message, metadata)
        SELECT id, 'admin_batch_purchased', $1, $2, $3
        FROM users WHERE role = 'admin' AND id != $4
      `, [
        'Массовая покупка',
        `Пользователь "${username}" купил ${successful.length} размещений за $${totalSpent.toFixed(2)}.`,
        JSON.stringify({ userId, username, count: successful.length, projectIds, totalSpent }),
        userId
      ]);
    } catch (notifyError) {
      logger.error('Failed to create batch purchase notification', { userId, error: notifyError.message });
      // Don't throw - notifications are not critical
    }
  }

  // Clear cache after batch
  await cache.delPattern(`placements:user:${userId}:*`);
  await cache.delPattern(`projects:user:${userId}:*`);
  await cache.delPattern('wp:content:*');

  return {
    successful: successful.length,
    failed: failed.length,
    results: successful,
    errors: failed,
    finalBalance: lastBalance,
    durationMs: duration
  };
};

/**
 * Batch delete placements with refund (parallel processing)
 * OPTIMIZATION: Process multiple deletes in parallel for 5-10x speed improvement
 * ADMIN ONLY: Only administrators can delete placements
 *
 * @param {number} userId - Admin user making the deletions
 * @param {string} userRole - User role (must be 'admin')
 * @param {Array} placementIds - Array of placement IDs to delete
 * @returns {Object} - { successful: number, failed: number, totalRefunded: number, results: Array, errors: Array }
 */
const batchDeletePlacements = async (userId, userRole, placementIds) => {
  const startTime = Date.now();

  logger.info('Starting batch delete', {
    userId,
    userRole,
    totalPlacements: placementIds.length
  });

  // Process in chunks to avoid exhausting DB connection pool
  const CONCURRENCY_LIMIT = 15;
  const successful = [];
  const failed = [];
  let totalRefunded = 0;
  let lastBalance = null;

  for (let i = 0; i < placementIds.length; i += CONCURRENCY_LIMIT) {
    const chunk = placementIds.slice(i, i + CONCURRENCY_LIMIT);

    const chunkResults = await Promise.allSettled(
      chunk.map(async (placementId) => {
        try {
          const result = await deleteAndRefundPlacement(placementId, userId, userRole);
          return {
            placementId,
            success: true,
            refunded: result.refunded,
            amount: result.amount || 0,
            newBalance: result.newBalance
          };
        } catch (error) {
          return {
            placementId,
            success: false,
            error: error.message
          };
        }
      })
    );

    // Aggregate chunk results
    chunkResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.success) {
          successful.push(data);
          totalRefunded += data.amount || 0;
          lastBalance = data.newBalance;
        } else {
          failed.push({ placementId: data.placementId, error: data.error });
        }
      } else {
        failed.push({
          placementId: null,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    // Log progress for long batches
    if (placementIds.length > CONCURRENCY_LIMIT) {
      logger.info('Batch delete progress', {
        userId,
        processed: Math.min(i + CONCURRENCY_LIMIT, placementIds.length),
        total: placementIds.length,
        successful: successful.length,
        failed: failed.length
      });
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Batch delete completed', {
    userId,
    totalPlacements: placementIds.length,
    successful: successful.length,
    failed: failed.length,
    totalRefunded,
    durationMs: duration,
    avgTimePerDelete: Math.round(duration / placementIds.length)
  });

  // Clear cache after batch
  await cache.delPattern(`placements:user:*`);
  await cache.delPattern(`projects:user:*`);
  await cache.delPattern('wp:content:*');

  return {
    successful: successful.length,
    failed: failed.length,
    totalRefunded,
    results: successful,
    errors: failed,
    finalBalance: lastBalance,
    durationMs: duration
  };
};

module.exports = {
  PRICING,
  getUserBalance,
  calculateDiscountTier,
  getDiscountTiers,
  addBalance,
  purchasePlacement,
  batchPurchasePlacements,
  batchDeletePlacements,
  renewPlacement,
  toggleAutoRenewal,
  getUserTransactions,
  getPricingForUser,
  refundPlacement,
  deleteAndRefundPlacement,
  refundPlacementInTransaction,
  restoreUsageCountsInTransaction,
  publishScheduledPlacement,
  publishPlacementAsync
};
