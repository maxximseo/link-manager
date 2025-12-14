/**
 * Promo Code Routes
 * API endpoints for promo code management
 */

const express = require('express');
const router = express.Router();
const promoController = require('../controllers/promo.controller');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Validate promo code (available to all authenticated users)
// GET /api/promo/validate?code=XXX
router.get('/validate', promoController.validatePromo);

// Admin-only endpoints
// POST /api/promo - Create new promo code
router.post('/', promoController.createPromo);

// GET /api/promo - List all promo codes
router.get('/', promoController.listPromos);

// GET /api/promo/:id - Get single promo code
router.get('/:id', promoController.getPromo);

// PUT /api/promo/:id/activate - Activate promo code
router.put('/:id/activate', promoController.activatePromo);

// DELETE /api/promo/:id - Deactivate promo code
router.delete('/:id', promoController.deactivatePromo);

module.exports = router;
