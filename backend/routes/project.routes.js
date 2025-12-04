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
  message: 'Too many create requests, please try again later.'
});

// General API rate limiting (100 req/min)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Project CRUD routes
router.get('/', authMiddleware, apiLimiter, projectController.getProjects);
router.get('/:id', authMiddleware, apiLimiter, projectController.getProject);
router.post('/', authMiddleware, createLimiter, projectController.createProject);
router.put('/:id', authMiddleware, apiLimiter, projectController.updateProject);
router.delete('/:id', authMiddleware, apiLimiter, projectController.deleteProject);

// Project links routes
router.get('/:id/links', authMiddleware, apiLimiter, projectController.getProjectLinks);
router.post('/:id/links', authMiddleware, createLimiter, projectController.addProjectLink);
router.put('/:id/links/:linkId', authMiddleware, apiLimiter, projectController.updateProjectLink);
router.post(
  '/:id/links/bulk',
  authMiddleware,
  createLimiter,
  projectController.addProjectLinksBulk
);
router.delete('/:id/links/:linkId', authMiddleware, apiLimiter, projectController.deleteProjectLink);

// Project articles routes
router.get('/:id/articles', authMiddleware, apiLimiter, projectController.getProjectArticles);
router.post('/:id/articles', authMiddleware, createLimiter, projectController.addProjectArticle);
router.put('/:id/articles/:articleId', authMiddleware, apiLimiter, projectController.updateProjectArticle);
router.delete('/:id/articles/:articleId', authMiddleware, apiLimiter, projectController.deleteProjectArticle);

module.exports = router;
