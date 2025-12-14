/**
 * Promo Code Service
 * Handles promo code validation, creation, and management
 */

const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Validate a promo code for a specific user
 * @param {string} code - The promo code to validate
 * @param {number} userId - The user attempting to use the code
 * @returns {Object} - { valid: boolean, promo?: Object, error?: string }
 */
const validatePromoCode = async (code, userId) => {
  try {
    // Find the promo code with owner info
    const result = await query(
      `
      SELECT pc.*, u.username as owner_username
      FROM promo_codes pc
      LEFT JOIN users u ON pc.owner_user_id = u.id
      WHERE UPPER(pc.code) = UPPER($1) AND pc.is_active = true
    `,
      [code]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'Промокод не найден или неактивен' };
    }

    const promo = result.rows[0];

    // Check expiration
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return { valid: false, error: 'Срок действия промокода истёк' };
    }

    // Check usage limit
    if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
      return { valid: false, error: 'Промокод исчерпан' };
    }

    // Check if user is the owner (can't use own code)
    if (promo.owner_user_id === userId) {
      return { valid: false, error: 'Нельзя использовать свой собственный промокод' };
    }

    // Check if user already received a referral bonus
    const userCheck = await query(
      'SELECT referral_bonus_received, activated_promo_code_id FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows[0]?.referral_bonus_received) {
      return { valid: false, error: 'Вы уже получили реферальный бонус' };
    }

    return {
      valid: true,
      promo: {
        id: promo.id,
        code: promo.code,
        bonusAmount: parseFloat(promo.bonus_amount),
        partnerReward: parseFloat(promo.partner_reward),
        minDeposit: parseFloat(promo.min_deposit),
        ownerUserId: promo.owner_user_id,
        ownerUsername: promo.owner_username
      }
    };
  } catch (error) {
    logger.error('Validate promo code error:', error);
    throw error;
  }
};

/**
 * Create a new promo code (admin only)
 * @param {Object} data - Promo code data
 * @returns {Object} - Created promo code record
 */
const createPromoCode = async data => {
  const {
    code,
    ownerUserId,
    bonusAmount = 100,
    partnerReward = 50,
    minDeposit = 100,
    maxUses = 0,
    expiresAt = null
  } = data;

  try {
    const result = await query(
      `
      INSERT INTO promo_codes (code, owner_user_id, bonus_amount, partner_reward, min_deposit, max_uses, expires_at)
      VALUES (UPPER($1), $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [code, ownerUserId, bonusAmount, partnerReward, minDeposit, maxUses, expiresAt]
    );

    logger.info(`Promo code created: ${code} by owner ${ownerUserId}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Create promo code error:', error);
    throw error;
  }
};

/**
 * Get all promo codes with usage statistics (admin only)
 * @returns {Array} - List of all promo codes
 */
const getAllPromoCodes = async () => {
  try {
    const result = await query(`
      SELECT pc.*,
             u.username as owner_username,
             (SELECT COUNT(*) FROM users WHERE activated_promo_code_id = pc.id) as total_activations
      FROM promo_codes pc
      LEFT JOIN users u ON pc.owner_user_id = u.id
      ORDER BY pc.created_at DESC
    `);
    return result.rows;
  } catch (error) {
    logger.error('Get all promo codes error:', error);
    throw error;
  }
};

/**
 * Get promo code by ID
 * @param {number} promoId - Promo code ID
 * @returns {Object|null} - Promo code record or null
 */
const getPromoCodeById = async promoId => {
  try {
    const result = await query(
      `
      SELECT pc.*, u.username as owner_username
      FROM promo_codes pc
      LEFT JOIN users u ON pc.owner_user_id = u.id
      WHERE pc.id = $1
    `,
      [promoId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Get promo code by ID error:', error);
    throw error;
  }
};

/**
 * Deactivate a promo code (admin only)
 * @param {number} promoId - Promo code ID to deactivate
 */
const deactivatePromoCode = async promoId => {
  try {
    await query('UPDATE promo_codes SET is_active = false, updated_at = NOW() WHERE id = $1', [
      promoId
    ]);
    logger.info(`Promo code ${promoId} deactivated`);
  } catch (error) {
    logger.error('Deactivate promo code error:', error);
    throw error;
  }
};

/**
 * Activate a promo code (admin only)
 * @param {number} promoId - Promo code ID to activate
 */
const activatePromoCode = async promoId => {
  try {
    await query('UPDATE promo_codes SET is_active = true, updated_at = NOW() WHERE id = $1', [
      promoId
    ]);
    logger.info(`Promo code ${promoId} activated`);
  } catch (error) {
    logger.error('Activate promo code error:', error);
    throw error;
  }
};

/**
 * Update promo code usage count
 * @param {number} promoId - Promo code ID
 */
const incrementPromoUsage = async promoId => {
  try {
    await query(
      'UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1',
      [promoId]
    );
  } catch (error) {
    logger.error('Increment promo usage error:', error);
    throw error;
  }
};

/**
 * Get promo codes owned by a user
 * @param {number} userId - User ID
 * @returns {Array} - List of promo codes owned by user
 */
const getUserPromoCodes = async userId => {
  try {
    const result = await query(
      `
      SELECT pc.*,
             (SELECT COUNT(*) FROM users WHERE activated_promo_code_id = pc.id) as total_activations
      FROM promo_codes pc
      WHERE pc.owner_user_id = $1
      ORDER BY pc.created_at DESC
    `,
      [userId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Get user promo codes error:', error);
    throw error;
  }
};

/**
 * Check if a promo code already exists
 * @param {string} code - The code to check
 * @returns {boolean} - True if exists
 */
const promoCodeExists = async code => {
  try {
    const result = await query('SELECT id FROM promo_codes WHERE UPPER(code) = UPPER($1)', [code]);
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Promo code exists check error:', error);
    throw error;
  }
};

module.exports = {
  validatePromoCode,
  createPromoCode,
  getAllPromoCodes,
  getPromoCodeById,
  deactivatePromoCode,
  activatePromoCode,
  incrementPromoUsage,
  getUserPromoCodes,
  promoCodeExists
};
