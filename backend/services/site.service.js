/**
 * Site service
 * Handles site database operations
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');
const crypto = require('crypto');

// Get user sites with pagination and statistics
const getUserSites = async (userId, page = 0, limit = 0, recalculate = false) => {
  try {
    const usePagination = page > 0 && limit > 0;

    // Optionally recalculate statistics first (batch operation optimization)
    if (recalculate) {
      await recalculateSiteStats(userId);
    }

    // Fetch sites data
    let sitesQuery =
      `SELECT s.id, s.user_id, s.site_name, s.site_url, s.api_key, s.site_type, s.max_links, s.max_articles, s.used_links, s.used_articles, s.allow_articles, s.is_public, s.available_for_purchase, s.price_link, s.price_article, s.dr, s.da, s.ref_domains, s.rd_main, s.norm, s.tf, s.cf, s.keywords, s.traffic, s.geo, s.limits_changed_at, s.moderation_status, s.rejection_reason, s.created_at,
      EXISTS(
        SELECT 1 FROM site_slot_rentals r
        WHERE r.site_id = s.id
        AND r.status = 'active'
        AND r.expires_at > NOW()
      ) AS has_active_rental
      FROM sites s WHERE s.user_id = $1 ORDER BY s.created_at DESC`;
    const queryParams = [userId];

    if (usePagination) {
      const offset = (page - 1) * limit;
      sitesQuery += ' LIMIT $2 OFFSET $3';
      queryParams.push(limit, offset);
    }

    const result = await query(sitesQuery, queryParams);

    // Calculate revenue for each site
    const sitesWithRevenue = await Promise.all(
      result.rows.map(async site => {
        const revenue = await calculateSiteRevenue(site.id, userId);
        return {
          ...site,
          revenue_365d: revenue
        };
      })
    );

    // If pagination is requested, return paginated format
    if (usePagination) {
      // Get total count
      const countResult = await query('SELECT COUNT(*) FROM sites s WHERE s.user_id = $1', [userId]);
      const total = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.ceil(total / limit);

      return {
        data: sitesWithRevenue,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        recalculated: recalculate
      };
    } else {
      // Return simple array for backward compatibility
      return sitesWithRevenue;
    }
  } catch (error) {
    logger.error('Get user sites error:', error);
    throw error;
  }
};

// Get marketplace sites (public sites + user's own sites + rented sites)
const getMarketplaceSites = async userId => {
  try {
    // Return sites that are either:
    // 1. Public (is_public = TRUE), OR
    // 2. Owned by the requesting user (user_id = userId), OR
    // 3. Rented by the requesting user (active rental exists)
    // Note: Don't expose api_key for sites user doesn't own
    const result = await query(
      `
      SELECT
        s.id, s.user_id, s.site_name, s.site_url, s.site_type,
        s.max_links, s.max_articles, s.used_links, s.used_articles,
        s.allow_articles, s.is_public, s.available_for_purchase, s.price_link, s.price_article, s.dr, s.da, s.ref_domains, s.rd_main, s.norm, s.tf, s.cf, s.keywords, s.traffic, s.geo, s.created_at,
        EXISTS(
          SELECT 1 FROM site_slot_rentals r
          WHERE r.site_id = s.id
          AND r.status = 'active'
          AND r.expires_at > NOW()
        ) AS has_active_rental,
        CASE
          WHEN s.user_id = $1 THEN s.api_key
          ELSE NULL
        END as api_key,
        -- Check if current user has active rental on this site
        EXISTS(
          SELECT 1 FROM site_slot_rentals r
          WHERE r.site_id = s.id
          AND r.tenant_id = $1
          AND r.status = 'active'
          AND r.expires_at > NOW()
        ) AS user_has_rental
      FROM sites s
      WHERE s.is_public = TRUE
         OR s.user_id = $1
         OR EXISTS(
           SELECT 1 FROM site_slot_rentals r
           WHERE r.site_id = s.id
           AND r.tenant_id = $1
           AND r.status = 'active'
           AND r.expires_at > NOW()
         )
      ORDER BY
        -- Rented sites first for the user
        EXISTS(
          SELECT 1 FROM site_slot_rentals r
          WHERE r.site_id = s.id
          AND r.tenant_id = $1
          AND r.status = 'active'
          AND r.expires_at > NOW()
        ) DESC,
        s.created_at DESC
    `,
      [userId]
    );

    logger.info('Marketplace sites retrieved', {
      userId,
      totalSites: result.rows.length,
      publicSites: result.rows.filter(s => s.is_public).length,
      ownedSites: result.rows.filter(s => s.user_id === userId).length,
      rentedSites: result.rows.filter(s => s.user_has_rental).length
    });

    return result.rows;
  } catch (error) {
    logger.error('Get marketplace sites error:', error);
    throw error;
  }
};

// Create new site
// userRole parameter is optional - if 'admin', site gets auto-approved
const createSite = async (data, userRole = null) => {
  try {
    const {
      site_url,
      api_key,
      max_links,
      max_articles,
      userId,
      site_type,
      allow_articles,
      is_public,
      available_for_purchase,
      price_link,
      price_article
    } = data;

    // SECURITY: Validate URL format
    if (!site_url) {
      throw new Error('Site URL is required');
    }

    try {
      const parsedUrl = new URL(site_url);
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS protocols are allowed');
      }
      // Check for valid hostname
      if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
        throw new Error('Invalid hostname in URL');
      }
    } catch (urlError) {
      if (urlError.message.includes('Invalid URL')) {
        throw new Error('Invalid site URL format. Must be a valid HTTP or HTTPS URL.');
      }
      throw urlError;
    }

    // Determine site type (default: wordpress)
    const finalSiteType = site_type || 'wordpress';

    // Validate site_type
    if (!['wordpress', 'static_php'].includes(finalSiteType)) {
      throw new Error('Invalid site_type. Must be wordpress or static_php');
    }

    // Both site types now use API key authentication
    let finalApiKey = api_key;
    let finalMaxArticles = max_articles;
    let finalAllowArticles = allow_articles;

    if (finalSiteType === 'static_php') {
      // Static PHP sites: generate API key if not provided
      finalApiKey = api_key || `api_${crypto.randomBytes(12).toString('hex')}`;
      // Static PHP sites only support links, not articles
      finalMaxArticles = 0;
      finalAllowArticles = false; // Force to false for static sites
    } else {
      // WordPress sites: generate API key if not provided
      finalApiKey = api_key || `api_${crypto.randomBytes(12).toString('hex')}`;
      finalMaxArticles = max_articles || 30;
      // Default to true if not specified for WordPress
      finalAllowArticles = allow_articles !== undefined ? allow_articles : true;
    }

    const site_name = site_url;
    // Site always starts as private (is_public = false)
    // User must explicitly request public sale to trigger moderation
    const finalIsPublic = false;
    const finalAvailableForPurchase =
      available_for_purchase !== undefined ? available_for_purchase : true; // Default to available

    // All sites start without moderation status (NULL = private)
    // moderation_status will be set to 'pending' when user requests public sale
    const result = await query(
      'INSERT INTO sites (site_url, site_name, api_key, site_type, user_id, max_links, max_articles, used_links, used_articles, allow_articles, is_public, available_for_purchase, price_link, price_article) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [
        site_url,
        site_name,
        finalApiKey,
        finalSiteType,
        userId,
        max_links || 10,
        finalMaxArticles,
        0,
        0,
        finalAllowArticles,
        finalIsPublic,
        finalAvailableForPurchase,
        price_link !== undefined ? price_link : null,
        price_article !== undefined ? price_article : null
      ]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Create site error:', error);
    throw error;
  }
};

// Update site
// userRole parameter is optional - if provided, admins bypass cooldown
const updateSite = async (siteId, userId, data, userRole = null) => {
  try {
    const {
      site_url,
      site_name,
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      is_public,
      available_for_purchase,
      price_link,
      price_article
    } = data;

    // 6-month cooldown check for non-admin users changing max_links/max_articles
    const isAdmin = userRole === 'admin';
    const COOLDOWN_MONTHS = 6;

    if (!isAdmin && (max_links !== undefined || max_articles !== undefined)) {
      // Get current site data including limits_changed_at
      const currentSiteResult = await query(
        'SELECT max_links, max_articles, limits_changed_at FROM sites WHERE id = $1 AND user_id = $2',
        [siteId, userId]
      );

      if (currentSiteResult.rows.length > 0) {
        const currentSite = currentSiteResult.rows[0];
        const currentMaxLinks = currentSite.max_links;
        const currentMaxArticles = currentSite.max_articles;
        const limitsChangedAt = currentSite.limits_changed_at;

        // Check if user is actually changing the values (not just sending same values)
        const isChangingLinks = max_links !== undefined && max_links !== currentMaxLinks;
        const isChangingArticles = max_articles !== undefined && max_articles !== currentMaxArticles;

        if (isChangingLinks || isChangingArticles) {
          // Check if there's a cooldown active
          if (limitsChangedAt) {
            const cooldownEnd = new Date(limitsChangedAt);
            cooldownEnd.setMonth(cooldownEnd.getMonth() + COOLDOWN_MONTHS);

            if (new Date() < cooldownEnd) {
              const daysLeft = Math.ceil((cooldownEnd - new Date()) / (1000 * 60 * 60 * 24));
              throw new Error(
                `Вы можете изменить лимиты Links/Articles только через ${daysLeft} дн. (раз в ${COOLDOWN_MONTHS} месяцев). ` +
                `Дата следующего разрешённого изменения: ${cooldownEnd.toLocaleDateString('ru-RU')}`
              );
            }
          }
        }
      }
    }

    // SECURITY: Validate URL format if provided
    if (site_url) {
      try {
        const parsedUrl = new URL(site_url);
        // Only allow HTTP and HTTPS protocols
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Only HTTP and HTTPS protocols are allowed');
        }
        // Check for valid hostname
        if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
          throw new Error('Invalid hostname in URL');
        }
      } catch (urlError) {
        if (urlError.message.includes('Invalid URL')) {
          throw new Error('Invalid site URL format. Must be a valid HTTP or HTTPS URL.');
        }
        throw urlError;
      }
    }

    // Validate site_type if provided
    if (site_type && !['wordpress', 'static_php'].includes(site_type)) {
      throw new Error('Invalid site_type. Must be wordpress or static_php');
    }

    // For static_php sites, force max_articles to 0 and allow_articles to false
    let finalMaxArticles = max_articles;
    let finalAllowArticles = allow_articles;

    if (site_type === 'static_php') {
      finalMaxArticles = 0;
      finalAllowArticles = false;
    }

    // Check if non-admin user is trying to enable is_public
    // Only allow if site has been approved for public sale
    if (is_public === true && !isAdmin) {
      const checkModerationResult = await query(
        'SELECT moderation_status FROM sites WHERE id = $1 AND user_id = $2',
        [siteId, userId]
      );

      if (checkModerationResult.rows.length > 0) {
        const currentModerationStatus = checkModerationResult.rows[0].moderation_status;
        if (currentModerationStatus !== 'approved') {
          throw new Error(
            'Для публикации сайта необходимо пройти модерацию. ' +
              'Нажмите кнопку "На продажу" чтобы отправить сайт на проверку.'
          );
        }
      }
    }

    // Check if we need to update limits_changed_at (only for non-admin users changing limits)
    let shouldUpdateLimitsTimestamp = false;
    if (!isAdmin && (max_links !== undefined || max_articles !== undefined)) {
      // Re-check if values are actually changing
      const checkResult = await query(
        'SELECT max_links, max_articles FROM sites WHERE id = $1 AND user_id = $2',
        [siteId, userId]
      );
      if (checkResult.rows.length > 0) {
        const current = checkResult.rows[0];
        const isChangingLinks = max_links !== undefined && max_links !== current.max_links;
        const isChangingArticles = finalMaxArticles !== undefined && finalMaxArticles !== current.max_articles;
        shouldUpdateLimitsTimestamp = isChangingLinks || isChangingArticles;
      }
    }

    const result = await query(
      `UPDATE sites
       SET site_url = COALESCE($1, site_url),
           site_name = COALESCE($2, site_name),
           api_key = COALESCE($3, api_key),
           max_links = COALESCE($4, max_links),
           max_articles = COALESCE($5, max_articles),
           site_type = COALESCE($6, site_type),
           allow_articles = COALESCE($7, allow_articles),
           is_public = COALESCE($8, is_public),
           available_for_purchase = COALESCE($9, available_for_purchase),
           price_link = COALESCE($10, price_link),
           price_article = COALESCE($11, price_article),
           limits_changed_at = CASE WHEN $14 THEN CURRENT_TIMESTAMP ELSE limits_changed_at END
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [
        site_url,
        site_name,
        api_key,
        max_links,
        finalMaxArticles,
        site_type,
        finalAllowArticles,
        is_public,
        available_for_purchase,
        price_link,
        price_article,
        siteId,
        userId,
        shouldUpdateLimitsTimestamp
      ]
    );

    // Clear cache after site update so UI shows changes immediately
    if (result.rows.length > 0) {
      const cache = require('./cache.service');
      await cache.delPattern(`placements:user:${userId}:*`);
      // Targeted cache invalidation - only this site
      const updatedSite = result.rows[0];
      if (updatedSite.api_key) {
        await cache.del(`wp:content:${updatedSite.api_key}`);
      }
    }

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Update site error:', error);
    throw error;
  }
};

// Delete site with automatic refunds for all placements
const deleteSite = async (siteId, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock site with FOR UPDATE
    const siteResult = await client.query(
      'SELECT * FROM sites WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [siteId, userId]
    );

    if (siteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        deleted: false,
        error: 'Site not found or access denied'
      };
    }

    const site = siteResult.rows[0];

    // 1.5. Check for ACTIVE placements (status='placed' AND expires_at > NOW())
    // Cannot delete site if there are active placements - buyers' links must be protected
    const activePlacementsResult = await client.query(
      `
      SELECT COUNT(*) as count
      FROM placements
      WHERE site_id = $1
        AND status = 'placed'
        AND expires_at > NOW()
    `,
      [siteId]
    );

    const activeCount = parseInt(activePlacementsResult.rows[0].count, 10);
    if (activeCount > 0) {
      await client.query('ROLLBACK');
      logger.info('Site deletion blocked due to active placements', {
        siteId,
        userId,
        activeCount
      });
      return {
        deleted: false,
        reason: 'active_placements',
        activeCount,
        error: `Невозможно удалить сайт: ${activeCount} активных размещений. Дождитесь истечения срока или обратитесь к администратору.`
      };
    }

    // 2. Get all placements for this site with financial data
    const placementsResult = await client.query(
      `
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
        s.api_key,
        s.site_url,
        s.site_type,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.site_id = $1
      ORDER BY p.id
    `,
      [siteId]
    );

    const placements = placementsResult.rows;

    // 2.5. Delete WordPress posts (for article placements on WordPress sites)
    // Do this BEFORE refunds, but don't fail the entire deletion if WordPress is down
    const wordpressService = require('./wordpress.service');
    let wpPostsDeleted = 0;
    const wpDeletionErrors = [];

    if (site.site_type === 'wordpress' && site.api_key) {
      for (const placement of placements) {
        if (placement.type === 'article' && placement.wordpress_post_id) {
          try {
            const result = await wordpressService.deleteArticle(
              site.site_url,
              site.api_key,
              placement.wordpress_post_id
            );

            if (result.success) {
              wpPostsDeleted++;
              logger.info('WordPress post deleted during site deletion', {
                siteId,
                placementId: placement.id,
                wordpressPostId: placement.wordpress_post_id
              });
            } else {
              wpDeletionErrors.push({
                placementId: placement.id,
                postId: placement.wordpress_post_id,
                error: result.error
              });
            }
          } catch (error) {
            // Log error but continue with deletion
            wpDeletionErrors.push({
              placementId: placement.id,
              postId: placement.wordpress_post_id,
              error: error.message
            });
            logger.warn('Failed to delete WordPress post, continuing with site deletion', {
              siteId,
              placementId: placement.id,
              error: error.message
            });
          }
        }
      }
    }

    // 3. Process refunds for each paid placement
    const billingService = require('./billing.service');
    const refundResults = [];
    let totalRefunded = 0;
    let refundedCount = 0;
    let tierChanged = false;
    let newTierName = null;

    for (const placement of placements) {
      const finalPrice = parseFloat(placement.final_price || 0);

      if (finalPrice > 0) {
        // Refund this placement using reusable function
        const refundResult = await billingService.refundPlacementInTransaction(client, placement);

        if (refundResult.refunded) {
          totalRefunded += refundResult.amount;
          refundedCount++;

          if (refundResult.tierChanged) {
            tierChanged = true;
            newTierName = refundResult.newTier;
          }

          refundResults.push({
            placementId: placement.id,
            amount: refundResult.amount,
            type: placement.type
          });
        }

        // Restore usage counts for this placement
        await billingService.restoreUsageCountsInTransaction(client, placement.id);
      }
    }

    // 4. Update site quotas (will be zero since all placements deleted)
    // CASCADE will handle placement deletion, but we need to update quotas first
    await client.query(
      `
      UPDATE sites
      SET used_links = 0, used_articles = 0
      WHERE id = $1
    `,
      [siteId]
    );

    // 5. Delete site (CASCADE will delete all placements and placement_content)
    await client.query('DELETE FROM sites WHERE id = $1 AND user_id = $2', [siteId, userId]);

    // 6. Create audit log entry
    await client.query(
      `
      INSERT INTO audit_log (
        user_id, action, details
      ) VALUES ($1, $2, $3)
    `,
      [
        userId,
        'site_delete',
        JSON.stringify({
          site_id: siteId,
          site_name: site.site_name,
          site_url: site.site_url,
          site_type: site.site_type,
          placements_count: placements.length,
          refunded_count: refundedCount,
          total_refunded: totalRefunded,
          tier_changed: tierChanged,
          new_tier: newTierName,
          wordpress_posts_deleted: wpPostsDeleted,
          wordpress_deletion_errors: wpDeletionErrors.length
        })
      ]
    );

    // 7. COMMIT transaction
    await client.query('COMMIT');

    // 8. Clear cache
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    // Targeted cache invalidation - only this site (before deletion, site variable still has api_key)
    if (site.api_key) {
      await cache.del(`wp:content:${site.api_key}`);
    }

    logger.info('Site deleted with automatic refunds', {
      siteId,
      userId,
      siteName: site.site_name,
      placementsCount: placements.length,
      refundedCount,
      totalRefunded,
      tierChanged,
      newTier: newTierName,
      wpPostsDeleted,
      wpDeletionErrorsCount: wpDeletionErrors.length
    });

    return {
      deleted: true,
      placementsCount: placements.length,
      refundedCount,
      totalRefunded,
      tierChanged,
      newTier: newTierName,
      refundDetails: refundResults,
      wordpressPostsDeleted: wpPostsDeleted,
      wordpressDeletionErrors: wpDeletionErrors
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete site with refunds failed - transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Recalculate site statistics
const recalculateSiteStats = async userId => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Batch recalculate all user's sites in single query with explicit transaction
    await client.query(
      `
      WITH site_stats AS (
        SELECT
          s.id,
          COUNT(DISTINCT CASE WHEN pc.link_id IS NOT NULL THEN pc.id END) as link_count,
          COUNT(DISTINCT CASE WHEN pc.article_id IS NOT NULL THEN pc.id END) as article_count
        FROM sites s
        LEFT JOIN placements p ON s.id = p.site_id
        LEFT JOIN placement_content pc ON p.id = pc.placement_id
        WHERE s.user_id = $1
        GROUP BY s.id
      )
      UPDATE sites s
      SET
        used_links = COALESCE(ss.link_count, 0),
        used_articles = COALESCE(ss.article_count, 0)
      FROM site_stats ss
      WHERE s.id = ss.id AND s.user_id = $1
    `,
      [userId]
    );

    await client.query('COMMIT');
    logger.info('Site statistics recalculated successfully', { userId });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Site statistics recalculation failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get single site
const getSiteById = async (siteId, userId) => {
  try {
    const result = await query(
      'SELECT id, user_id, site_name, site_url, api_key, site_type, max_links, max_articles, used_links, used_articles, allow_articles, is_public, available_for_purchase, price_link, price_article, dr, da, ref_domains, rd_main, norm, tf, cf, keywords, traffic, geo, limits_changed_at, moderation_status, rejection_reason, created_at FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by ID error:', error);
    throw error;
  }
};

// Get site by domain (for static PHP widget)
const getSiteByDomain = async domain => {
  try {
    // Normalize domain: remove protocol, www, trailing slash, path
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');

    // Try to find site by exact domain match
    // Normalize site_url the same way: remove protocol, www, and path
    const result = await query(
      `SELECT id, user_id, site_name, site_url, site_type, max_links, max_articles, used_links, used_articles, allow_articles, dr, da, ref_domains, rd_main, norm, tf, cf, keywords, traffic, geo, created_at
       FROM sites
       WHERE LOWER(
         REGEXP_REPLACE(
           REGEXP_REPLACE(
             REGEXP_REPLACE(site_url, '^https?://', ''),
             '^www\\.', ''
           ),
           '/.*$', ''
         )
       ) = $1
       AND site_type = 'static_php'
       LIMIT 1`,
      [normalizedDomain]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by domain error:', error);
    throw error;
  }
};

// ============================================================================
// Registration Token Methods (for bulk WordPress site registration)
// ============================================================================

/**
 * Generate a new registration token for bulk site registration
 */
