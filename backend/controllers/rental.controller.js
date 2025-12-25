/**
 * Rental Controller
 * Handles site slot rental operations
 */

const billingService = require('../services/billing.service');
const logger = require('../config/logger');

/**
 * Create a slot rental (Owner creates for tenant)
 * POST /api/rentals
 */
const createRental = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { siteId, tenantUsername, slotsCount, pricePerSlot } = req.body;

    // Validate required fields
    if (!siteId || !tenantUsername || !slotsCount) {
      return res.status(400).json({
        error: 'Необходимо указать siteId, tenantUsername и slotsCount'
      });
    }

    // Validate slotsCount
    const slots = parseInt(slotsCount);
    if (isNaN(slots) || slots < 1) {
      return res.status(400).json({
        error: 'Количество слотов должно быть больше 0'
      });
    }

    // Validate pricePerSlot if provided
    let price = pricePerSlot;
    if (price !== undefined) {
      price = parseFloat(price);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({
          error: 'Цена за слот не может быть отрицательной'
        });
      }
    }

    const result = await billingService.createSlotRental(
      ownerId,
      parseInt(siteId),
      tenantUsername.trim(),
      slots,
      price
    );

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Create rental error:', error);

    // Handle specific errors
    if (
      error.message.includes('не владеете') ||
      error.message.includes('не найден') ||
      error.message.includes('Недостаточно') ||
      error.message.includes('нельзя')
    ) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при создании аренды' });
  }
};

/**
 * Get user's rentals (as owner or tenant)
 * GET /api/rentals?role=owner|tenant
 */
const getUserRentals = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.query.role || 'tenant'; // Default to tenant view

    if (!['owner', 'tenant'].includes(role)) {
      return res.status(400).json({
        error: 'Параметр role должен быть owner или tenant'
      });
    }

    const rentals = await billingService.getUserSlotRentals(userId, role);

    res.json({
      success: true,
      data: rentals
    });
  } catch (error) {
    logger.error('Get user rentals error:', error);
    res.status(500).json({ error: 'Ошибка при получении аренд' });
  }
};

/**
 * Check available rental slots for a site (for current user)
 * GET /api/rentals/:siteId/available
 */
const getAvailableSlots = async (req, res) => {
  try {
    const userId = req.user.id;
    const siteId = parseInt(req.params.siteId);

    if (isNaN(siteId)) {
      return res.status(400).json({ error: 'Неверный siteId' });
    }

    const rental = await billingService.getActiveRentalForSite(userId, siteId);

    if (!rental) {
      return res.json({
        success: true,
        hasRental: false,
        data: null
      });
    }

    res.json({
      success: true,
      hasRental: true,
      data: {
        rentalId: rental.id,
        slotsTotal: rental.slots_count,
        slotsUsed: rental.slots_used,
        slotsAvailable: rental.slots_count - rental.slots_used,
        expiresAt: rental.expires_at
      }
    });
  } catch (error) {
    logger.error('Get available slots error:', error);
    res.status(500).json({ error: 'Ошибка при проверке арендных слотов' });
  }
};

/**
 * Renew a rental (tenant renews)
 * POST /api/rentals/:id/renew
 */
const renewRental = async (req, res) => {
  try {
    const tenantId = req.user.id;
    const rentalId = parseInt(req.params.id);

    if (isNaN(rentalId)) {
      return res.status(400).json({ error: 'Неверный rentalId' });
    }

    const result = await billingService.renewSlotRental(tenantId, rentalId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Renew rental error:', error);

    if (
      error.message.includes('не найдена') ||
      error.message.includes('Недостаточно') ||
      error.message.includes('истекла')
    ) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при продлении аренды' });
  }
};

/**
 * Cancel a rental (owner cancels)
 * DELETE /api/rentals/:id
 */
const cancelRental = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const rentalId = parseInt(req.params.id);

    if (isNaN(rentalId)) {
      return res.status(400).json({ error: 'Неверный rentalId' });
    }

    const result = await billingService.cancelSlotRental(ownerId, rentalId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Cancel rental error:', error);

    if (
      error.message.includes('не найдена') ||
      error.message.includes('не владеете') ||
      error.message.includes('используются')
    ) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при отмене аренды' });
  }
};

/**
 * Get rentals for a specific site (owner view)
 * GET /api/rentals/site/:siteId
 */
const getSiteRentals = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const siteId = parseInt(req.params.siteId);

    if (isNaN(siteId)) {
      return res.status(400).json({ error: 'Неверный siteId' });
    }

    const rentals = await billingService.getSiteRentals(siteId, ownerId);

    res.json({
      success: true,
      data: rentals
    });
  } catch (error) {
    logger.error('Get site rentals error:', error);

    if (error.message.includes('не владеете')) {
      return res.status(403).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при получении аренд сайта' });
  }
};

/**
 * Toggle auto-renewal for a rental (tenant only)
 * PATCH /api/rentals/:id/auto-renewal
 */
const toggleAutoRenewal = async (req, res) => {
  try {
    const tenantId = req.user.id;
    const rentalId = parseInt(req.params.id);
    const { enabled } = req.body;

    if (isNaN(rentalId)) {
      return res.status(400).json({ error: 'Неверный rentalId' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Параметр enabled должен быть boolean' });
    }

    const result = await billingService.toggleRentalAutoRenewal(tenantId, rentalId, enabled);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Toggle auto-renewal error:', error);

    if (error.message.includes('не найдена') || error.message.includes('недостаточно прав')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при изменении авто-продления' });
  }
};

/**
 * Approve a pending rental (tenant approves)
 * POST /api/rentals/:id/approve
 */
const approveRental = async (req, res) => {
  try {
    const tenantId = req.user.id;
    const rentalId = parseInt(req.params.id);

    if (isNaN(rentalId)) {
      return res.status(400).json({ error: 'Неверный rentalId' });
    }

    const result = await billingService.approveSlotRental(tenantId, rentalId);

    res.json({
      success: true,
      message: 'Аренда подтверждена',
      data: result
    });
  } catch (error) {
    logger.error('Approve rental error:', error);

    if (
      error.message.includes('не найдена') ||
      error.message.includes('Недостаточно') ||
      error.message.includes('уже обработана')
    ) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при подтверждении аренды' });
  }
};

/**
 * Reject a pending rental (tenant rejects)
 * POST /api/rentals/:id/reject
 */
const rejectRental = async (req, res) => {
  try {
    const tenantId = req.user.id;
    const rentalId = parseInt(req.params.id);

    if (isNaN(rentalId)) {
      return res.status(400).json({ error: 'Неверный rentalId' });
    }

    const result = await billingService.rejectSlotRental(tenantId, rentalId);

    res.json({
      success: true,
      message: 'Запрос на аренду отклонён',
      data: result
    });
  } catch (error) {
    logger.error('Reject rental error:', error);

    if (error.message.includes('не найдена') || error.message.includes('уже обработана')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Ошибка при отклонении аренды' });
  }
};

module.exports = {
  createRental,
  getUserRentals,
  getAvailableSlots,
  renewRental,
  cancelRental,
  getSiteRentals,
  toggleAutoRenewal,
  approveRental,
  rejectRental
};
