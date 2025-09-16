/**
 * Project routes
 * Handles project CRUD operations and related functionality
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const projectController = require('../controllers/project.controller');

// Rate limiting for create operations
const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many create requests, please try again later.',
});

// Project CRUD routes
router.get('/', authMiddleware, projectController.getProjects);
router.get('/:id', authMiddleware, projectController.getProject);
router.post('/', authMiddleware, createLimiter, projectController.createProject);
router.put('/:id', authMiddleware, projectController.updateProject);
router.delete('/:id', authMiddleware, projectController.deleteProject);

// Project links routes
router.get('/:id/links', authMiddleware, projectController.getProjectLinks);
router.post('/:id/links', authMiddleware, createLimiter, projectController.addProjectLink);
router.post('/:id/links/bulk', authMiddleware, createLimiter, projectController.addProjectLinksBulk);
router.delete('/:id/links/:linkId', authMiddleware, projectController.deleteProjectLink);

// Project articles routes
router.get('/:id/articles', authMiddleware, projectController.getProjectArticles);
router.post('/:id/articles', authMiddleware, createLimiter, projectController.addProjectArticle);
router.put('/:id/articles/:articleId', authMiddleware, projectController.updateProjectArticle);
router.delete('/:id/articles/:articleId', authMiddleware, projectController.deleteProjectArticle);

module.exports = router;