const generateRegistrationToken = async (userId, options = {}) => {
  try {
    const {
      label = 'Registration Token',
      max_uses = 0, // 0 = unlimited
      expires_at = null
    } = options;

    // Generate secure random token
    const token = 'reg_' + crypto.randomBytes(32).toString('hex');

    const result = await query(
      `INSERT INTO registration_tokens
       (user_id, token, label, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, token, label, max_uses, expires_at]
    );

    logger.info('Registration token generated', { userId, token: token.substring(0, 15) + '...' });
    return result.rows[0];
  } catch (error) {
    logger.error('Generate registration token error:', error);
    throw error;
  }
};

/**
 * Validate a registration token and return its details
 */
const validateRegistrationToken = async token => {
  try {
    const result = await query(
      `SELECT * FROM registration_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return null; // Token not found
    }

    const tokenData = result.rows[0];

    // Check if token has expired
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      logger.warn('Token expired', { token: token.substring(0, 15) + '...' });
      return null;
    }

    // Check if token has reached max uses
    if (tokenData.max_uses > 0 && tokenData.current_uses >= tokenData.max_uses) {
      logger.warn('Token max uses reached', { token: token.substring(0, 15) + '...' });
      return null;
    }

    return tokenData;
  } catch (error) {
    logger.error('Validate registration token error:', error);
    throw error;
  }
};

