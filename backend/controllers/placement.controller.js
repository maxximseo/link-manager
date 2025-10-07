/**
 * Placement controller  
 * Handles placement-related business logic
 */

const placementService = require('../services/placement.service');
const logger = require('../config/logger');

// Get all placements for user
const getPlacements = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    
    const result = await placementService.getUserPlacements(req.user.id, page, limit);
    
    res.json(result);
  } catch (error) {
    logger.error('Get placements error:', error);
    res.status(500).json({ error: 'Failed to fetch placements' });
  }
};

// Get single placement
const getPlacement = async (req, res) => {
  try {
    const placementId = req.params.id;
    const userId = req.user.id;
    
    const placement = await placementService.getPlacementById(placementId, userId);
    
    if (!placement) {
      return res.status(404).json({ error: 'Placement not found' });
    }
    
    res.json(placement);
  } catch (error) {
    logger.error('Get placement error:', error);
    res.status(500).json({ error: 'Failed to fetch placement' });
  }
};

// Create batch placement - universal for 1+ sites with validation
const createBatchPlacement = async (req, res) => {
  try {
    const { project_id, site_ids = [], link_ids = [], article_ids = [] } = req.body;
    
    // Input validation
    if (!project_id || !site_ids || !Array.isArray(site_ids) || site_ids.length === 0) {
      return res.status(400).json({
        error: 'Invalid input: project_id and non-empty site_ids array are required'
      });
    }
    
    if (!Array.isArray(link_ids) || !Array.isArray(article_ids)) {
      return res.status(400).json({
        error: 'Invalid input: link_ids and article_ids must be arrays'
      });
    }
    
    if (link_ids.length === 0 && article_ids.length === 0) {
      return res.status(400).json({
        error: 'At least one link or article must be specified'
      });
    }
    
    // Validate project existence and ownership BEFORE database operations
    const { query } = require('../config/database');
    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({
        error: `Project ${project_id} not found or access denied`
      });
    }
    
    // Validate sites existence and ownership BEFORE database operations
    const sitesCheck = await query(
      'SELECT id FROM sites WHERE id = ANY($1) AND user_id = $2',
      [site_ids, req.user.id]
    );
    
    const validSiteIds = sitesCheck.rows.map(row => row.id);
    const invalidSiteIds = site_ids.filter(id => !validSiteIds.includes(id));
    
    if (invalidSiteIds.length > 0) {
      return res.status(400).json({
        error: `Invalid or inaccessible site IDs: ${invalidSiteIds.join(', ')}`
      });
    }
    
    // Distribute links and articles across sites
    // Strategy: Round-robin distribution
    // Example: 2 sites, 2 links -> Site1 gets Link1, Site2 gets Link2
    const results = [];
    const errors = [];

    const numSites = site_ids.length;
    let linkIndex = 0;
    let articleIndex = 0;

    for (let i = 0; i < numSites; i++) {
      const site_id = site_ids[i];

      // Assign 1 link per site (round-robin)
      const assignedLinks = [];
      if (linkIndex < link_ids.length) {
        assignedLinks.push(link_ids[linkIndex]);
        linkIndex++;
      }

      // Assign 1 article per site (round-robin)
      const assignedArticles = [];
      if (articleIndex < article_ids.length) {
        assignedArticles.push(article_ids[articleIndex]);
        articleIndex++;
      }

      // Skip if nothing to place on this site
      if (assignedLinks.length === 0 && assignedArticles.length === 0) {
        continue;
      }

      try {
        const placement = await placementService.createPlacement({
          site_id,
          project_id,
          link_ids: assignedLinks,
          article_ids: assignedArticles,
          userId: req.user.id
        });
        results.push(placement);
      } catch (error) {
        errors.push({ site_id, error: error.message });
        logger.warn('Failed to create placement for site', { site_id, error: error.message });
      }
    }

    res.json({
      message: `Successfully created ${results.length} placements for ${site_ids.length} sites`,
      placements: results,
      total_sites: site_ids.length,
      successful: results.length,
      failed: errors.length,
      distribution: {
        links_distributed: linkIndex,
        articles_distributed: articleIndex
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('Create batch placement error:', error);
    res.status(500).json({ error: 'Failed to create batch placement' });
  }
};

// Delete placement
const deletePlacement = async (req, res) => {
  try {
    const placementId = req.params.id;
    const userId = req.user.id;
    
    const deleted = await placementService.deletePlacement(placementId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Placement not found' });
    }
    
    res.json({ message: 'Placement deleted successfully' });
  } catch (error) {
    logger.error('Delete placement error:', error);
    res.status(500).json({ error: 'Failed to delete placement' });
  }
};

// Get placement statistics
const getStatistics = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await placementService.getStatistics(userId);
    res.json(stats);
  } catch (error) {
    logger.error('Get placement statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Get available sites for placement (with project filter)
const getAvailableSites = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const userId = req.user.id;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const sites = await placementService.getAvailableSites(projectId, userId);
    res.json(sites);
  } catch (error) {
    logger.error('Get available sites error:', error);
    res.status(500).json({ error: 'Failed to fetch available sites' });
  }
};

module.exports = {
  getPlacements,
  getPlacement,
  createBatchPlacement,
  deletePlacement,
  getStatistics,
  getAvailableSites
};