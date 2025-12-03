/**
 * WordPress service
 * Handles WordPress integration operations
 */

const { query } = require('../config/database');
const logger = require('../config/logger');
const axios = require('axios');
const cache = require('./cache.service');
const dns = require('dns').promises;

// Validate URL to prevent SSRF attacks (enhanced with DNS resolution check)
async function validateExternalUrl(url) {
  try {
    const parsedUrl = new URL(url);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol: Only HTTP/HTTPS allowed');
    }

    // Block localhost, private IPs, and cloud metadata
    const hostname = parsedUrl.hostname.toLowerCase();

    // Block localhost variants
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) {
      throw new Error('Invalid site URL: Localhost not allowed');
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    if (
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname)
    ) {
      throw new Error('Invalid site URL: Private IP addresses not allowed');
    }

    // Block link-local addresses (169.254.x.x)
    if (/^169\.254\./.test(hostname)) {
      throw new Error('Invalid site URL: Link-local addresses not allowed');
    }

    // Block AWS/cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname.includes('metadata')) {
      throw new Error('Invalid site URL: Metadata endpoints not allowed');
    }

    // Resolve DNS to check for private IPs (prevents DNS rebinding attacks)
    try {
      const addresses = await dns.resolve4(hostname);
      for (const ip of addresses) {
        if (
          ip.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
          ip.startsWith('192.168.') ||
          ip.startsWith('127.') ||
          ip.startsWith('169.254.')
        ) {
          throw new Error('Invalid site URL: Resolves to private IP address');
        }
      }
    } catch (dnsError) {
      // If DNS lookup fails, log but don't block (domain might not exist yet)
      logger.warn('DNS resolution failed for hostname:', { hostname, error: dnsError.message });
    }

    return parsedUrl.href.replace(/\/$/, ''); // Remove trailing slash
  } catch (error) {
    if (error.message.includes('Invalid')) throw error;
    throw new Error('Invalid site URL format');
  }
}

// Get content by API key (with Redis caching)
const getContentByApiKey = async apiKey => {
  try {
    // Check cache first (5 minutes TTL)
    const cacheKey = `wp:content:${apiKey}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('WordPress content served from cache', { apiKey });
      return cached;
    }

    // Get all links for sites with this API key
    const linksResult = await query(
      `
      SELECT
        pl.id,
        pl.url,
        pl.anchor_text,
        pl.html_context,
        pl.image_url,
        pl.link_attributes,
        pl.wrapper_config,
        pl.custom_data
      FROM project_links pl
      JOIN placement_content pc ON pl.id = pc.link_id
      JOIN placements plc ON pc.placement_id = plc.id
      JOIN sites s ON plc.site_id = s.id
      WHERE s.api_key = $1
        AND pc.link_id IS NOT NULL
      ORDER BY pc.id DESC
    `,
      [apiKey]
    );

    // Get all articles for sites with this API key
    const articlesResult = await query(
      `
      SELECT
        pa.id,
        pa.title,
        pa.content,
        pa.slug,
        plc.wordpress_post_id
      FROM project_articles pa
      JOIN placement_content pc ON pa.id = pc.article_id
      JOIN placements plc ON pc.placement_id = plc.id
      JOIN sites s ON plc.site_id = s.id
      WHERE s.api_key = $1
        AND pc.article_id IS NOT NULL
      ORDER BY pc.id DESC
    `,
      [apiKey]
    );

    // Format response for WordPress plugin
    const links = linksResult.rows.map(row => ({
      url: row.url,
      anchor_text: row.anchor_text,
      html_context: row.html_context || '',
      position: '', // Position can be added later if needed

      // Extended fields for flexible rendering
      image_url: row.image_url || '',
      link_attributes: row.link_attributes || {},
      wrapper_config: row.wrapper_config || {},
      custom_data: row.custom_data || {}
    }));

    const articles = articlesResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      slug: row.slug,
      wordpress_post_id: row.wordpress_post_id
    }));

    const response = {
      links: links,
      articles: articles
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);
    logger.debug('WordPress content cached', {
      apiKey,
      linksCount: links.length,
      articlesCount: articles.length
    });

    return response;
  } catch (error) {
    logger.error('Get content by API key error:', error);
    throw error;
  }
};

// Get content by domain (legacy method for static PHP sites)
// NOTE: New static sites should use API key via getContentByApiKey() instead
const getContentByDomain = async domain => {
  try {
    const siteService = require('./site.service');

    // Normalize domain
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');

    // Check cache first (5 minutes TTL)
    const cacheKey = `static:content:${normalizedDomain}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('Static content served from cache', { domain: normalizedDomain });
      return cached;
    }

    // Find site by domain
    const site = await siteService.getSiteByDomain(normalizedDomain);

    if (!site) {
      logger.warn('Site not found for domain', { domain: normalizedDomain });
      return { links: [], articles: [] };
    }

    // Get all links for this site (static_php only supports links, not articles)
    const linksResult = await query(
      `
      SELECT
        pl.id,
        pl.url,
        pl.anchor_text,
        pl.html_context
      FROM project_links pl
      JOIN placement_content pc ON pl.id = pc.link_id
      JOIN placements plc ON pc.placement_id = plc.id
      WHERE plc.site_id = $1
        AND pc.link_id IS NOT NULL
        AND plc.status = 'placed'
      ORDER BY pc.id DESC
    `,
      [site.id]
    );

    // Format response (same format as WordPress plugin)
    const links = linksResult.rows.map(row => ({
      url: row.url,
      anchor_text: row.anchor_text,
      position: ''
    }));

    const response = {
      links: links,
      articles: [] // Static PHP sites don't support articles
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);
    logger.debug('Static content cached', { domain: normalizedDomain, linksCount: links.length });

    return response;
  } catch (error) {
    logger.error('Get content by domain error:', error);
    throw error;
  }
};