/**
 * Increment the usage count for a registration token
 */
const incrementTokenUsage = async token => {
  try {
    await query(
      `UPDATE registration_tokens
       SET current_uses = current_uses + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE token = $1`,
      [token]
    );

    logger.info('Token usage incremented', { token: token.substring(0, 15) + '...' });
  } catch (error) {
    logger.error('Increment token usage error:', error);
    throw error;
  }
};

/**
 * Get site by URL for a specific user (to check for duplicates)
 */
const getSiteByUrlForUser = async (siteUrl, userId) => {
  try {
    const result = await query(
      `SELECT * FROM sites
       WHERE site_url = $1 AND user_id = $2
       LIMIT 1`,
      [siteUrl, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by URL for user error:', error);
    throw error;
  }
};

/**
 * Get all registration tokens for a user
 */
const getUserTokens = async userId => {
  try {
    const result = await query(
      `SELECT id, token, label, max_uses, current_uses, expires_at, created_at
       FROM registration_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Get user tokens error:', error);
    throw error;
  }
};

/**
 * Delete a registration token (only owner can delete)
 */
const deleteToken = async (tokenId, userId) => {
  try {
    const result = await query(
      'DELETE FROM registration_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
      [tokenId, userId]
    );

    if (result.rowCount > 0) {
      logger.info('Registration token deleted', { tokenId, userId });
    }

    return result.rowCount > 0;
  } catch (error) {
    logger.error('Delete token error:', error);
    throw error;
  }
};

/**
 * Bulk update site parameters (DR, etc.)
 * Uses CASE statement instead of dynamic column names to prevent SQL injection
 * @param {string} parameter - Parameter name ('dr', etc.)
 * @param {Array} updates - Array of {domain, value} objects
 * @returns {Object} - Results with success/failure counts
 */
const bulkUpdateSiteParams = async (parameter, updates) => {
  // SECURITY: Strict whitelist - these are the ONLY columns that can be updated
  const allowedParams = [
    'dr',
    'da',
    'ref_domains',
    'rd_main',
    'norm',
    'tf',
    'cf',
    'keywords',
    'traffic',
    'geo'
  ];

  // SECURITY: Validate parameter against whitelist BEFORE any SQL
  if (!allowedParams.includes(parameter)) {
    throw new Error(
      `Parameter '${parameter}' is not allowed. Allowed: ${allowedParams.join(', ')}`
    );
  }

  // SECURITY: Build column-specific UPDATE queries to avoid dynamic column names in SQL
  // Each case uses a fixed, parameterized query - no string interpolation in SQL
  const getUpdateQuery = (param) => {
    const queries = {
      dr: 'UPDATE sites SET dr = $1 WHERE id = $2',
      da: 'UPDATE sites SET da = $1 WHERE id = $2',
      ref_domains: 'UPDATE sites SET ref_domains = $1 WHERE id = $2',
      rd_main: 'UPDATE sites SET rd_main = $1 WHERE id = $2',
      norm: 'UPDATE sites SET norm = $1 WHERE id = $2',
      tf: 'UPDATE sites SET tf = $1 WHERE id = $2',
      cf: 'UPDATE sites SET cf = $1 WHERE id = $2',
      keywords: 'UPDATE sites SET keywords = $1 WHERE id = $2',
      traffic: 'UPDATE sites SET traffic = $1 WHERE id = $2',
      geo: 'UPDATE sites SET geo = $1 WHERE id = $2'
    };
    return queries[param];
  };

  // SECURITY: Build column-specific SELECT queries
  const getSelectQuery = (param) => {
    const queries = {
      dr: `SELECT id, site_url, dr as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      da: `SELECT id, site_url, da as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      ref_domains: `SELECT id, site_url, ref_domains as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      rd_main: `SELECT id, site_url, rd_main as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      norm: `SELECT id, site_url, norm as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      tf: `SELECT id, site_url, tf as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      cf: `SELECT id, site_url, cf as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      keywords: `SELECT id, site_url, keywords as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      traffic: `SELECT id, site_url, traffic as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`,
      geo: `SELECT id, site_url, geo as old_value FROM sites WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(site_url, '^https?://', ''), '^www\\.', ''), '/.*$', '')) = $1 LIMIT 1`
    };
    return queries[param];
  };

  const updateQuery = getUpdateQuery(parameter);
  const selectQuery = getSelectQuery(parameter);

  const results = {
    total: updates.length,
    updated: 0,
    notFound: 0,
    errors: 0,
    details: []
  };

  for (const update of updates) {
    const { domain, value } = update;

    // Normalize domain
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();

    if (!normalizedDomain) {
      results.errors++;
      results.details.push({
        domain: domain,
        status: 'error',
        message: 'Empty domain'
      });
      continue;
    }

    try {
      // Find site by normalized URL using pre-built parameterized query
      const findResult = await query(selectQuery, [normalizedDomain]);

      if (findResult.rows.length === 0) {
        results.notFound++;
        results.details.push({
          domain: normalizedDomain,
          status: 'not_found',
          message: 'Site not found'
        });
        continue;
      }

      const site = findResult.rows[0];
      const oldValue = site.old_value;

      // Update the parameter using pre-built parameterized query
      await query(updateQuery, [value, site.id]);

      results.updated++;
      results.details.push({
        domain: normalizedDomain,
        siteUrl: site.site_url,
        status: 'updated',
        oldValue: oldValue,
        newValue: value
      });
    } catch (error) {
      results.errors++;
      results.details.push({
        domain: normalizedDomain,
        status: 'error',
        message: error.message
      });
      logger.error('Bulk update site param error:', {
        domain: normalizedDomain,
        error: error.message
      });
    }
  }

  logger.info('Bulk site params update completed', {
    parameter,
    total: results.total,
    updated: results.updated,
    notFound: results.notFound,
    errors: results.errors
  });

  return results;
};

/**
 * Get sites where a specific parameter is 0 or null
 * SECURITY: Uses hardcoded queries to prevent SQL injection (same pattern as bulkUpdateSiteParams)
 * @param {string} parameter - Parameter name ('dr', etc.)
 * @returns {Array} - Array of sites with zero/null value
 */
// ============================================================================
// Site Moderation Methods
// ============================================================================

/**
 * Request public sale approval for a site
 * Triggers moderation workflow - sets status to 'pending'
 * @param {number} siteId - Site ID
 * @param {number} userId - Owner user ID
 * @returns {Object} Updated site
 */
const requestPublicSale = async (siteId, userId) => {
  try {
    // Check ownership and get current site data
    const siteResult = await query(
      'SELECT * FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    if (siteResult.rows.length === 0) {
      throw new Error('Сайт не найден или доступ запрещён');
    }

    const site = siteResult.rows[0];

    // Already approved - user can toggle is_public freely
    if (site.moderation_status === 'approved') {
      throw new Error('Сайт уже одобрен для публичной продажи. Используйте переключатель публичности.');
    }

    // Already pending
    if (site.moderation_status === 'pending') {
      throw new Error('Сайт уже находится на модерации. Пожалуйста, ожидайте решения администратора.');
    }

    // Submit for moderation
    const result = await query(
      `UPDATE sites
       SET moderation_status = 'pending',
           rejection_reason = NULL
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [siteId, userId]
    );

    logger.info('Site submitted for public sale approval', {
      siteId,
      userId,
      siteName: site.site_name
    });

    // Create notification for all admins
    try {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         SELECT u.id, 'moderation_request', 'Новый сайт на модерацию',
                $1, $2
         FROM users u WHERE u.role = 'admin'`,
        [
          `Сайт "${site.site_name}" ожидает проверки для публичной продажи`,
          JSON.stringify({ site_id: siteId, site_url: site.site_url, owner_id: userId })
        ]
      );
    } catch (notifError) {
      // Don't fail the main operation if notification fails
      logger.warn('Failed to create admin notification for moderation request', { error: notifError.message });
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Request public sale error:', error);
    throw error;
  }
};

/**
 * Get sites pending moderation (for admin panel)
 */
const getSitesForModeration = async () => {
  try {
    const result = await query(
      `SELECT s.*, u.username as owner_username
       FROM sites s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.moderation_status = 'pending'
       ORDER BY s.created_at DESC`
    );
    return result.rows;
  } catch (error) {
    logger.error('Get sites for moderation error:', error);
    throw error;
  }
};

/**
 * Approve site for public marketplace
 * Sets is_public = true automatically and notifies owner
 * @param {number} siteId - Site ID
 * @param {number} adminId - Admin user ID (for audit)
 * @returns {Object} Updated site
 */
const approveSite = async (siteId, adminId = null) => {
  try {
    const result = await query(
      `UPDATE sites
       SET moderation_status = 'approved',
           is_public = true,
           rejection_reason = NULL
       WHERE id = $1
       RETURNING *`,
      [siteId]
    );

    if (result.rows.length > 0) {
      const site = result.rows[0];
      logger.info('Site approved for public sale', { siteId, adminId, siteName: site.site_name });

      // Notify site owner
      try {
        await query(
          `INSERT INTO notifications (user_id, type, title, message, metadata)
           VALUES ($1, 'site_approved', 'Сайт одобрен!', $2, $3)`,
          [
            site.user_id,
            `Ваш сайт "${site.site_name}" одобрен для публичной продажи и уже доступен покупателям.`,
            JSON.stringify({ site_id: siteId, site_url: site.site_url })
          ]
        );
      } catch (notifError) {
        logger.warn('Failed to create owner notification for site approval', { error: notifError.message });
      }
    }

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Approve site error:', error);
    throw error;
  }
};

/**
 * Reject site from public marketplace
 * Notifies owner with rejection reason
 * @param {number} siteId - Site ID
 * @param {string} reason - Rejection reason
 * @param {number} adminId - Admin user ID (for audit)
 * @returns {Object} Updated site
 */
const rejectSite = async (siteId, reason = null, adminId = null) => {
  try {
    const result = await query(
      `UPDATE sites
       SET moderation_status = 'rejected',
           is_public = false,
           rejection_reason = $2
       WHERE id = $1
       RETURNING *`,
      [siteId, reason]
    );

    if (result.rows.length > 0) {
      const site = result.rows[0];
      logger.info('Site rejected from public sale', { siteId, adminId, siteName: site.site_name, reason });

      // Notify site owner
      try {
        const reasonText = reason ? ` Причина: ${reason}` : ' Причина не указана.';
        await query(
          `INSERT INTO notifications (user_id, type, title, message, metadata)
           VALUES ($1, 'site_rejected', 'Сайт отклонён', $2, $3)`,
          [
            site.user_id,
            `Ваш сайт "${site.site_name}" отклонён для публичной продажи.${reasonText} Вы можете исправить замечания и подать повторную заявку.`,
            JSON.stringify({ site_id: siteId, site_url: site.site_url, reason })
          ]
        );
      } catch (notifError) {
        logger.warn('Failed to create owner notification for site rejection', { error: notifError.message });
      }
    }

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Reject site error:', error);
    throw error;
  }
};

/**
 * Get moderation statistics
 */
const getModerationStats = async () => {
  try {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE moderation_status = 'pending') as pending_count,
         COUNT(*) FILTER (WHERE moderation_status = 'approved') as approved_count,
         COUNT(*) FILTER (WHERE moderation_status = 'rejected') as rejected_count
       FROM sites`
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Get moderation stats error:', error);
    throw error;
  }
};

