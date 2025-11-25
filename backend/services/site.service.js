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
    let sitesQuery = 'SELECT id, user_id, site_name, site_url, api_key, site_type, max_links, max_articles, used_links, used_articles, allow_articles, is_public, available_for_purchase, dr, da, ref_domains, rd_main, norm, created_at FROM sites WHERE user_id = $1 ORDER BY created_at DESC';
    const queryParams = [userId];
    
    if (usePagination) {
      const offset = (page - 1) * limit;
      sitesQuery += ' LIMIT $2 OFFSET $3';
      queryParams.push(limit, offset);
    }
    
    const result = await query(sitesQuery, queryParams);
    
    // If pagination is requested, return paginated format
    if (usePagination) {
      // Get total count
      const countResult = await query(
        'SELECT COUNT(*) FROM sites WHERE user_id = $1',
        [userId]
      );
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
        },
        recalculated: recalculate
      };
    } else {
      // Return simple array for backward compatibility
      return result.rows;
    }
  } catch (error) {
    logger.error('Get user sites error:', error);
    throw error;
  }
};

// Get marketplace sites (public sites + user's own sites)
const getMarketplaceSites = async (userId) => {
  try {
    // Return sites that are either:
    // 1. Public (is_public = TRUE), OR
    // 2. Owned by the requesting user (user_id = userId)
    // Note: Don't expose api_key for sites user doesn't own
    const result = await query(`
      SELECT
        id, user_id, site_name, site_url, site_type,
        max_links, max_articles, used_links, used_articles,
        allow_articles, is_public, available_for_purchase, dr, da, ref_domains, rd_main, norm, created_at,
        CASE
          WHEN user_id = $1 THEN api_key
          ELSE NULL
        END as api_key
      FROM sites
      WHERE is_public = TRUE OR user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    logger.info('Marketplace sites retrieved', {
      userId,
      totalSites: result.rows.length,
      publicSites: result.rows.filter(s => s.is_public).length,
      ownedSites: result.rows.filter(s => s.user_id === userId).length
    });

    return result.rows;
  } catch (error) {
    logger.error('Get marketplace sites error:', error);
    throw error;
  }
};

// Create new site
const createSite = async (data) => {
  try {
    const { site_url, api_key, max_links, max_articles, userId, site_type, allow_articles, is_public, available_for_purchase } = data;

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
    const finalIsPublic = is_public !== undefined ? is_public : false; // Default to private
    const finalAvailableForPurchase = available_for_purchase !== undefined ? available_for_purchase : true; // Default to available

    const result = await query(
      'INSERT INTO sites (site_url, site_name, api_key, site_type, user_id, max_links, max_articles, used_links, used_articles, allow_articles, is_public, available_for_purchase) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [site_url, site_name, finalApiKey, finalSiteType, userId, max_links || 10, finalMaxArticles, 0, 0, finalAllowArticles, finalIsPublic, finalAvailableForPurchase]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Create site error:', error);
    throw error;
  }
};

// Update site
const updateSite = async (siteId, userId, data) => {
  try {
    const { site_url, site_name, api_key, max_links, max_articles, site_type, allow_articles, is_public, available_for_purchase } = data;

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
           available_for_purchase = COALESCE($9, available_for_purchase)
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [site_url, site_name, api_key, max_links, finalMaxArticles, site_type, finalAllowArticles, is_public, available_for_purchase, siteId, userId]
    );

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

    // 2. Get all placements for this site with financial data
    const placementsResult = await client.query(`
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
    `, [siteId]);

    const placements = placementsResult.rows;

    // 2.5. Delete WordPress posts (for article placements on WordPress sites)
    // Do this BEFORE refunds, but don't fail the entire deletion if WordPress is down
    const wordpressService = require('./wordpress.service');
    let wpPostsDeleted = 0;
    let wpDeletionErrors = [];

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
    await client.query(`
      UPDATE sites
      SET used_links = 0, used_articles = 0
      WHERE id = $1
    `, [siteId]);

    // 5. Delete site (CASCADE will delete all placements and placement_content)
    await client.query(
      'DELETE FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    // 6. Create audit log entry
    await client.query(`
      INSERT INTO audit_log (
        user_id, action, details
      ) VALUES ($1, $2, $3)
    `, [
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
    ]);

    // 7. COMMIT transaction
    await client.query('COMMIT');

    // 8. Clear cache
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    await cache.delPattern(`wp:content:*`);

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
const recalculateSiteStats = async (userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Batch recalculate all user's sites in single query with explicit transaction
    await client.query(`
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
    `, [userId]);

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
      'SELECT id, user_id, site_name, site_url, api_key, site_type, max_links, max_articles, used_links, used_articles, allow_articles, is_public, dr, da, created_at FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by ID error:', error);
    throw error;
  }
};

// Get site by domain (for static PHP widget)
const getSiteByDomain = async (domain) => {
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
      `SELECT id, user_id, site_name, site_url, site_type, max_links, max_articles, used_links, used_articles, allow_articles, dr, da, created_at
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
const validateRegistrationToken = async (token) => {
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
const incrementTokenUsage = async (token) => {
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
const getUserTokens = async (userId) => {
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
 * Bulk update site parameters (DR, etc.)
 * @param {string} parameter - Parameter name ('dr', etc.)
 * @param {Array} updates - Array of {domain, value} objects
 * @returns {Object} - Results with success/failure counts
 */
const bulkUpdateSiteParams = async (parameter, updates) => {
  const allowedParams = ['dr', 'da']; // Whitelist of allowed parameters

  if (!allowedParams.includes(parameter)) {
    throw new Error(`Parameter '${parameter}' is not allowed. Allowed: ${allowedParams.join(', ')}`);
  }

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
      // Find site by normalized URL
      const findResult = await query(
        `SELECT id, site_url, ${parameter} as old_value
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
         LIMIT 1`,
        [normalizedDomain]
      );

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

      // Update the parameter
      await query(
        `UPDATE sites SET ${parameter} = $1 WHERE id = $2`,
        [value, site.id]
      );

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
      logger.error('Bulk update site param error:', { domain: normalizedDomain, error: error.message });
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
 * @param {string} parameter - Parameter name ('dr', etc.)
 * @returns {Array} - Array of sites with zero/null value
 */
const getSitesWithZeroParam = async (parameter) => {
  const allowedParams = ['dr', 'da']; // Whitelist of allowed parameters

  if (!allowedParams.includes(parameter)) {
    throw new Error(`Parameter '${parameter}' is not allowed. Allowed: ${allowedParams.join(', ')}`);
  }

  try {
    const result = await query(
      `SELECT id, site_name, site_url, ${parameter}, created_at
       FROM sites
       WHERE ${parameter} IS NULL OR ${parameter} = 0
       ORDER BY site_name ASC`
    );

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
  // Bulk update methods
  bulkUpdateSiteParams,
  getSitesWithZeroParam
};