// Publish article to WordPress via Link Manager plugin
const publishArticle = async (siteUrl, apiKey, articleData) => {
  try {
    const { title, content, slug } = articleData;

    // Validate URL to prevent SSRF attacks (now async)
    const validatedUrl = await validateExternalUrl(siteUrl);

    // Use Link Manager plugin REST API endpoint
    const pluginUrl = `${validatedUrl}/wp-json/link-manager/v1/create-article`;

    const response = await axios.post(
      pluginUrl,
      {
        title,
        content,
        slug,
        api_key: apiKey
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        timeout: 30000,
        maxRedirects: 0 // Prevent SSRF via redirects
      }
    );

    if (response.data.success) {
      logger.info('Article published to WordPress via plugin', {
        siteUrl,
        articleId: response.data.post_id,
        title
      });

      return {
        success: true,
        post_id: response.data.post_id,
        url: response.data.post_url
      };
    } else {
      throw new Error(response.data.error || 'Failed to publish article');
    }
  } catch (error) {
    logger.error('WordPress publish error:', error);
    throw new Error(
      `Failed to publish to WordPress: ${error.response?.data?.error || error.message}`
    );
  }
};

// Delete article from WordPress via Link Manager plugin
const deleteArticle = async (siteUrl, apiKey, wordpressPostId) => {
  try {
    if (!wordpressPostId) {
      logger.warn('No WordPress post ID provided for deletion');
      return { success: false, error: 'No WordPress post ID' };
    }

    // Validate URL to prevent SSRF attacks (now async)
    const validatedUrl = await validateExternalUrl(siteUrl);

    // Use Link Manager plugin REST API endpoint
    const pluginUrl = `${validatedUrl}/wp-json/link-manager/v1/delete-article/${wordpressPostId}`;

    const response = await axios.delete(pluginUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      timeout: 30000,
      maxRedirects: 0 // Prevent SSRF via redirects
    });

    if (response.data.success) {
      logger.info('Article deleted from WordPress via plugin', {
        siteUrl,
        postId: wordpressPostId
      });

      return {
        success: true,
        post_id: wordpressPostId
      };
    } else {
      throw new Error(response.data.error || 'Failed to delete article');
    }
  } catch (error) {
    // Don't throw error if post doesn't exist (404) - it's already deleted
    if (error.response?.status === 404) {
      logger.info('Article already deleted from WordPress', { wordpressPostId });
      return { success: true, post_id: wordpressPostId, already_deleted: true };
    }

    logger.error('WordPress delete error:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

// Verify WordPress connection via Link Manager plugin
const verifyWordPressConnection = async (siteUrl, apiKey) => {
  try {
    // Check if Link Manager plugin REST API is available
    const testUrl = `${siteUrl}/wp-json/link-manager/v1/create-article`;

    const response = await axios.options(testUrl, {
      timeout: 10000
    });

    return {
      success: true,
      status: response.status,
      message: 'Link Manager plugin is active'
    };
  } catch (error) {
    logger.error('WordPress verification error:', error);
    return {
      success: false,
      error: error.message || 'Link Manager plugin not found or not activated'
    };
  }
};

// Get site by API key
const getSiteByApiKey = async apiKey => {
  try {
    const result = await query(
      'SELECT id, site_url, site_name, max_links, used_links, max_articles, used_articles FROM sites WHERE api_key = $1',
      [apiKey]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by API key error:', error);
    throw error;
  }
};

// Get site by ID
const getSiteById = async (siteId, userId) => {
  try {
    const result = await query(
      'SELECT id, site_url, site_name, api_key FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by ID error:', error);
    throw error;
  }
};

// Get article by ID
const getArticleById = async (articleId, userId) => {
  try {
    const result = await query(
      `SELECT pa.id, pa.title, pa.content, pa.slug
       FROM project_articles pa
       JOIN projects p ON pa.project_id = p.id
       WHERE pa.id = $1 AND p.user_id = $2`,
      [articleId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get article by ID error:', error);
    throw error;
  }
};

// Update placement with WordPress post ID
const updatePlacementWithPostId = async (siteId, articleId, wordpressPostId) => {
  try {
    await query(
      `UPDATE placements
       SET wordpress_post_id = $1, status = 'placed'
       WHERE site_id = $2
         AND id IN (
           SELECT placement_id
           FROM placement_content
           WHERE article_id = $3
         )`,
      [wordpressPostId, siteId, articleId]
    );

    logger.info('Placement updated with WordPress post ID', { siteId, articleId, wordpressPostId });
  } catch (error) {
    logger.error('Update placement with post ID error:', error);
    throw error;
  }
};

module.exports = {
  getContentByApiKey,
  getContentByDomain,
  publishArticle,
  deleteArticle,
  verifyWordPressConnection,
  getSiteByApiKey,
  getSiteById,
  getArticleById,
  updatePlacementWithPostId
};