const getSitesWithZeroParam = async parameter => {
  const allowedParams = [
    'dr',
    'da',
    'ref_domains',
    'rd_main',
    'norm',
    'tf',
    'cf',
    'keywords',
    'traffic',
    'geo'
  ]; // Whitelist of allowed parameters

  if (!allowedParams.includes(parameter)) {
    throw new Error(
      `Parameter '${parameter}' is not allowed. Allowed: ${allowedParams.join(', ')}`
    );
  }

  // SECURITY: Pre-built queries with hardcoded column names to prevent SQL injection
  // Same pattern used in bulkUpdateSiteParams() for consistency
  const getZeroParamQuery = param => {
    const queries = {
      dr: 'SELECT id, site_name, site_url, dr, created_at FROM sites WHERE dr IS NULL OR dr = 0 ORDER BY site_name ASC',
      da: 'SELECT id, site_name, site_url, da, created_at FROM sites WHERE da IS NULL OR da = 0 ORDER BY site_name ASC',
      ref_domains:
        'SELECT id, site_name, site_url, ref_domains, created_at FROM sites WHERE ref_domains IS NULL OR ref_domains = 0 ORDER BY site_name ASC',
      rd_main:
        'SELECT id, site_name, site_url, rd_main, created_at FROM sites WHERE rd_main IS NULL OR rd_main = 0 ORDER BY site_name ASC',
      norm: 'SELECT id, site_name, site_url, norm, created_at FROM sites WHERE norm IS NULL OR norm = 0 ORDER BY site_name ASC',
      tf: 'SELECT id, site_name, site_url, tf, created_at FROM sites WHERE tf IS NULL OR tf = 0 ORDER BY site_name ASC',
      cf: 'SELECT id, site_name, site_url, cf, created_at FROM sites WHERE cf IS NULL OR cf = 0 ORDER BY site_name ASC',
      keywords:
        'SELECT id, site_name, site_url, keywords, created_at FROM sites WHERE keywords IS NULL OR keywords = 0 ORDER BY site_name ASC',
      traffic:
        'SELECT id, site_name, site_url, traffic, created_at FROM sites WHERE traffic IS NULL OR traffic = 0 ORDER BY site_name ASC',
      geo: "SELECT id, site_name, site_url, geo, created_at FROM sites WHERE geo IS NULL OR geo = '' ORDER BY site_name ASC"
    };
    return queries[param];
  };

  try {
    const result = await query(getZeroParamQuery(parameter));

    logger.info('Get sites with zero param', {
      parameter,
      count: result.rows.length
    });

    return {
      parameter,
      count: result.rows.length,
      sites: result.rows
    };
  } catch (error) {
    logger.error('Get sites with zero param error:', { parameter, error: error.message });
    throw error;
  }
};

