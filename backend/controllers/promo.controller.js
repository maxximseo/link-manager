/**
 * Promo Code Controller
 * Handles HTTP requests for promo code operations
 */

const promoService = require('../services/promo.service');
const logger = require('../config/logger');

/**
 * Validate a promo code
 * GET /api/promo/validate?code=XXX
 * Available to all authenticated users
 */
const validatePromo = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ valid: false, error: 'Промокод обязателен' });
    }

    const result = await promoService.validatePromoCode(code, req.user.id);
    return res.json(result);
  } catch (error) {
    logger.error('Validate promo error:', error);
    return res.status(500).json({ valid: false, error: 'Ошибка проверки промокода' });
  }
};

/**
 * Create a new promo code
 * POST /api/promo
 * Admin only
 */
const createPromo = async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const { code, ownerUserId, bonusAmount, partnerReward, minDeposit, maxUses, expiresAt } =
      req.body;

    // Validate required fields
    if (!code || code.trim().length === 0) {
      return res.status(400).json({ error: 'Код промокода обязателен' });
    }

    if (code.length > 50) {
      return res.status(400).json({ error: 'Код промокода не может быть длиннее 50 символов' });
    }

    // Check if code already exists
    const exists = await promoService.promoCodeExists(code);
    if (exists) {
      return res.status(400).json({ error: 'Такой промокод уже существует' });
    }

    // Create the promo code
    const promo = await promoService.createPromoCode({
      code: code.trim(),
      ownerUserId: ownerUserId || null,
      bonusAmount: bonusAmount || 100,
      partnerReward: partnerReward || 50,
      minDeposit: minDeposit || 100,
      maxUses: maxUses || 0,
      expiresAt: expiresAt || null
    });

    logger.info(`Admin ${req.user.username} created promo code: ${code}`);

    return res.status(201).json({
      success: true,
      data: {
        id: promo.id,
        code: promo.code,
        ownerUserId: promo.owner_user_id,
        bonusAmount: parseFloat(promo.bonus_amount),
        partnerReward: parseFloat(promo.partner_reward),
        minDeposit: parseFloat(promo.min_deposit),
        maxUses: promo.max_uses,
        currentUses: promo.current_uses,
        isActive: promo.is_active,
        expiresAt: promo.expires_at,
        createdAt: promo.created_at
      }
    });
  } catch (error) {
    logger.error('Create promo error:', error);
    if (error.code === '23505') {
      // PostgreSQL unique violation
      return res.status(400).json({ error: 'Такой промокод уже существует' });
    }
    return res.status(500).json({ error: 'Ошибка создания промокода' });
  }
};

/**
 * List all promo codes
 * GET /api/promo
 * Admin only
 */
const listPromos = async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const promos = await promoService.getAllPromoCodes();

    return res.json({
      success: true,
      data: promos.map(p => ({
        id: p.id,
        code: p.code,
        ownerUserId: p.owner_user_id,
        ownerUsername: p.owner_username,
        bonusAmount: parseFloat(p.bonus_amount),
        partnerReward: parseFloat(p.partner_reward),
        minDeposit: parseFloat(p.min_deposit),
        maxUses: p.max_uses,
        currentUses: p.current_uses,
        totalActivations: parseInt(p.total_activations) || 0,
        isActive: p.is_active,
        expiresAt: p.expires_at,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }))
    });
  } catch (error) {
    logger.error('List promos error:', error);
    return res.status(500).json({ error: 'Ошибка получения промокодов' });
  }
};

/**
 * Deactivate a promo code
 * DELETE /api/promo/:id
 * Admin only
 */
const deactivatePromo = async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const { id } = req.params;

    // Check if promo exists
    const promo = await promoService.getPromoCodeById(id);
    if (!promo) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }

    await promoService.deactivatePromoCode(id);

    logger.info(`Admin ${req.user.username} deactivated promo code: ${promo.code}`);

    return res.json({ success: true, message: 'Промокод деактивирован' });
  } catch (error) {
    logger.error('Deactivate promo error:', error);
    return res.status(500).json({ error: 'Ошибка деактивации промокода' });
  }
};

/**
 * Activate a promo code
 * PUT /api/promo/:id/activate
 * Admin only
 */
const activatePromo = async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const { id } = req.params;

    // Check if promo exists
    const promo = await promoService.getPromoCodeById(id);
    if (!promo) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }

    await promoService.activatePromoCode(id);

    logger.info(`Admin ${req.user.username} activated promo code: ${promo.code}`);

    return res.json({ success: true, message: 'Промокод активирован' });
  } catch (error) {
    logger.error('Activate promo error:', error);
    return res.status(500).json({ error: 'Ошибка активации промокода' });
  }
};

/**
 * Get a single promo code by ID
 * GET /api/promo/:id
 * Admin only
 */
const getPromo = async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const { id } = req.params;
    const promo = await promoService.getPromoCodeById(id);

    if (!promo) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }

    return res.json({
      success: true,
      data: {
        id: promo.id,
        code: promo.code,
        ownerUserId: promo.owner_user_id,
        ownerUsername: promo.owner_username,
        bonusAmount: parseFloat(promo.bonus_amount),
        partnerReward: parseFloat(promo.partner_reward),
        minDeposit: parseFloat(promo.min_deposit),
        maxUses: promo.max_uses,
        currentUses: promo.current_uses,
        isActive: promo.is_active,
        expiresAt: promo.expires_at,
        createdAt: promo.created_at,
        updatedAt: promo.updated_at
      }
    });
  } catch (error) {
    logger.error('Get promo error:', error);
    return res.status(500).json({ error: 'Ошибка получения промокода' });
  }
};

module.exports = {
  validatePromo,
  createPromo,
  listPromos,
  deactivatePromo,
  activatePromo,
  getPromo
};
