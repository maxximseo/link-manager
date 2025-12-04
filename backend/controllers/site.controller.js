/**
 * Site controller
 * Handles site-related business logic
 */

const siteService = require('../services/site.service');
const { validateExternalUrl } = require('../services/wordpress.service');
const logger = require('../config/logger');
const { validatePagination } = require('../utils/validators');

// Get all sites for user
const getSites = async (req, res) => {
  try {
    const { page, limit } = validatePagination(req.query, {
      maxLimit: 5000,
      defaultLimit: 20,
      defaultPage: 1
    });
    const recalculate = req.query.recalculate === 'true';

    const result = await siteService.getUserSites(req.user.id, page, limit, recalculate);

    res.json(result);
  } catch (error) {
    logger.error('Get sites error:', error);

    if (error.message.includes('Page number') || error.message.includes('Limit cannot')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to fetch sites' });
  }
};

// Get single site
const getSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;

    const site = await siteService.getSiteById(siteId, userId);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json(site);
  } catch (error) {
    logger.error('Get site error:', error);
    res.status(500).json({ error: 'Failed to fetch site' });
  }
};

// Create new site
const createSite = async (req, res) => {
  try {
    const {
      site_url,
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      available_for_purchase
    } = req.body;
    let { is_public } = req.body;

    // RESTRICTION: Only admin can set is_public to true
    if (is_public !== undefined && req.user.role !== 'admin') {
      is_public = false; // Force to false for non-admin users
    }

    // Validate required fields
    if (!site_url || typeof site_url !== 'string' || site_url.trim().length === 0) {
      return res.status(400).json({ error: 'Site URL is required' });
    }

    // SSRF protection: validate URL with full checks (DNS rebinding, cloud metadata, private IPs)
    try {
      await validateExternalUrl(site_url);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Validate site_type
    if (site_type && !['wordpress', 'static_php'].includes(site_type)) {
      return res.status(400).json({ error: 'Site type must be wordpress or static_php' });
    }

    // Validate API key length (VARCHAR(100) in database)
    if (api_key && (typeof api_key !== 'string' || api_key.length > 100)) {
      return res.status(400).json({ error: 'API key must be less than 100 characters' });
    }

    // Validate numeric fields
    if (max_links !== undefined && (typeof max_links !== 'number' || max_links < 0)) {
      return res.status(400).json({ error: 'Max links must be a positive number' });
    }

    if (max_articles !== undefined && (typeof max_articles !== 'number' || max_articles < 0)) {
      return res.status(400).json({ error: 'Max articles must be a positive number' });
    }

    // Validate allow_articles if provided
    if (allow_articles !== undefined && typeof allow_articles !== 'boolean') {
      return res.status(400).json({ error: 'Allow articles must be a boolean value' });
    }

    // Validate is_public if provided
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return res.status(400).json({ error: 'is_public must be a boolean value' });
    }

    // Validate available_for_purchase if provided
    if (available_for_purchase !== undefined && typeof available_for_purchase !== 'boolean') {
      return res.status(400).json({ error: 'available_for_purchase must be a boolean value' });
    }

    const site = await siteService.createSite({
      site_url: site_url.trim(),
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      is_public,
      available_for_purchase,
      userId: req.user.id
    });

    res.json(site);
  } catch (error) {
    logger.error('Create site error:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
};

// Update site
const updateSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;
    const {
      site_url,
      site_name,
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      available_for_purchase
    } = req.body;
    let { is_public } = req.body;

    // RESTRICTION: Only admin can change is_public
    if (is_public !== undefined && req.user.role !== 'admin') {
      is_public = undefined; // Ignore is_public for non-admin users
    }

    // Validate URL format if provided
    if (site_url) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(site_url)) {
        return res.status(400).json({ error: 'Site URL must be a valid HTTP/HTTPS URL' });
      }
    }

    // Validate site_type if provided
    if (site_type && !['wordpress', 'static_php'].includes(site_type)) {
      return res.status(400).json({ error: 'Site type must be wordpress or static_php' });
    }

    // Validate numeric fields
    if (max_links !== undefined && (typeof max_links !== 'number' || max_links < 0)) {
      return res.status(400).json({ error: 'Max links must be a positive number' });
    }

    if (max_articles !== undefined && (typeof max_articles !== 'number' || max_articles < 0)) {
      return res.status(400).json({ error: 'Max articles must be a positive number' });
    }

    // Validate allow_articles if provided
    if (allow_articles !== undefined && typeof allow_articles !== 'boolean') {
      return res.status(400).json({ error: 'Allow articles must be a boolean value' });
    }

    // Validate is_public if provided
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return res.status(400).json({ error: 'is_public must be a boolean value' });
    }

    // Validate available_for_purchase if provided
    if (available_for_purchase !== undefined && typeof available_for_purchase !== 'boolean') {
      return res.status(400).json({ error: 'available_for_purchase must be a boolean value' });
    }

    const site = await siteService.updateSite(siteId, userId, {
      site_url,
      site_name,
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      is_public,
      available_for_purchase
    });

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json(site);
  } catch (error) {
    logger.error('Update site error:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
};

// Delete site with automatic refunds
const deleteSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;

    const result = await siteService.deleteSite(siteId, userId);

    if (!result.deleted) {
      return res.status(404).json({ error: result.error || 'Site not found' });
    }

    // Return detailed refund information for frontend
    res.json({
      success: true,
      message: 'Site deleted successfully',
      placementsCount: result.placementsCount,
      refundedCount: result.refundedCount,
      totalRefunded: result.totalRefunded,
      tierChanged: result.tierChanged,
      newTier: result.newTier,
      refundDetails: result.refundDetails
    });
  } catch (error) {
    logger.error('Delete site error:', error);
    res.status(500).json({ error: 'Failed to delete site: ' + error.message });
  }
};