// Calculate total revenue for a site over the last 365 days
// Includes: rental income + placement sales (links and articles)
const calculateSiteRevenue = async (siteId, userId) => {
  try {
    const result = await query(
      `
      WITH rental_income AS (
        -- Доход от аренды слотов - считаем напрямую из site_slot_rentals.total_price
        -- для всех активных аренд (независимо от транзакций)
        SELECT COALESCE(SUM(r.total_price), 0) as amount
        FROM site_slot_rentals r
        WHERE r.site_id = $1
          AND r.owner_id = $2
          AND r.status IN ('active', 'pending_approval')
          AND r.created_at >= NOW() - INTERVAL '365 days'
      ),
      placement_income AS (
        -- Доход от продажи ссылок и статей на этом сайте
        -- Считаем final_price из placements где сайт принадлежит владельцу
        -- и покупатель НЕ является владельцем (т.е. другие пользователи купили)
        SELECT COALESCE(SUM(p.final_price), 0) as amount
        FROM placements p
        JOIN sites s ON p.site_id = s.id
        WHERE p.site_id = $1
          AND s.user_id = $2
          AND p.user_id != $2
          AND p.status = 'placed'
          AND p.purchased_at >= NOW() - INTERVAL '365 days'
      )
      SELECT
        (SELECT amount FROM rental_income) +
        (SELECT amount FROM placement_income) as total_revenue
    `,
      [siteId, userId]
    );

    return parseFloat(result.rows[0].total_revenue || 0);
  } catch (error) {
    logger.error('Calculate site revenue error:', { siteId, userId, error: error.message });
    // Return 0 on error instead of throwing
    return 0;
  }
};

