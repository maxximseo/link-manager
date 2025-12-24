/**
 * Rental Routes
 * API endpoints for site slot rentals
 */

const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rental.controller');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiters
const rentalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: 'Слишком много запросов. Попробуйте позже.' }
});

const createRentalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 creates per minute
  message: { error: 'Слишком много запросов на создание аренды.' }
});

// All rental routes require authentication
router.use(authMiddleware);

/**
 * @route   POST /api/rentals
 * @desc    Create a slot rental (owner creates for tenant)
 * @access  Private
 * @body    { siteId, tenantUsername, slotsCount, pricePerSlot? }
 */
router.post('/', createRentalLimiter, rentalController.createRental);

/**
 * @route   GET /api/rentals
 * @desc    Get user's rentals (as owner or tenant)
 * @access  Private
 * @query   role=owner|tenant (default: tenant)
 */
router.get('/', rentalLimiter, rentalController.getUserRentals);

/**
 * @route   GET /api/rentals/:siteId/available
 * @desc    Check available rental slots for a site
 * @access  Private
 * @returns { hasRental, data: { slotsTotal, slotsUsed, slotsAvailable, expiresAt } }
 */
router.get('/:siteId/available', rentalLimiter, rentalController.getAvailableSlots);

/**
 * @route   GET /api/rentals/site/:siteId
 * @desc    Get all rentals for a specific site (owner view)
 * @access  Private (site owner only)
 */
router.get('/site/:siteId', rentalLimiter, rentalController.getSiteRentals);

/**
 * @route   POST /api/rentals/:id/renew
 * @desc    Renew a rental (tenant renews)
 * @access  Private (tenant only)
 */
router.post('/:id/renew', createRentalLimiter, rentalController.renewRental);

/**
 * @route   DELETE /api/rentals/:id
 * @desc    Cancel a rental (owner cancels, only if slots_used=0)
 * @access  Private (owner only)
 */
router.delete('/:id', rentalLimiter, rentalController.cancelRental);

module.exports = router;