// Recalculate site statistics
const recalculateStats = async (req, res) => {
  try {
    const userId = req.user.id;

    await siteService.recalculateSiteStats(userId);

    res.json({ message: 'Site statistics recalculated successfully' });
  } catch (error) {
    logger.error('Recalculate stats error:', error);
    res.status(500).json({ error: 'Failed to recalculate statistics' });
  }
};

// Get marketplace sites (public + owned)
const getMarketplaceSites = async (req, res) => {
  try {
    const userId = req.user.id;
    const sites = await siteService.getMarketplaceSites(userId);

    res.json({ data: sites });
  } catch (error) {
    logger.error('Get marketplace sites error:', error);
    res.status(500).json({ error: 'Failed to get marketplace sites' });
  }
};

// ============================================================================
// Registration Token Controllers (for bulk WordPress site registration)
// ============================================================================

// Generate a new registration token
const generateToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { label, max_uses, expires_at } = req.body;

    const token = await siteService.generateRegistrationToken(userId, {
      label,
      max_uses: max_uses || 0,
      expires_at
    });

    res.json({
      success: true,
      token: token.token,
      id: token.id,
      label: token.label,
      max_uses: token.max_uses,
      expires_at: token.expires_at
    });
  } catch (error) {
    logger.error('Generate token error:', error);
    res.status(500).json({ error: 'Failed to generate registration token' });
  }
};

// Register a WordPress site using a registration token (no auth required - token is auth)
const registerFromWordPress = async (req, res) => {
  try {
    const { registration_token, site_url, api_key } = req.body;

    // Validate required fields
    if (!registration_token || typeof registration_token !== 'string') {
      return res.status(400).json({ error: 'Registration token is required' });
    }

    if (!site_url || typeof site_url !== 'string' || site_url.trim().length === 0) {
      return res.status(400).json({ error: 'Site URL is required' });
    }

    if (!api_key || typeof api_key !== 'string') {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Validate token
    const tokenData = await siteService.validateRegistrationToken(registration_token);
    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid, expired, or exhausted registration token' });
    }

    // Check if site already registered for this user
    const existing = await siteService.getSiteByUrlForUser(site_url, tokenData.user_id);
    if (existing) {
      return res.status(409).json({
        error: 'Site already registered',
        site_id: existing.id
      });
    }

    // Create site
    const site = await siteService.createSite({
      site_url: site_url.trim(),
      api_key,
      site_type: 'wordpress',
      max_links: 10,
      max_articles: 30,
      userId: tokenData.user_id
    });

    // Increment token usage
    await siteService.incrementTokenUsage(registration_token);

    logger.info('WordPress site registered via token', {
      site_id: site.id,
      site_url: site_url,
      user_id: tokenData.user_id
    });

    res.json({
      success: true,
      site_id: site.id,
      message: 'Site registered successfully'
    });
  } catch (error) {
    logger.error('WordPress registration error:', error);
    res.status(500).json({ error: 'Failed to register site' });
  }
};

// Get all tokens for the authenticated user
const getTokens = async (req, res) => {
  try {
    const userId = req.user.id;
    const tokens = await siteService.getUserTokens(userId);

    res.json({ data: tokens });
  } catch (error) {
    logger.error('Get tokens error:', error);
    res.status(500).json({ error: 'Failed to get tokens' });
  }
};

// Delete a registration token
const deleteToken = async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const deleted = await siteService.deleteToken(tokenId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete token error:', error);
    res.status(500).json({ error: 'Failed to delete token' });
  }
};

module.exports = {
  getSites,
  getSite,
  getMarketplaceSites,
  createSite,
  updateSite,
  deleteSite,
  recalculateStats,
  // Registration token controllers
  generateToken,
  registerFromWordPress,
  getTokens,
  deleteToken
};