/**
 * Broadcast new API endpoint to all sites
 * Creates pending endpoint update records for all sites
 * Plugins will receive the update on next API call
 */
const broadcastEndpoint = async (newEndpoint) => {
  try {
    // Validate endpoint URL
    try {
      new URL(newEndpoint);
    } catch {
      throw new Error('Invalid endpoint URL');
    }

    // Get all sites
    const sites = await query('SELECT id FROM sites');

    if (sites.rows.length === 0) {
      return { updated: 0, message: 'No sites found' };
    }

    // Create/update endpoint update records for all sites
    let updated = 0;
    for (const site of sites.rows) {
      await query(
        `INSERT INTO site_endpoint_updates (site_id, new_endpoint, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (site_id) DO UPDATE SET
           new_endpoint = $2,
           status = 'pending',
           created_at = NOW(),
           confirmed_at = NULL`,
        [site.id, newEndpoint]
      );
      updated++;
    }

    logger.info('Broadcast endpoint update', {
      newEndpoint,
      sitesUpdated: updated
    });

    return {
      updated,
      message: `Endpoint update queued for ${updated} sites`
    };
  } catch (error) {
    logger.error('Broadcast endpoint error:', error);
    throw error;
  }
};

/**
 * Get endpoint migration status (how many sites confirmed)
 */
