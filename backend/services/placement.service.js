/**
 * Placement service
 * Handles placement database operations
 */

const { query } = require('../config/database');
const logger = require('../config/logger');
const cache = require('./cache.service');

// Get user placements with statistics (with caching)
const getUserPlacements = async (userId, page = 0, limit = 0) => {
  try {
    // Check cache first (2 minutes TTL for placements list)
    const cacheKey = `placements:user:${userId}:p${page}:l${limit}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('Placements served from cache', { userId, page, limit });
      return cached;
    }

    const usePagination = page > 0 && limit > 0;
    
    // Query to get placements with content details
    let placementsQuery = `
      SELECT
        p.id,
        p.project_id,
        p.site_id,
        p.type,
        p.count,
        p.placed_at,
        p.wordpress_post_id,
        p.status,
        s.site_url,
        s.site_name,
        proj.name as project_name,
        (SELECT COUNT(*) FROM placement_content pc WHERE pc.placement_id = p.id AND pc.link_id IS NOT NULL) as link_count,
        (SELECT COUNT(*) FROM placement_content pc WHERE pc.placement_id = p.id AND pc.article_id IS NOT NULL) as article_count,
        (SELECT pl.anchor_text FROM placement_content pc
         LEFT JOIN project_links pl ON pc.link_id = pl.id
         WHERE pc.placement_id = p.id AND pc.link_id IS NOT NULL LIMIT 1) as link_title,
        (SELECT pa.title FROM placement_content pc
         LEFT JOIN project_articles pa ON pc.article_id = pa.id
         WHERE pc.placement_id = p.id AND pc.article_id IS NOT NULL LIMIT 1) as article_title
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE s.user_id = $1 OR proj.user_id = $1
      ORDER BY p.placed_at DESC
    `;
    
    const queryParams = [userId];
    
    if (usePagination) {
      const offset = (page - 1) * limit;
      placementsQuery += ' LIMIT $2 OFFSET $3';
      queryParams.push(limit, offset);
    }
    
    const result = await query(placementsQuery, queryParams);
    
    if (usePagination) {
      // Get total count
      const countResult = await query(`
        SELECT COUNT(DISTINCT p.id) as count
        FROM placements p
        LEFT JOIN sites s ON p.site_id = s.id
        LEFT JOIN projects proj ON p.project_id = proj.id
        WHERE s.user_id = $1 OR proj.user_id = $1
      `, [userId]);
      
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      const response = {
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

      // Cache for 2 minutes
      await cache.set(cacheKey, response, 120);
      logger.debug('Placements cached', { userId, count: result.rows.length });

      return response;
    }

    const response = result.rows;

    // Cache for 2 minutes
    await cache.set(cacheKey, response, 120);
    logger.debug('Placements cached', { userId, count: result.rows.length });

    return response;
  } catch (error) {
    logger.error('Get user placements error:', error);
    throw error;
  }
};

// Create placement with duplicate handling (UPSERT approach)
const createPlacement = async (data) => {
  try {
    const { site_id, project_id, link_ids = [], article_ids = [], userId } = data;

    // Check existing placements for this project on this site
    const existingContentResult = await query(`
      SELECT
        COUNT(DISTINCT pc.link_id) as existing_links,
        COUNT(DISTINCT pc.article_id) as existing_articles
      FROM placements p
      JOIN placement_content pc ON p.id = pc.placement_id
      WHERE p.project_id = $1 AND p.site_id = $2
    `, [project_id, site_id]);

    const existing = existingContentResult.rows[0];
    const hasExistingLinks = existing.existing_links > 0;
    const hasExistingArticles = existing.existing_articles > 0;

    // Check restrictions: max 1 link and 1 article per site per project
    if (link_ids.length > 0 && hasExistingLinks) {
      throw new Error('This site already has a link from this project. Maximum 1 link per site per project.');
    }

    if (article_ids.length > 0 && hasExistingArticles) {
      throw new Error('This site already has an article from this project. Maximum 1 article per site per project.');
    }

    if (link_ids.length > 1) {
      throw new Error('You can only place 1 link per site.');
    }

    if (article_ids.length > 1) {
      throw new Error('You can only place 1 article per site.');
    }

    // Check site quotas
    const siteResult = await query(
      'SELECT max_links, used_links, max_articles, used_articles FROM sites WHERE id = $1',
      [site_id]
    );

    if (siteResult.rows.length === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];

    if (link_ids.length > 0 && site.used_links >= site.max_links) {
      throw new Error(`Site has reached its link limit (${site.max_links})`);
    }

    if (article_ids.length > 0 && site.used_articles >= site.max_articles) {
      throw new Error(`Site has reached its article limit (${site.max_articles})`);
    }

    // Check if placement already exists
    const existingResult = await query(
      'SELECT * FROM placements WHERE project_id = $1 AND site_id = $2 AND type = $3',
      [project_id, site_id, 'manual']
    );

    let placement;
    if (existingResult.rows.length > 0) {
      // Update existing placement
      placement = existingResult.rows[0];
      logger.info('Using existing placement', { placementId: placement.id, project_id, site_id });
    } else {
      // Create new placement
      const placementResult = await query(
        'INSERT INTO placements (project_id, site_id, type, count, placed_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *',
        [project_id, site_id, 'manual', link_ids.length + article_ids.length]
      );
      placement = placementResult.rows[0];
    }
    
    // Add links to placement_content with duplicate check
    for (const linkId of link_ids) {
      try {
        // Check if link already in placement
        const existingLink = await query(
          'SELECT id FROM placement_content WHERE placement_id = $1 AND link_id = $2',
          [placement.id, linkId]
        );
        
        if (existingLink.rows.length === 0) {
          await query(
            'INSERT INTO placement_content (placement_id, link_id) VALUES ($1, $2)',
            [placement.id, linkId]
          );
        }
      } catch (error) {
        logger.warn('Failed to add link to placement', { placementId: placement.id, linkId, error: error.message });
      }
    }
    
    // Add articles to placement_content with duplicate check
    for (const articleId of article_ids) {
      try {
        // Check if article already in placement
        const existingArticle = await query(
          'SELECT id FROM placement_content WHERE placement_id = $1 AND article_id = $2',
          [placement.id, articleId]
        );

        if (existingArticle.rows.length === 0) {
          await query(
            'INSERT INTO placement_content (placement_id, article_id) VALUES ($1, $2)',
            [placement.id, articleId]
          );
        }
      } catch (error) {
        logger.warn('Failed to add article to placement', { placementId: placement.id, articleId, error: error.message });
      }
    }

    // Update site quotas
    if (link_ids.length > 0) {
      await query(
        'UPDATE sites SET used_links = used_links + $1 WHERE id = $2',
        [link_ids.length, site_id]
      );
    }

    if (article_ids.length > 0) {
      await query(
        'UPDATE sites SET used_articles = used_articles + $1 WHERE id = $2',
        [article_ids.length, site_id]
      );
    }

    // Invalidate cache for placements and projects
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    await cache.delPattern(`wp:content:*`); // Invalidate WordPress API cache
    logger.debug('Cache invalidated after placement creation', { userId });

    return placement;
  } catch (error) {
    logger.error('Create placement error:', error);
    throw error;
  }
};

// Get placement by ID
const getPlacementById = async (placementId, userId) => {
  try {
    const result = await query(`
      SELECT 
        p.id,
        p.project_id,
        p.site_id,
        p.type,
        p.count,
        p.placed_at,
        p.wordpress_post_id,
        p.status,
        s.site_url,
        s.site_name,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1 AND (s.user_id = $2 OR proj.user_id = $2)
    `, [placementId, userId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get placement by ID error:', error);
    throw error;
  }
};

// Delete placement
const deletePlacement = async (placementId, userId) => {
  try {
    // First get the placement details and content counts
    const placementInfo = await query(`
      SELECT
        p.site_id,
        COUNT(DISTINCT pc.link_id) as link_count,
        COUNT(DISTINCT pc.article_id) as article_count
      FROM placements p
      LEFT JOIN placement_content pc ON p.id = pc.placement_id
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1 AND (s.user_id = $2 OR proj.user_id = $2)
      GROUP BY p.site_id
    `, [placementId, userId]);

    if (placementInfo.rows.length === 0) {
      return false;
    }

    const { site_id, link_count, article_count } = placementInfo.rows[0];

    // Delete the placement
    const result = await query(`
      DELETE FROM placements p
      USING sites s, projects proj
      WHERE p.site_id = s.id
        AND p.project_id = proj.id
        AND p.id = $1
        AND (s.user_id = $2 OR proj.user_id = $2)
      RETURNING p.id
    `, [placementId, userId]);

    if (result.rows.length > 0) {
      // Update site quotas
      if (link_count > 0) {
        await query(
          'UPDATE sites SET used_links = GREATEST(0, used_links - $1) WHERE id = $2',
          [link_count, site_id]
        );
      }

      if (article_count > 0) {
        await query(
          'UPDATE sites SET used_articles = GREATEST(0, used_articles - $1) WHERE id = $2',
          [article_count, site_id]
        );
      }

      // Invalidate cache for placements and projects
      await cache.delPattern(`placements:user:${userId}:*`);
      await cache.delPattern(`projects:user:${userId}:*`);
      await cache.delPattern(`wp:content:*`); // Invalidate WordPress API cache
      logger.info('Placement deleted and cache invalidated', { placementId, site_id, userId });

      return true;
    }

    return false;
  } catch (error) {
    logger.error('Delete placement error:', error);
    throw error;
  }
};

// Get placement statistics for user
const getStatistics = async (userId) => {
  try {
    const result = await query(`
      SELECT
        COUNT(DISTINCT p.id) as total_placements,
        COALESCE(SUM(pc.link_count), 0) as total_links_placed,
        COALESCE(SUM(pc.article_count), 0) as total_articles_placed
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT link_id) as link_count,
          COUNT(DISTINCT article_id) as article_count
        FROM placement_content
        WHERE placement_id = p.id
      ) pc ON true
      WHERE s.user_id = $1 OR proj.user_id = $1
    `, [userId]);

    return result.rows[0];
  } catch (error) {
    logger.error('Get placement statistics error:', error);
    throw error;
  }
};

module.exports = {
  getUserPlacements,
  createPlacement,
  getPlacementById,
  deletePlacement,
  getStatistics
};