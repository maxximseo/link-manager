/**
 * Project service
 * Handles project database operations
 */

const { query } = require('../config/database');
const logger = require('../config/logger');

// Get user projects with pagination and statistics
const getUserProjects = async (userId, page = 1, limit = 20) => {
  try {
    const offset = (page - 1) * limit;
    
    // Get projects with counts in one optimized query
    const projectsQuery = `
      WITH project_stats AS (
        SELECT 
          p.id,
          COUNT(DISTINCT pl.id) as links_count,
          COUNT(DISTINCT pa.id) as articles_count,
          COUNT(DISTINCT pc_links.placement_id) as placed_links_count,
          COUNT(DISTINCT pc_articles.placement_id) as placed_articles_count
        FROM projects p
        LEFT JOIN project_links pl ON p.id = pl.project_id
        LEFT JOIN project_articles pa ON p.id = pa.project_id
        LEFT JOIN placement_content pc_links ON pl.id = pc_links.link_id
        LEFT JOIN placement_content pc_articles ON pa.id = pc_articles.article_id
        WHERE p.user_id = $1
        GROUP BY p.id
      )
      SELECT 
        p.*,
        COALESCE(ps.links_count, 0) as links_count,
        COALESCE(ps.articles_count, 0) as articles_count,
        COALESCE(ps.placed_links_count, 0) as placed_links_count,
        COALESCE(ps.placed_articles_count, 0) as placed_articles_count
      FROM projects p
      LEFT JOIN project_stats ps ON p.id = ps.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await query(projectsQuery, [userId, limit, offset]);
    
    // If pagination requested, get total count
    if (page > 1 || limit < 100) {
      const countResult = await query('SELECT COUNT(*) FROM projects WHERE user_id = $1', [userId]);
      const total = parseInt(countResult.rows[0].count);
      const pages = Math.ceil(total / limit);
      
      return {
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1
        }
      };
    }
    
    return result.rows;
  } catch (error) {
    logger.error('Get user projects error:', error);
    throw error;
  }
};

// Get project with full details
const getProjectWithDetails = async (projectId, userId) => {
  try {
    // Get project
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    
    if (projectResult.rows.length === 0) {
      return null;
    }
    
    const project = projectResult.rows[0];
    
    // Get links
    const linksResult = await query(
      'SELECT * FROM project_links WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    
    // Get articles
    const articlesResult = await query(
      'SELECT * FROM project_articles WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    
    return {
      ...project,
      links: linksResult.rows,
      articles: articlesResult.rows
    };
  } catch (error) {
    logger.error('Get project with details error:', error);
    throw error;
  }
};

// Create new project
const createProject = async (data) => {
  try {
    const { name, description, userId } = data;
    
    const result = await query(
      'INSERT INTO projects (name, description, user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, userId]
    );
    
    return result.rows[0];
  } catch (error) {
    logger.error('Create project error:', error);
    throw error;
  }
};

// Update project
const updateProject = async (projectId, userId, data) => {
  try {
    const { name, description } = data;
    
    const result = await query(
      'UPDATE projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, description, projectId, userId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Update project error:', error);
    throw error;
  }
};

// Delete project
const deleteProject = async (projectId, userId) => {
  try {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [projectId, userId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Delete project error:', error);
    throw error;
  }
};

module.exports = {
  getUserProjects,
  getProjectWithDetails,
  createProject,
  updateProject,
  deleteProject
};