const getEndpointMigrationStatus = async () => {
  try {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
         COUNT(*) as total,
         new_endpoint
       FROM site_endpoint_updates
       GROUP BY new_endpoint
       ORDER BY MAX(created_at) DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return { pending: 0, confirmed: 0, total: 0, new_endpoint: null };
    }

    return {
      pending: parseInt(result.rows[0].pending),
      confirmed: parseInt(result.rows[0].confirmed),
      total: parseInt(result.rows[0].total),
      new_endpoint: result.rows[0].new_endpoint
    };
  } catch (error) {
    logger.error('Get endpoint migration status error:', error);
    throw error;
  }
};

module.exports = {
  getUserSites,
  getMarketplaceSites,
  createSite,
  updateSite,
  deleteSite,
  recalculateSiteStats,
  getSiteById,
  getSiteByDomain,
  // Registration token methods
  generateRegistrationToken,
  validateRegistrationToken,
  incrementTokenUsage,
  getSiteByUrlForUser,
  getUserTokens,
  deleteToken,
  // Bulk update methods
  bulkUpdateSiteParams,
  getSitesWithZeroParam,
  // Site moderation methods
  requestPublicSale,
  getSitesForModeration,
  approveSite,
  rejectSite,
  getModerationStats,
  // Revenue calculation
  calculateSiteRevenue,
  // Endpoint migration
  broadcastEndpoint,
  getEndpointMigrationStatus
};
