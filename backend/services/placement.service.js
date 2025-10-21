/**
 * Placement service
 * Handles placement database operations
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');
const cache = require('./cache.service');
const wordpressService = require('./wordpress.service');

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
    const DEFAULT_MAX_RESULTS = 1000; // Prevent unbounded queries

    if (usePagination) {
      const offset = (page - 1) * limit;
      placementsQuery += ' LIMIT $2 OFFSET $3';
      queryParams.push(limit, offset);
    } else {
      // Always add LIMIT for safety even without pagination
      placementsQuery += ' LIMIT $2';
      queryParams.push(DEFAULT_MAX_RESULTS);
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
  // Get database client for transaction
  const client = await pool.connect();

  try {
    const { site_id, project_id, link_ids = [], article_ids = [], userId } = data;

    // Begin transaction
    await client.query('BEGIN');

    // Check existing placements for this project on this site
    const existingContentResult = await client.query(`
      SELECT
        COUNT(DISTINCT pc.link_id) as existing_links,
        COUNT(DISTINCT pc.article_id) as existing_articles
      FROM placements p
      JOIN placement_content pc ON p.id = pc.placement_id
      WHERE p.project_id = $1 AND p.site_id = $2
    `, [project_id, site_id]);

    const existing = existingContentResult.rows[0];
    const hasExistingLinks = parseInt(existing.existing_links) > 0;
    const hasExistingArticles = parseInt(existing.existing_articles) > 0;

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

    // Check site quotas with row-level lock to prevent race conditions
    const siteResult = await client.query(
      'SELECT max_links, used_links, max_articles, used_articles FROM sites WHERE id = $1 FOR UPDATE',
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
    const existingResult = await client.query(
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
      const placementResult = await client.query(
        'INSERT INTO placements (project_id, site_id, type, placed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *',
        [project_id, site_id, 'manual']
      );
      placement = placementResult.rows[0];
    }
    
    // Add links to placement_content with duplicate check
    for (const linkId of link_ids) {
      // Check if link already in placement
      const existingLink = await client.query(
        'SELECT id FROM placement_content WHERE placement_id = $1 AND link_id = $2',
        [placement.id, linkId]
      );

      if (existingLink.rows.length === 0) {
        try {
          await client.query(
            'INSERT INTO placement_content (placement_id, link_id) VALUES ($1, $2)',
            [placement.id, linkId]
          );

          // Increment usage_count for the link
          await client.query(
            'UPDATE project_links SET usage_count = usage_count + 1 WHERE id = $1',
            [linkId]
          );
        } catch (insertError) {
          // Handle unique constraint violation (race condition)
          if (insertError.code === '23505') {
            logger.warn('Link already placed (race condition detected)', {
              placementId: placement.id,
              linkId,
              constraint: insertError.constraint
            });
          } else {
            throw insertError;
          }
        }
      } else {
        logger.debug('Link already in placement, skipping', { placementId: placement.id, linkId });
      }
    }

    // Add articles to placement_content with duplicate check
    for (const articleId of article_ids) {
      // Check if article already in placement
      const existingArticle = await client.query(
        'SELECT id FROM placement_content WHERE placement_id = $1 AND article_id = $2',
        [placement.id, articleId]
      );

      if (existingArticle.rows.length === 0) {
        try {
          await client.query(
            'INSERT INTO placement_content (placement_id, article_id) VALUES ($1, $2)',
            [placement.id, articleId]
          );

          // Increment usage_count for the article
          await client.query(
            'UPDATE project_articles SET usage_count = usage_count + 1 WHERE id = $1',
            [articleId]
          );
        } catch (insertError) {
          // Handle unique constraint violation (race condition)
          if (insertError.code === '23505') {
            logger.warn('Article already placed (race condition detected)', {
              placementId: placement.id,
              articleId,
              constraint: insertError.constraint
            });
          } else {
            throw insertError;
          }
        }
      } else {
        logger.debug('Article already in placement, skipping', { placementId: placement.id, articleId });
      }
    }

    // Update site quotas
    if (link_ids.length > 0) {
      await client.query(
        'UPDATE sites SET used_links = used_links + $1 WHERE id = $2',
        [link_ids.length, site_id]
      );
    }

    if (article_ids.length > 0) {
      await client.query(
        'UPDATE sites SET used_articles = used_articles + $1 WHERE id = $2',
        [article_ids.length, site_id]
      );
    }

    // Set default status for placements without articles (links only)
    if (article_ids.length === 0) {
      await client.query(
        'UPDATE placements SET status = $1 WHERE id = $2',
        ['placed', placement.id]
      );
    }

    // Publish articles to WordPress if any
    if (article_ids.length > 0) {
      let publishedCount = 0;
      let failedCount = 0;
      const publishErrors = [];

      // Get site details including API key and URL
      const siteDetailsResult = await client.query(
        'SELECT site_url, api_key FROM sites WHERE id = $1',
        [site_id]
      );

      if (siteDetailsResult.rows.length > 0) {
        const siteDetails = siteDetailsResult.rows[0];

        // Get article details for each article_id
        for (const articleId of article_ids) {
          try {
            const articleResult = await client.query(
              'SELECT id, title, content, slug FROM project_articles WHERE id = $1',
              [articleId]
            );

            if (articleResult.rows.length > 0) {
              const article = articleResult.rows[0];

              // Publish article to WordPress
              const wpResult = await wordpressService.publishArticle(
                siteDetails.site_url,
                siteDetails.api_key,
                {
                  title: article.title,
                  content: article.content,
                  slug: article.slug
                }
              );

              // Update placement with WordPress post ID and status
              await client.query(
                'UPDATE placements SET wordpress_post_id = $1, status = $2 WHERE id = $3',
                [wpResult.post_id, 'placed', placement.id]
              );

              publishedCount++;
              logger.info('Article published to WordPress', {
                placementId: placement.id,
                articleId,
                wpPostId: wpResult.post_id
              });
            }
          } catch (articleError) {
            failedCount++;
            publishErrors.push({ articleId, error: articleError.message });

            logger.error('Failed to publish article to WordPress', {
              placementId: placement.id,
              articleId,
              error: articleError.message
            });
          }
        }
      }

      // If ALL articles failed to publish, rollback transaction
      if (failedCount > 0 && publishedCount === 0) {
        await client.query('ROLLBACK');
        throw new Error(`All ${failedCount} article(s) failed to publish to WordPress: ${publishErrors.map(e => e.error).join('; ')}`);
      }

      // If some failed but some succeeded, mark placement as partially failed
      if (failedCount > 0 && publishedCount > 0) {
        await client.query(
          'UPDATE placements SET status = $1 WHERE id = $2',
          ['partial_fail', placement.id]
        );
        logger.warn('Some articles failed to publish', {
          placementId: placement.id,
          published: publishedCount,
          failed: failedCount,
          errors: publishErrors
        });
      }
    }

    // Commit transaction - all database operations successful
    await client.query('COMMIT');
    logger.info('Placement transaction committed successfully', { placementId: placement.id });

    // Invalidate cache for placements and projects (after commit)
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    await cache.delPattern(`wp:content:*`); // Invalidate WordPress API cache
    logger.debug('Cache invalidated after placement creation', { userId });

    return placement;
  } catch (error) {
    // Rollback transaction on any error
    await client.query('ROLLBACK');
    logger.error('Placement transaction rolled back due to error:', error);
    throw error;
  } finally {
    // Always release client back to pool
    client.release();
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
  // Get database client for transaction
  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query('BEGIN');

    // First get the placement details and content IDs with row-level lock
    const placementInfo = await client.query(`
      SELECT
        p.site_id,
        COUNT(DISTINCT pc.link_id) as link_count,
        COUNT(DISTINCT pc.article_id) as article_count,
        array_agg(DISTINCT pc.link_id) FILTER (WHERE pc.link_id IS NOT NULL) as link_ids,
        array_agg(DISTINCT pc.article_id) FILTER (WHERE pc.article_id IS NOT NULL) as article_ids
      FROM placements p
      LEFT JOIN placement_content pc ON p.id = pc.placement_id
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1 AND (s.user_id = $2 OR proj.user_id = $2)
      GROUP BY p.site_id
      FOR UPDATE OF p
    `, [placementId, userId]);

    if (placementInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const { site_id, link_count, article_count, link_ids, article_ids } = placementInfo.rows[0];

    // Delete the placement
    const result = await client.query(`
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
        await client.query(
          'UPDATE sites SET used_links = GREATEST(0, used_links - $1) WHERE id = $2',
          [link_count, site_id]
        );
      }

      if (article_count > 0) {
        await client.query(
          'UPDATE sites SET used_articles = GREATEST(0, used_articles - $1) WHERE id = $2',
          [article_count, site_id]
        );
      }

      // Decrement usage_count for links and update status
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

      // Decrement usage_count for articles and update status
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

      // Commit transaction - all deletions successful
      await client.query('COMMIT');
      logger.info('Placement deletion transaction committed successfully', { placementId });

      // Invalidate cache after commit
      await cache.delPattern(`placements:user:${userId}:*`);
      await cache.delPattern(`projects:user:${userId}:*`);
      await cache.delPattern(`wp:content:*`); // Invalidate WordPress API cache
      logger.info('Placement deleted, usage counts updated, and cache invalidated', {
        placementId,
        site_id,
        userId,
        links_updated: link_ids?.length || 0,
        articles_updated: article_ids?.length || 0
      });

      return true;
    }

    // No rows deleted
    await client.query('ROLLBACK');
    return false;
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error('Placement deletion transaction rolled back due to error:', error);
    throw error;
  } finally {
    // Always release client back to pool
    client.release();
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

// Get available sites for placement (checks which sites already have content from this project)
const getAvailableSites = async (projectId, userId) => {
  try {
    const result = await query(`
      SELECT
        s.id,
        s.site_name,
        s.site_url,
        s.max_links,
        s.used_links,
        s.max_articles,
        s.used_articles,
        COALESCE(
          (SELECT COUNT(DISTINCT pc.link_id)
           FROM placements p
           JOIN placement_content pc ON p.id = pc.placement_id
           WHERE p.project_id = $1 AND p.site_id = s.id AND pc.link_id IS NOT NULL),
          0
        ) as project_links_on_site,
        COALESCE(
          (SELECT COUNT(DISTINCT pc.article_id)
           FROM placements p
           JOIN placement_content pc ON p.id = pc.placement_id
           WHERE p.project_id = $1 AND p.site_id = s.id AND pc.article_id IS NOT NULL),
          0
        ) as project_articles_on_site
      FROM sites s
      WHERE s.user_id = $2
    `, [projectId, userId]);

    // Add availability flags
    const sitesWithAvailability = result.rows.map(site => ({
      ...site,
      can_place_link: parseInt(site.project_links_on_site) === 0 && site.used_links < site.max_links,
      can_place_article: parseInt(site.project_articles_on_site) === 0 && site.used_articles < site.max_articles
    }));

    return sitesWithAvailability;
  } catch (error) {
    logger.error('Get available sites error:', error);
    throw error;
  }
};

module.exports = {
  getUserPlacements,
  createPlacement,
  getPlacementById,
  deletePlacement,
  getStatistics,
  getAvailableSites
};