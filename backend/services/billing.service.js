/**
 * Billing service
 * Handles all billing operations: balance management, transactions, discounts, purchases, renewals
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');
const cache = require('./cache.service');
const wordpressService = require('./wordpress.service');
const wordpressRentalService = require('./wordpress-rental.service');
const { checkAnomalousTransaction } = require('./security-alerts.service');
const promoService = require('./promo.service');

// Pricing constants
const PRICING = {
  LINK_HOMEPAGE: 25.0, // Homepage link placement
  ARTICLE_GUEST_POST: 15.0, // Guest post article placement
  OWNER_RATE: 0.1, // Special rate for placing content on own sites
  BASE_RENEWAL_DISCOUNT: 30, // Base discount for link renewals (30%)
  RENEWAL_PERIOD_DAYS: 365, // Renewal period (1 year)
  MAX_TOTAL_DISCOUNT: 60, // Maximum combined discount (base + personal tier)
  REFERRAL_COMMISSION_RATE: 20 // Referral commission rate (20% of final_price)
};

/**
 * Get user balance and billing info
 */
const getUserBalance = async userId => {
  try {
    // First, get user data including locked bonus columns
    // Using separate queries to avoid Supabase pooler cache issues with schema changes
    const userResult = await query(
      `SELECT id, username, email, balance, current_discount FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // Get locked bonus fields separately (may be newly added columns)
    let lockedBonus = 0;
    let lockedBonusUnlockAmount = 100;
    let lockedBonusUnlocked = false;
    try {
      const lockedResult = await query(
        `SELECT locked_bonus, locked_bonus_unlock_amount, locked_bonus_unlocked FROM users WHERE id = $1`,
        [userId]
      );
      if (lockedResult.rows.length > 0) {
        lockedBonus = parseFloat(lockedResult.rows[0].locked_bonus) || 0;
        lockedBonusUnlockAmount = parseFloat(lockedResult.rows[0].locked_bonus_unlock_amount) || 100;
        lockedBonusUnlocked = lockedResult.rows[0].locked_bonus_unlocked || false;
      }
    } catch (lockedErr) {
      // Columns may not exist yet - use defaults
      logger.warn('Locked bonus columns not found, using defaults', { userId });
    }

    // Get discount tier
    const tierResult = await query(
      `SELECT tier_name, discount_percentage FROM discount_tiers WHERE discount_percentage = $1`,
      [user.current_discount]
    );
    const tier = tierResult.rows[0] || { tier_name: 'Стандарт', discount_percentage: 0 };

    // Get total spent
    const spentResult = await query(
      `SELECT
        GREATEST(0, COALESCE(ABS((
          SELECT SUM(amount) FROM transactions WHERE user_id = $1 AND type IN ('purchase', 'renewal')
        )), 0) - COALESCE((
          SELECT SUM(amount) FROM transactions WHERE user_id = $1 AND type = 'refund'
        ), 0)) as total_spent`,
      [userId]
    );
    const totalSpent = spentResult.rows[0]?.total_spent || 0;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      balance: user.balance,
      current_discount: user.current_discount,
      locked_bonus: lockedBonus.toFixed(2),
      locked_bonus_unlock_amount: lockedBonusUnlockAmount.toFixed(2),
      locked_bonus_unlocked: lockedBonusUnlocked,
      tier_name: tier.tier_name,
      discount_percentage: tier.discount_percentage,
      total_spent: totalSpent
    };
  } catch (error) {
    logger.error('Failed to get user balance', { userId, error: error.message });
    throw error;
  }
};

/**
 * Calculate discount tier based on total spent
 */
const calculateDiscountTier = async totalSpent => {
  try {
    const result = await query(
      `
      SELECT discount_percentage, tier_name
      FROM discount_tiers
      WHERE min_spent <= $1
      ORDER BY min_spent DESC
      LIMIT 1
    `,
      [totalSpent]
    );

    if (result.rows.length === 0) {
      return { discount: 0, tier: 'Стандарт' };
    }

    return {
      discount: result.rows[0].discount_percentage,
      tier: result.rows[0].tier_name
    };
  } catch (error) {
    logger.error('Failed to calculate discount tier', { totalSpent, error: error.message });
    throw error;
  }
};

/**
 * Get all discount tiers
 */
const getDiscountTiers = async () => {
  try {
    const result = await query(`
      SELECT tier_name, min_spent, discount_percentage
      FROM discount_tiers
      ORDER BY min_spent ASC
    `);

    return result.rows;
  } catch (error) {
    logger.error('Failed to get discount tiers', { error: error.message });
    throw error;
  }
};

/**
 * Add balance to user account (deposit)
 *
 * NEW REFERRAL/PROMO CODE BONUS LOGIC (v2.7.0):
 * - On FIRST deposit >= $100:
 *   - If user has referrer (referred_by_user_id) OR valid promo code:
 *     - User gets +$100 bonus
 *     - Partner (referrer or promo code owner) gets +$50 to referral_balance
 *   - referral_bonus_received = true (prevents duplicate bonuses)
 *
 * @param {number} userId - User ID
 * @param {number} amount - Deposit amount
 * @param {string} description - Transaction description
 * @param {number|null} adminId - Admin ID if deposit is made by admin
 * @param {string|null} promoCode - Optional promo code for bonus activation
 */
const addBalance = async (userId, amount, description = 'Пополнение баланса', adminId = null, promoCode = null) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get user with lock (including referral bonus fields)
    const userResult = await client.query(
      `SELECT id, username, balance, referred_by_user_id, referral_bonus_received, activated_promo_code_id
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found');
    }

    const depositAmount = parseFloat(amount);
    let bonusAmount = 0;
    let partnerReward = 0;
    let partnerId = null;
    let promoId = null;
    let bonusApplied = false;

    // Check if user is eligible for first-deposit bonus
    // Conditions: deposit >= $100 AND bonus not yet received AND (has referrer OR valid promo code)
    const MIN_DEPOSIT_FOR_BONUS = 100;
    const USER_BONUS = 100; // Бонус пользователю
    const PARTNER_REWARD = 50; // Награда партнёру

    if (!user.referral_bonus_received && depositAmount >= MIN_DEPOSIT_FOR_BONUS) {
      // Option 1: Promo code provided
      if (promoCode && promoCode.trim()) {
        const promoValidation = await promoService.validatePromoCode(promoCode, userId);

        if (promoValidation.valid) {
          const promo = promoValidation.promo;
          bonusAmount = promo.bonusAmount || USER_BONUS;
          partnerReward = promo.partnerReward || PARTNER_REWARD;
          partnerId = promo.ownerUserId;
          promoId = promo.id;
          bonusApplied = true;

          logger.info('Promo code bonus applied', {
            userId,
            promoCode,
            promoId,
            bonusAmount,
            partnerReward,
            partnerId
          });
        } else {
          // Invalid promo code - log but continue with deposit (no bonus)
          logger.warn('Invalid promo code provided during deposit', {
            userId,
            promoCode,
            error: promoValidation.error
          });
        }
      }
      // Option 2: User was referred (has referred_by_user_id)
      else if (user.referred_by_user_id) {
        bonusAmount = USER_BONUS;
        partnerReward = PARTNER_REWARD;
        partnerId = user.referred_by_user_id;
        bonusApplied = true;

        logger.info('Referral bonus applied', {
          userId,
          referrerId: partnerId,
          bonusAmount,
          partnerReward
        });
      }
    }

    // Calculate new balance (deposit + optional bonus)
    const newBalance = parseFloat(user.balance) + depositAmount + bonusAmount;

    // Update user balance and referral bonus status
    if (bonusApplied) {
      await client.query(
        `UPDATE users
         SET balance = $1,
             referral_bonus_received = true,
             referral_activated_at = NOW(),
             activated_promo_code_id = $2
         WHERE id = $3`,
        [newBalance, promoId, userId]
      );
    } else {
      await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
    }

    // Create transaction record (deposit amount only, bonus is separate)
    const metadata = adminId ? { added_by_admin: adminId } : {};
    if (bonusApplied) {
      metadata.bonus_amount = bonusAmount;
      metadata.promo_code_id = promoId;
      metadata.partner_id = partnerId;
    }

    await client.query(
      `INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, metadata
      )
      VALUES ($1, 'deposit', $2, $3, $4, $5, $6)`,
      [userId, depositAmount, user.balance, newBalance, description, JSON.stringify(metadata)]
    );

    // If bonus was applied, credit partner and create notifications
    if (bonusApplied && partnerId && partnerReward > 0) {
      // Credit partner's referral_balance
      await client.query(
        `UPDATE users
         SET referral_balance = referral_balance + $1,
             total_referral_earnings = total_referral_earnings + $1
         WHERE id = $2`,
        [partnerReward, partnerId]
      );

      // Record referral transaction
      await client.query(
        `INSERT INTO referral_transactions (
          referrer_id, referee_id, transaction_amount, commission_rate, commission_amount, status
        ) VALUES ($1, $2, $3, $4, $5, 'credited')`,
        [partnerId, userId, depositAmount, 0, partnerReward]
      );

      // Increment promo code usage if used
      if (promoId) {
        await promoService.incrementPromoUsage(promoId);
      }

      // Notification for user about bonus
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         VALUES ($1, 'referral_bonus_received', $2, $3, $4)`,
        [
          userId,
          'Бонус получен! 🎁',
          `Поздравляем! Вы получили бонус +$${bonusAmount} за первое пополнение! Ваш новый баланс: $${newBalance.toFixed(2)}`,
          JSON.stringify({ bonusAmount, depositAmount, promoCodeId: promoId })
        ]
      );

      // Notification for partner about reward
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         VALUES ($1, 'referral_activated', $2, $3, $4)`,
        [
          partnerId,
          'Реферал активирован! 💰',
          `Ваш реферал совершил первый депозит! Вам начислено $${partnerReward} на реферальный баланс.`,
          JSON.stringify({ refereeId: userId, reward: partnerReward, promoCodeId: promoId })
        ]
      );

      logger.info('Referral bonus processed', {
        userId,
        partnerId,
        userBonus: bonusAmount,
        partnerReward,
        promoCodeId: promoId
      });
    } else {
      // Standard deposit notification (no bonus)
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'balance_deposited', $2, $3)`,
        [
          userId,
          'Баланс пополнен',
          `Ваш баланс пополнен на $${depositAmount}. Новый баланс: $${newBalance.toFixed(2)}`
        ]
      );
    }

    await client.query('COMMIT');

    // SECURITY: Check for anomalous deposit amounts (async, don't block response)
    checkAnomalousTransaction(userId, depositAmount, 'deposit').catch(err =>
      logger.error('Failed to check anomalous transaction', { err: err.message })
    );

    logger.info('Balance added successfully', {
      userId,
      depositAmount,
      bonusAmount,
      totalAdded: depositAmount + bonusAmount,
      newBalance
    });

    return {
      success: true,
      newBalance,
      amount: depositAmount,
      bonusAmount,
      totalAdded: depositAmount + bonusAmount,
      bonusApplied
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to add balance', { userId, amount, promoCode, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Purchase placement (link or article)
 */
const purchasePlacement = async ({
  userId,
  projectId,
  siteId,
  type, // 'link' or 'article'
  contentIds, // Array of link/article IDs
  scheduledDate, // Optional: scheduled publish date (ISO string)
  autoRenewal = false,
  useRentalSlot = false // Optional: use rented slot (free placement)
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get user with lock
    const userResult = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found');
    }

    // 2. Validate project ownership
    const projectResult = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found or unauthorized');
    }

    // 3. Validate site exists AND lock for quota check (prevent race condition)
    const siteResult = await client.query('SELECT * FROM sites WHERE id = $1 FOR UPDATE', [siteId]);

    if (siteResult.rows.length === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];

    // 3.1. NEW: Check site visibility authorization
    // User can purchase if:
    // - Site is public (is_public = TRUE), OR
    // - User owns the site (site.user_id === userId)
    if (!site.is_public && site.user_id !== userId) {
      throw new Error(
        `Сайт "${site.site_name}" приватный. ` +
          `Только владелец может размещать контент на приватных сайтах.`
      );
    }

    // 3.5. Validate site type - static_php sites cannot purchase articles
    if (site.site_type === 'static_php' && type === 'article') {
      throw new Error(
        `Site "${site.site_name}" is a static PHP site and does not support article placements. ` +
          `Static PHP sites can only purchase link placements.`
      );
    }

    // 3.6. Validate allow_articles flag - check if site allows article placements
    if (type === 'article' && !site.allow_articles) {
      throw new Error(
        `Site "${site.site_name}" does not allow article placements. ` +
          `The site owner has disabled article purchases. Only link placements are permitted on this site.`
      );
    }

    // 3.7. Validate available_for_purchase flag - check if site is open for new placements
    if (site.available_for_purchase === false) {
      throw new Error(
        `Site "${site.site_name}" is not available for purchase. ` +
          `The site owner has temporarily closed this site for new placements.`
      );
    }

    // 4. CRITICAL FIX (BUG #5): Check site quotas BEFORE creating placement (with lock to prevent race condition)
    if (type === 'link' && site.used_links >= site.max_links) {
      throw new Error(
        `Site "${site.site_name}" has reached its link limit (${site.used_links}/${site.max_links} used). ` +
          `Cannot create new link placement.`
      );
    }

    if (type === 'article' && site.used_articles >= site.max_articles) {
      throw new Error(
        `Site "${site.site_name}" has reached its article limit (${site.used_articles}/${site.max_articles} used). ` +
          `Cannot create new article placement.`
      );
    }

    // 5. Check if placement already exists for this project/site combination
    const existingPlacement = await client.query(
      `
      SELECT id FROM placements
      WHERE project_id = $1 AND site_id = $2 AND type = $3 AND status NOT IN ('cancelled', 'expired')
    `,
      [projectId, siteId, type]
    );

    if (existingPlacement.rows.length > 0) {
      throw new Error(`A ${type} placement already exists for this project on this site`);
    }

    // 4.5. CRITICAL: Validate content IDs BEFORE charging money

    // CRITICAL FIX (BUG #7): Enforce single contentId per placement (business logic: 1 link/article per site)
    if (!contentIds || contentIds.length === 0) {
      throw new Error('At least one content ID is required');
    }

    if (contentIds.length > 1) {
      throw new Error(
        `You can only place 1 ${type} per site per project. ` +
          `You provided ${contentIds.length} ${type}s. ` +
          `Please create separate placements for each ${type}.`
      );
    }

    // OPTIMIZATION: Batch content validation (1 query instead of N queries)
    // OLD: for-loop with N queries (200-300ms per item)
    // NEW: Single query with ANY operator (50ms total)
    const tableName = type === 'link' ? 'project_links' : 'project_articles';

    const contentResult = await client.query(
      `
      SELECT id, project_id, usage_count, usage_limit, status,
             ${type === 'link' ? 'anchor_text, url' : 'title'}
      FROM ${tableName}
      WHERE id = ANY($1::int[])
      FOR UPDATE
    `,
      [contentIds]
    );

    // TEST 1: Non-existent contentId
    if (contentResult.rows.length !== contentIds.length) {
      const foundIds = contentResult.rows.map(r => r.id);
      const missingIds = contentIds.filter(id => !foundIds.includes(id));
      throw new Error(
        `${type === 'link' ? 'Link' : 'Article'} with ID(s) ${missingIds.join(', ')} not found`
      );
    }

    // Validate each content item
    for (const content of contentResult.rows) {
      // TEST 2: Ownership validation - content must belong to the same project
      if (content.project_id !== projectId) {
        throw new Error(
          `${type === 'link' ? 'Link' : 'Article'} with ID ${content.id} does not belong to project ${projectId} (ownership violation)`
        );
      }

      // TEST 4: Exhausted content
      if (content.status === 'exhausted' || content.usage_count >= content.usage_limit) {
        const displayName = type === 'link' ? content.anchor_text : content.title;
        throw new Error(
          `${type === 'link' ? 'Link' : 'Article'} "${displayName}" is exhausted (${content.usage_count}/${content.usage_limit} uses)`
        );
      }
    }

    // 4.6. Check for rental slot usage (only for links)
    let activeRental = null;
    let isRentedPlacement = false;

    if (type === 'link' && useRentalSlot) {
      // Verify user has active rental for this site
      const rentalResult = await client.query(
        `
        SELECT * FROM site_slot_rentals
        WHERE tenant_id = $1 AND site_id = $2 AND status = 'active'
        AND expires_at > NOW()
        FOR UPDATE
        `,
        [userId, siteId]
      );

      if (rentalResult.rows.length === 0) {
        throw new Error(
          `У вас нет активной аренды на сайте "${site.site_name}". ` +
            `Используйте обычную покупку или сначала получите арендные слоты.`
        );
      }

      activeRental = rentalResult.rows[0];

      // Check if rental has available slots
      if (activeRental.slots_used >= activeRental.slots_count) {
        throw new Error(
          `Все арендные слоты использованы (${activeRental.slots_used}/${activeRental.slots_count}). ` +
            `Продлите аренду или используйте обычную покупку.`
        );
      }

      isRentedPlacement = true;
      logger.info('Using rental slot for placement', {
        userId,
        siteId,
        rentalId: activeRental.id,
        slotsAvailable: activeRental.slots_count - activeRental.slots_used
      });
    }

    // 5. Calculate price
    // SPECIAL PRICING PRIORITY:
    // 1. Rented slot → $0 (free, slot already paid for)
    // 2. Own site → $0.10 flat rate
    // 3. Standard pricing with user discount tier
    const isOwnSite = site.user_id === userId;

    let basePrice, discount, finalPrice;

    if (isRentedPlacement) {
      // Rented slot - FREE placement (slot was paid during rental creation)
      basePrice = 0;
      discount = 0;
      finalPrice = 0;
      logger.info('Rental slot pricing applied', {
        userId,
        siteId,
        siteName: site.site_name,
        rentalId: activeRental.id,
        price: 0
      });
    } else if (isOwnSite) {
      // Owner's special rate for both links and articles
      basePrice = PRICING.OWNER_RATE;
      discount = 0;
      finalPrice = PRICING.OWNER_RATE;
      logger.info('Owner pricing applied', {
        userId,
        siteId,
        siteName: site.site_name,
        price: finalPrice
      });
    } else {
      // Standard pricing with user's discount tier
      // Use site-specific price if available, otherwise use default PRICING constants
      if (type === 'link') {
        basePrice =
          site.price_link !== null && site.price_link !== undefined
            ? parseFloat(site.price_link)
            : PRICING.LINK_HOMEPAGE;
      } else {
        basePrice =
          site.price_article !== null && site.price_article !== undefined
            ? parseFloat(site.price_article)
            : PRICING.ARTICLE_GUEST_POST;
      }

      discount = parseFloat(user.current_discount) || 0;
      finalPrice = basePrice * (1 - discount / 100);
    }

    // 7. Check balance
    if (parseFloat(user.balance) < finalPrice) {
      throw new Error(
        `Insufficient balance. Required: $${finalPrice.toFixed(2)}, Available: $${user.balance}`
      );
    }

    // 8. Deduct from balance (skip for free rental placements)
    let newBalance = parseFloat(user.balance);
    let newTotalSpent = parseFloat(user.total_spent);
    let transactionId = null;

    if (finalPrice > 0) {
      newBalance = parseFloat(user.balance) - finalPrice;
      newTotalSpent = parseFloat(user.total_spent) + finalPrice;

      await client.query('UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3', [
        newBalance,
        newTotalSpent,
        userId
      ]);

      // 9. Create transaction (only for paid placements)
      const transactionResult = await client.query(
        `
        INSERT INTO transactions (
          user_id, type, amount, balance_before, balance_after, description, metadata
        )
        VALUES ($1, 'purchase', $2, $3, $4, $5, $6)
        RETURNING id
      `,
        [
          userId,
          -finalPrice,
          user.balance,
          newBalance,
          `Покупка размещения ${type === 'article' ? 'статьи' : 'ссылки'} на ${site.site_name}`,
          JSON.stringify({ type, discount, basePrice, finalPrice, projectId, siteId })
        ]
      );

      transactionId = transactionResult.rows[0].id;
    } else {
      // For free rental placements, log but don't create transaction
      logger.info('Free rental placement - no transaction created', {
        userId,
        siteId,
        rentalId: activeRental?.id
      });
    }

    // 10. Calculate expiry date (only for links)
    let expiresAt = null;
    let renewalPrice = null;

    if (type === 'link') {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + PRICING.RENEWAL_PERIOD_DAYS);
      expiresAt = expiryDate.toISOString();

      // Calculate renewal price
      if (isOwnSite) {
        // Owner's renewal price: same flat rate
        renewalPrice = PRICING.OWNER_RATE;
      } else {
        // Standard renewal: base * (1 - 0.30) * (1 - personalDiscount/100)
        renewalPrice = basePrice * (1 - PRICING.BASE_RENEWAL_DISCOUNT / 100) * (1 - discount / 100);
      }
    }

    // 11. Parse scheduled date and determine moderation status
    let scheduledPublishDate = null;
    let status = 'pending';

    // MODERATION LOGIC:
    // - Links: NO moderation needed - publish immediately
    // - Articles on OWN site or by Admin: NO moderation needed
    // - Articles on SOMEONE ELSE's site: requires admin approval
    const isAdmin = user.role === 'admin';
    // Модерация требуется ТОЛЬКО для статей на чужих сайтах
    const needsApproval = type === 'article' && !isAdmin && !isOwnSite;

    if (scheduledDate) {
      scheduledPublishDate = new Date(scheduledDate);

      // Validate scheduled date (max 90 days in future)
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 90);

      if (scheduledPublishDate > maxDate) {
        throw new Error('Scheduled date cannot be more than 90 days in the future');
      }

      if (scheduledPublishDate > new Date()) {
        status = 'scheduled';
      }
    }

    // Override status if moderation is required
    if (needsApproval) {
      status = 'pending_approval';
      logger.info('Placement requires admin approval', {
        userId,
        siteId,
        siteName: site.site_name,
        siteOwner: site.user_id
      });
    }

    // 12. Create placement
    const placementResult = await client.query(
      `
      INSERT INTO placements (
        user_id, project_id, site_id, type,
        original_price, discount_applied, final_price,
        purchased_at, scheduled_publish_date, expires_at,
        auto_renewal, renewal_price,
        purchase_transaction_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        userId,
        projectId,
        siteId,
        type,
        basePrice,
        discount,
        finalPrice,
        scheduledPublishDate,
        expiresAt,
        autoRenewal,
        renewalPrice,
        transactionId,
        status
      ]
    );

    const placement = placementResult.rows[0];

    // 13. Link content (links or articles)
    for (const contentId of contentIds) {
      const columnName = type === 'link' ? 'link_id' : 'article_id';
      await client.query(
        `
        INSERT INTO placement_content (placement_id, ${columnName})
        VALUES ($1, $2)
      `,
        [placement.id, contentId]
      );

      // Update usage count
      const tableName = type === 'link' ? 'project_links' : 'project_articles';
      await client.query(
        `
        UPDATE ${tableName}
        SET usage_count = usage_count + 1,
            status = CASE WHEN usage_count + 1 >= usage_limit THEN 'exhausted' ELSE 'active' END
        WHERE id = $1
      `,
        [contentId]
      );
    }

    // 14. Update site quotas
    // NOTE: For rented placements, site quota was already reserved when rental was created
    // So we DON'T increment used_links again - it would double-count
    if (!isRentedPlacement) {
      if (type === 'link') {
        await client.query('UPDATE sites SET used_links = used_links + 1 WHERE id = $1', [siteId]);
      } else {
        await client.query('UPDATE sites SET used_articles = used_articles + 1 WHERE id = $1', [
          siteId
        ]);
      }
    }

    // 14.5. Update rental slot usage (if using rented slot)
    if (isRentedPlacement && activeRental) {
      // Increment slots_used in rental
      await client.query(
        `UPDATE site_slot_rentals SET slots_used = slots_used + 1, updated_at = NOW() WHERE id = $1`,
        [activeRental.id]
      );

      // Create rental_placements record to track which placement uses which rental
      await client.query(
        `INSERT INTO rental_placements (rental_id, placement_id) VALUES ($1, $2)`,
        [activeRental.id, placement.id]
      );

      logger.info('Rental slot used', {
        rentalId: activeRental.id,
        placementId: placement.id,
        slotsUsed: activeRental.slots_used + 1,
        slotsTotal: activeRental.slots_count
      });
    }

    // 15. Update discount tier if needed (skip for free placements)
    let newTier = { discount: parseFloat(user.current_discount), tier: 'Standard' };
    if (finalPrice > 0) {
      newTier = await calculateDiscountTier(newTotalSpent);
      if (newTier.discount !== parseFloat(user.current_discount)) {
        await client.query('UPDATE users SET current_discount = $1 WHERE id = $2', [
          newTier.discount,
          userId
        ]);

        // Notify user about tier upgrade
        await client.query(
          `
          INSERT INTO notifications (user_id, type, title, message)
          VALUES ($1, 'discount_tier_achieved', $2, $3)
        `,
          [
            userId,
            'Новый уровень скидки!',
            `Поздравляем! Вы достигли уровня "${newTier.tier}" со скидкой ${newTier.discount}%`
          ]
        );
      }
    }

    // 16. Get project name for notifications
    const project = projectResult.rows[0];
    const contentData = contentResult.rows[0]; // First content item (we only allow 1 per placement)
    const typeLabel = type === 'link' ? 'ссылка' : 'статья';

    // Build notification message with content details
    const priceText = isRentedPlacement ? 'Бесплатно (аренда)' : `Списано $${finalPrice.toFixed(2)}`;
    let userNotificationMessage;
    if (type === 'link' && contentData.url) {
      userNotificationMessage = `Ссылка "${contentData.url}" → "${site.site_url}". ${priceText}.`;
    } else if (type === 'article' && contentData.title) {
      userNotificationMessage = `Статья "${contentData.title}" → "${site.site_url}". ${priceText}.`;
    } else {
      userNotificationMessage = `Куплена ${typeLabel} на сайте "${site.site_name}" для проекта "${project.name}". ${priceText}.`;
    }

    // 17. NOTIFICATION: Create notification for user about purchase
    await client.query(
      `
      INSERT INTO notifications (user_id, type, title, message, metadata)
      VALUES ($1, 'placement_purchased', $2, $3, $4)
    `,
      [
        userId,
        'Размещение куплено',
        userNotificationMessage,
        JSON.stringify({
          placementId: placement.id,
          type,
          siteId,
          siteName: site.site_name,
          siteUrl: site.site_url,
          projectId,
          projectName: project.name,
          contentUrl: contentData.url || null,
          contentTitle: contentData.title || null,
          price: finalPrice,
          isRented: isRentedPlacement,
          rentalId: activeRental?.id || null
        })
      ]
    );

    // Build admin notification message
    const adminPriceText = isRentedPlacement ? 'аренда' : `$${finalPrice.toFixed(2)}`;
    const adminNotificationMessage =
      type === 'link' && contentData.url
        ? `"${user.username}": "${contentData.url}" → "${site.site_url}" (${adminPriceText})`
        : `"${user.username}": "${contentData.title || 'N/A'}" → "${site.site_url}" (${adminPriceText})`;

    // 18. NOTIFICATION: Create notification for other admins about purchase (exclude buyer to avoid duplicates)
    await client.query(
      `
      INSERT INTO notifications (user_id, type, title, message, metadata)
      SELECT id, 'admin_placement_purchased', $1, $2, $3
      FROM users WHERE role = 'admin' AND id != $4
    `,
      [
        'Новая покупка',
        adminNotificationMessage,
        JSON.stringify({
          placementId: placement.id,
          userId,
          username: user.username,
          type,
          siteId,
          siteName: site.site_name,
          siteUrl: site.site_url,
          projectId,
          projectName: project.name,
          contentUrl: contentData.url || null,
          contentTitle: contentData.title || null,
          price: finalPrice
        }),
        userId
      ]
    );

    // 19. OPTIMIZATION: Publish AFTER transaction commit (async)
    // OLD: WordPress publication inside transaction blocked for 500-1000ms
    // NEW: Commit first, then publish async (no blocking)

    // 17. Create audit log
    await client.query(
      `
      INSERT INTO audit_log (user_id, action, details)
      VALUES ($1, 'purchase_placement', $2)
    `,
      [userId, JSON.stringify({ placementId: placement.id, type, siteId, finalPrice })]
    );

    await client.query('COMMIT');

    // SECURITY: Check for anomalous purchase amounts (async, don't block response)
    checkAnomalousTransaction(userId, finalPrice, 'purchase').catch(err =>
      logger.error('Failed to check anomalous transaction', { err: err.message })
    );

    // REFERRAL: Create referral commission for the referrer (async, don't block response)
    // Only if user was referred by someone and this is a real purchase (not own site)
    if (!isOwnSite && finalPrice > 0) {
      createReferralCommission(userId, transactionId, placement.id, finalPrice).catch(err =>
        logger.error('Failed to create referral commission', { userId, err: err.message })
      );
    }

    // OPTIMIZATION: Async cache invalidation (don't await - save 60-150ms)
    // Cache staleness is acceptable (2 min TTL)
    cache
      .delPattern(`placements:user:${userId}:*`)
      .catch(err => logger.error('Cache invalidation failed (placements)', { userId, err }));
    cache
      .delPattern(`projects:user:${userId}:*`)
      .catch(err => logger.error('Cache invalidation failed (projects)', { userId, err }));

    // CRITICAL FIX: Invalidate WordPress/Static content cache for this site
    // This ensures the plugin/widget shows updated content immediately
    if (site.site_type === 'wordpress' && site.api_key) {
      cache
        .del(`wp:content:${site.api_key}`)
        .catch(err =>
          logger.error('Cache invalidation failed (wp content)', { apiKey: site.api_key, err })
        );
    } else if (site.site_type === 'static_php' && site.site_url) {
      // Normalize domain for cache key
      const normalizedDomain = site.site_url
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
      cache.del(`static:content:${normalizedDomain}`).catch(err =>
        logger.error('Cache invalidation failed (static content)', {
          domain: normalizedDomain,
          err
        })
      );
    }

    // OPTIMIZATION: Async WordPress publication (after commit)
    // Don't block response - publish in background
    // NOTE: Placements with status 'pending_approval' skip publication until admin approves
    if (status === 'pending') {
      publishPlacementAsync(placement.id, site).catch(publishError => {
        logger.error('Async publication failed - placement remains pending', {
          placementId: placement.id,
          userId,
          error: publishError.message
        });
        // NOTE: User has been charged, placement marked as 'pending'
        // Admin can manually retry publication from UI
      });
    } else if (status === 'pending_approval') {
      logger.info('Placement awaiting admin approval - publication deferred', {
        placementId: placement.id,
        userId,
        siteId
      });
    }

    logger.info('Placement purchased successfully', {
      userId,
      placementId: placement.id,
      type,
      finalPrice,
      newBalance,
      newDiscount: newTier.discount
    });

    return {
      success: true,
      placement,
      newBalance,
      newDiscount: newTier.discount,
      newTier: newTier.tier
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to purchase placement', { userId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Publish placement to WordPress ASYNC (after transaction commit)
 * OPTIMIZATION: Runs in background, doesn't block purchase response
 */
const publishPlacementAsync = async (placementId, site) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get placement details
    const placementResult = await client.query(
      `
      SELECT p.*
      FROM placements p
      WHERE p.id = $1
    `,
      [placementId]
    );

    const placement = placementResult.rows[0];

    if (!placement) {
      throw new Error(`Placement ${placementId} not found`);
    }

    // Get content
    const contentResult = await client.query(
      `
      SELECT
        pc.*,
        pl.url, pl.anchor_text,
        pa.title, pa.content
      FROM placement_content pc
      LEFT JOIN project_links pl ON pc.link_id = pl.id
      LEFT JOIN project_articles pa ON pc.article_id = pa.id
      WHERE pc.placement_id = $1
    `,
      [placementId]
    );

    const content = contentResult.rows[0];

    // Publish to WordPress
    if (placement.type === 'article' && content.article_id) {
      const result = await wordpressService.publishArticle(site.site_url, site.api_key, {
        title: content.title,
        content: content.content,
        slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      });

      await client.query(
        `
        UPDATE placements
        SET status = 'placed',
            published_at = NOW(),
            wordpress_post_id = $1
        WHERE id = $2
      `,
        [result.post_id, placementId]
      );

      logger.info('Article published successfully (async)', {
        placementId,
        wordpressPostId: result.post_id
      });
    } else {
      // For links, mark as placed (actual publication handled by plugin)
      await client.query(
        `
        UPDATE placements
        SET status = 'placed', published_at = NOW()
        WHERE id = $1
      `,
        [placementId]
      );

      logger.info('Link placement marked as placed (async)', { placementId });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Async publication failed', { placementId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Publish scheduled placement NOW (manual trigger or cron)
 * Changes status from 'scheduled' to 'pending' or 'placed'
 */
const publishScheduledPlacement = async (placementId, userId = null) => {
  try {
    // Get placement with site info
    const placementResult = await query(
      `
      SELECT p.*, s.api_key, s.site_url, s.site_type
      FROM placements p
      JOIN sites s ON p.site_id = s.id
      WHERE p.id = $1
    `,
      [placementId]
    );

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];

    // Validate status
    if (placement.status !== 'scheduled') {
      throw new Error(
        `Placement status is '${placement.status}', not 'scheduled'. Cannot publish.`
      );
    }

    // Authorization check (if userId provided)
    if (userId && placement.user_id !== userId) {
      throw new Error('Unauthorized: You can only publish your own placements');
    }

    // Create site object for publishPlacementAsync
    const site = {
      id: placement.site_id,
      api_key: placement.api_key,
      site_url: placement.site_url,
      site_type: placement.site_type
    };

    // Trigger async publication
    await publishPlacementAsync(placementId, site);

    logger.info('Scheduled placement published', { placementId, userId });

    return {
      success: true,
      placementId,
      message: 'Placement is being published'
    };
  } catch (error) {
    logger.error('Failed to publish scheduled placement', {
      placementId,
      userId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Publish placement to WordPress (internal helper) - DEPRECATED
 * Use publishPlacementAsync instead for better performance
 */
const _publishPlacement = async (client, placementId) => {
  // Get placement details
  const placementResult = await client.query(
    `
    SELECT p.*, s.api_key, s.site_url
    FROM placements p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = $1
  `,
    [placementId]
  );

  const placement = placementResult.rows[0];

  // Get content
  const contentResult = await client.query(
    `
    SELECT
      pc.*,
      pl.url, pl.anchor_text,
      pa.title, pa.content
    FROM placement_content pc
    LEFT JOIN project_links pl ON pc.link_id = pl.id
    LEFT JOIN project_articles pa ON pc.article_id = pa.id
    WHERE pc.placement_id = $1
  `,
    [placementId]
  );

  const content = contentResult.rows[0];

  // Publish to WordPress
  if (placement.type === 'article' && content.article_id) {
    const result = await wordpressService.publishArticle(placement.site_url, placement.api_key, {
      title: content.title,
      content: content.content,
      slug: content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    });

    await client.query(
      `
      UPDATE placements
      SET status = 'placed',
          published_at = NOW(),
          wordpress_post_id = $1
      WHERE id = $2
    `,
      [result.post_id, placementId]
    );

    logger.info('Article published successfully', { placementId, wordpressPostId: result.post_id });
  } else {
    // For links, mark as placed (actual publication handled by plugin)
    await client.query(
      `
      UPDATE placements
      SET status = 'placed', published_at = NOW()
      WHERE id = $1
    `,
      [placementId]
    );

    logger.info('Link placement marked as placed', { placementId });
  }
};

/**
 * Renew placement (only for links)
 */
const renewPlacement = async (placementId, userId, isAutoRenewal = false) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get placement, user, and site with lock
    const placementResult = await client.query(
      `
      SELECT p.*, u.balance, u.current_discount, u.total_spent, s.user_id as site_owner_id, s.price_link, s.price_article, s.api_key
      FROM placements p
      JOIN users u ON p.user_id = u.id
      JOIN sites s ON p.site_id = s.id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p, u
    `,
      [placementId, userId]
    );

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    // Extract user financial data from locked row (FOR UPDATE ensures these are current)
    // NOTE: placement object contains joined user data (u.balance, u.current_discount, u.total_spent)
    const userBalance = parseFloat(placement.balance);
    const userCurrentDiscount = parseFloat(placement.current_discount) || 0;
    const userTotalSpent = parseFloat(placement.total_spent || 0);

    // 2. Validate placement type
    if (placement.type !== 'link') {
      throw new Error('Only homepage links can be renewed');
    }

    // 3. Calculate renewal price
    // SPECIAL PRICING: If user owns the site, flat rate of $0.10
    const isOwnSite = placement.site_owner_id === userId;

    let finalRenewalPrice;
    let basePrice, baseRenewalDiscount, personalDiscount;

    if (isOwnSite) {
      // Owner's renewal price: flat rate
      finalRenewalPrice = PRICING.OWNER_RATE;
      basePrice = PRICING.OWNER_RATE;
      baseRenewalDiscount = 0;
      personalDiscount = 0;
      logger.info('Owner renewal pricing applied', {
        userId,
        placementId,
        price: finalRenewalPrice
      });
    } else {
      // Standard renewal pricing
      // Use site-specific price if available, otherwise use default
      basePrice =
        placement.price_link !== null && placement.price_link !== undefined
          ? parseFloat(placement.price_link)
          : PRICING.LINK_HOMEPAGE;

      baseRenewalDiscount = PRICING.BASE_RENEWAL_DISCOUNT;
      personalDiscount = userCurrentDiscount;

      // Apply both discounts sequentially
      const priceAfterBaseDiscount = basePrice * (1 - baseRenewalDiscount / 100);
      finalRenewalPrice = priceAfterBaseDiscount * (1 - personalDiscount / 100);
    }

    // 4. Check balance (using locked user data)
    if (userBalance < finalRenewalPrice) {
      throw new Error(
        `Insufficient balance for renewal. Required: $${finalRenewalPrice.toFixed(2)}, Available: $${userBalance.toFixed(2)}`
      );
    }

    // 5. Deduct from balance
    const newBalance = userBalance - finalRenewalPrice;
    const newTotalSpent = userTotalSpent + finalRenewalPrice;

    await client.query('UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3', [
      newBalance,
      newTotalSpent,
      userId
    ]);

    // CRITICAL FIX (BUG #12): Recalculate discount tier after renewal
    // User may qualify for higher tier after total_spent increase from renewal
    const newTier = await calculateDiscountTier(newTotalSpent);
    // Compare with actual current_discount from locked user row (userCurrentDiscount extracted above)
    if (newTier.discount !== userCurrentDiscount) {
      await client.query('UPDATE users SET current_discount = $1 WHERE id = $2', [
        newTier.discount,
        userId
      ]);

      logger.info('Discount tier upgraded after renewal', {
        userId,
        oldDiscount: userCurrentDiscount,
        newDiscount: newTier.discount,
        newTier: newTier.tier,
        totalSpent: newTotalSpent
      });

      // Notify user about tier upgrade
      await client.query(
        `
        INSERT INTO notifications (user_id, type, title, message)
        VALUES ($1, 'discount_tier_achieved', $2, $3)
      `,
        [
          userId,
          'Новый уровень скидки!',
          `Поздравляем! Вы достигли уровня "${newTier.tier}" со скидкой ${newTier.discount}%`
        ]
      );
    }

    // 6. Create transaction
    const transactionType = isAutoRenewal ? 'auto_renewal' : 'renewal';
    const transactionResult = await client.query(
      `
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after, description, placement_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
      [
        userId,
        transactionType,
        -finalRenewalPrice,
        placement.balance,
        newBalance,
        `Renewal of placement #${placementId}`,
        placementId,
        JSON.stringify({
          basePrice,
          baseRenewalDiscount,
          personalDiscount,
          finalPrice: finalRenewalPrice
        })
      ]
    );

    const transactionId = transactionResult.rows[0].id;

    // 7. Update placement expiry
    const newExpiryDate = new Date(placement.expires_at || new Date());
    newExpiryDate.setDate(newExpiryDate.getDate() + PRICING.RENEWAL_PERIOD_DAYS);

    await client.query(
      `
      UPDATE placements
      SET expires_at = $1,
          last_renewed_at = NOW(),
          renewal_count = renewal_count + 1,
          renewal_price = $2
      WHERE id = $3
    `,
      [newExpiryDate, finalRenewalPrice, placementId]
    );

    // 8. Record renewal history
    await client.query(
      `
      INSERT INTO renewal_history (
        placement_id, user_id, price_paid, discount_applied, new_expiry_date, transaction_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [placementId, userId, finalRenewalPrice, personalDiscount, newExpiryDate, transactionId]
    );

    // 9. Create notification
    await client.query(
      `
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, $2, $3, $4)
    `,
      [
        userId,
        'placement_renewed',
        'Размещение продлено',
        `Размещение #${placementId} успешно продлено до ${newExpiryDate.toLocaleDateString()}. Списано $${finalRenewalPrice.toFixed(2)}`
      ]
    );

    // 10. Audit log
    await client.query(
      `
      INSERT INTO audit_log (user_id, action, details)
      VALUES ($1, 'renew_placement', $2)
    `,
      [userId, JSON.stringify({ placementId, isAutoRenewal, pricePaid: finalRenewalPrice })]
    );

    await client.query('COMMIT');

    // CRITICAL: Clear cache after renewal so UI shows updated data
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);
    // Targeted cache invalidation - only this site
    if (placement.api_key) {
      await cache.del(`wp:content:${placement.api_key}`);
    }

    logger.info('Placement renewed successfully', {
      placementId,
      userId,
      isAutoRenewal,
      pricePaid: finalRenewalPrice,
      newExpiryDate
    });

    return {
      success: true,
      newExpiryDate,
      pricePaid: finalRenewalPrice,
      newBalance
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to renew placement', {
      placementId,
      userId,
      isAutoRenewal,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Toggle auto-renewal for placement
 */
const toggleAutoRenewal = async (placementId, userId, enabled) => {
  try {
    // Verify ownership
    const placementResult = await query('SELECT * FROM placements WHERE id = $1 AND user_id = $2', [
      placementId,
      userId
    ]);

    if (placementResult.rows.length === 0) {
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    if (placement.type !== 'link') {
      throw new Error('Auto-renewal is only available for homepage links');
    }

    await query('UPDATE placements SET auto_renewal = $1 WHERE id = $2', [enabled, placementId]);

    // Clear cache after toggle so UI shows updated data
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${userId}:*`);

    logger.info('Auto-renewal toggled', { placementId, userId, enabled });

    return { success: true, enabled };
  } catch (error) {
    logger.error('Failed to toggle auto-renewal', {
      placementId,
      userId,
      enabled,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get user transactions
 */
const getUserTransactions = async (userId, { page = 1, limit = 50, type = null }) => {
  try {
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    const params = [userId];

    if (type) {
      whereClause += ' AND type = $2';
      params.push(type);
    }

    const result = await query(
      `
      SELECT *
      FROM transactions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `
      SELECT COUNT(*) as count
      FROM transactions
      ${whereClause}
    `,
      params
    );

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    logger.error('Failed to get user transactions', { userId, error: error.message });
    throw error;
  }
};

/**
 * Calculate pricing for user (with their discount)
 */
const getPricingForUser = async userId => {
  try {
    const user = await getUserBalance(userId);
    const discount = parseFloat(user.current_discount) || 0;

    const linkPrice = PRICING.LINK_HOMEPAGE * (1 - discount / 100);
    const articlePrice = PRICING.ARTICLE_GUEST_POST * (1 - discount / 100);

    // Calculate renewal price
    const renewalPrice =
      PRICING.LINK_HOMEPAGE * (1 - PRICING.BASE_RENEWAL_DISCOUNT / 100) * (1 - discount / 100);

    const maxDiscount = Math.min(
      PRICING.MAX_TOTAL_DISCOUNT,
      PRICING.BASE_RENEWAL_DISCOUNT + discount
    );

    return {
      link: {
        basePrice: PRICING.LINK_HOMEPAGE,
        discount: discount,
        finalPrice: linkPrice
      },
      article: {
        basePrice: PRICING.ARTICLE_GUEST_POST,
        discount: discount,
        finalPrice: articlePrice
      },
      renewal: {
        basePrice: PRICING.LINK_HOMEPAGE,
        baseDiscount: PRICING.BASE_RENEWAL_DISCOUNT,
        personalDiscount: discount,
        totalDiscount: maxDiscount,
        finalPrice: renewalPrice
      },
      currentTier: {
        name: user.tier_name,
        discount: discount
      },
      discountTiers: await getDiscountTiers()
    };
  } catch (error) {
    logger.error('Failed to get pricing for user', { userId, error: error.message });
    throw error;
  }
};

/**
 * Refund a placement deletion
 * Called when a paid placement is deleted
 */
const refundPlacement = async (placementId, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get placement with billing data and lock it
    const placementResult = await client.query(
      `
      SELECT
        p.id,
        p.user_id,
        p.project_id,
        p.site_id,
        p.type,
        p.final_price,
        p.original_price,
        p.discount_applied,
        p.purchase_transaction_id,
        p.placed_at,
        s.site_name,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p
    `,
      [placementId, userId]
    );

    if (placementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Placement not found or unauthorized');
    }

    const placement = placementResult.rows[0];

    // Check if it's a paid placement
    const finalPrice = parseFloat(placement.final_price || 0);

    if (finalPrice <= 0) {
      // Free placement, no refund needed
      await client.query('ROLLBACK');
      return { refunded: false, amount: 0, reason: 'No payment made for this placement' };
    }

    // Get user balance with lock
    const userResult = await client.query(
      'SELECT id, balance, total_spent, current_discount FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const balanceBefore = parseFloat(user.balance);
    const balanceAfter = balanceBefore + finalPrice;

    // CRITICAL FIX (BUG #10): Decrement total_spent on refund to prevent discount tier exploitation
    const totalSpentBefore = parseFloat(user.total_spent || 0);
    const totalSpentAfter = Math.max(0, totalSpentBefore - finalPrice);

    // Refund the amount and decrement total_spent
    await client.query('UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3', [
      balanceAfter,
      totalSpentAfter,
      userId
    ]);

    // CRITICAL FIX (BUG #11): Recalculate discount tier after refund
    const newTier = await calculateDiscountTier(totalSpentAfter);
    if (newTier.discount !== parseFloat(user.current_discount)) {
      await client.query('UPDATE users SET current_discount = $1 WHERE id = $2', [
        newTier.discount,
        userId
      ]);

      logger.info('Discount tier changed after refundPlacement', {
        userId,
        oldDiscount: parseFloat(user.current_discount),
        newDiscount: newTier.discount,
        newTier: newTier.tier,
        totalSpentAfter
      });
    }

    // Create refund transaction
    const transactionResult = await client.query(
      `
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after,
        description, placement_id
      ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `,
      [
        userId,
        finalPrice, // Positive amount for refund
        balanceBefore,
        balanceAfter,
        `Возврат за размещение ${placement.type === 'article' ? 'статьи' : 'ссылки'} на ${placement.site_name} (${placement.project_name})`,
        placementId
      ]
    );

    const transaction = transactionResult.rows[0];

    // Add audit log
    await client.query(
      `
      INSERT INTO audit_log (
        user_id, action, details
      ) VALUES ($1, 'placement_refund', $2)
    `,
      [
        userId,
        JSON.stringify({
          entity_type: 'placement',
          entity_id: placementId,
          refund_amount: finalPrice,
          original_price: placement.original_price,
          discount_applied: placement.discount_applied,
          transaction_id: transaction.id,
          site_name: placement.site_name,
          project_name: placement.project_name,
          type: placement.type
        })
      ]
    );

    await client.query('COMMIT');

    logger.info('Placement refunded successfully', {
      placementId,
      userId,
      refundAmount: finalPrice,
      newBalance: balanceAfter,
      transactionId: transaction.id
    });

    return {
      refunded: true,
      amount: finalPrice,
      newBalance: balanceAfter,
      transactionId: transaction.id,
      transactionDate: transaction.created_at
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to refund placement', {
      placementId,
      userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reusable refund logic for placements within an existing transaction
 * Used by both direct placement deletion and site deletion
 *
 * @param {object} client - PostgreSQL client with active transaction
 * @param {object} placement - Placement object with all fields
 * @returns {object} Refund result { refunded: boolean, amount: number, newBalance: number, tierChanged: boolean, newTier: string }
 */
const refundPlacementInTransaction = async (client, placement) => {
  const finalPrice = parseFloat(placement.final_price || 0);

  // No refund needed for free placements
  if (finalPrice <= 0) {
    return { refunded: false, amount: 0, tierChanged: false };
  }

  // Get placement owner with lock
  const userResult = await client.query(
    'SELECT id, balance, total_spent, current_discount FROM users WHERE id = $1 FOR UPDATE',
    [placement.user_id]
  );

  if (userResult.rows.length === 0) {
    throw new Error('Placement owner not found');
  }

  const user = userResult.rows[0];
  const balanceBefore = parseFloat(user.balance);
  const balanceAfter = balanceBefore + finalPrice;

  // Decrement total_spent to prevent discount tier exploitation
  const totalSpentBefore = parseFloat(user.total_spent || 0);
  const totalSpentAfter = Math.max(0, totalSpentBefore - finalPrice);

  // Refund money and decrement total_spent
  await client.query('UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3', [
    balanceAfter,
    totalSpentAfter,
    placement.user_id
  ]);

  // Recalculate discount tier after refund
  let tierChanged = false;
  let newTierName = null;
  const newTier = await calculateDiscountTier(totalSpentAfter);

  if (newTier.discount !== parseFloat(user.current_discount)) {
    await client.query('UPDATE users SET current_discount = $1 WHERE id = $2', [
      newTier.discount,
      placement.user_id
    ]);

    tierChanged = true;
    newTierName = newTier.tier;

    logger.info('Discount tier downgraded after refund', {
      userId: placement.user_id,
      oldDiscount: parseFloat(user.current_discount),
      newDiscount: newTier.discount,
      newTier: newTier.tier,
      totalSpentAfter
    });

    // Notify placement owner about tier downgrade
    await client.query(
      `
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'discount_tier_changed', $2, $3)
    `,
      [
        placement.user_id,
        'Изменение уровня скидки',
        `Ваш уровень скидки изменён на "${newTier.tier}" (${newTier.discount}%) после возврата средств.`
      ]
    );
  }

  // Create refund transaction
  await client.query(
    `
    INSERT INTO transactions (
      user_id, type, amount, balance_before, balance_after,
      description, placement_id
    ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
  `,
    [
      placement.user_id,
      finalPrice,
      balanceBefore,
      balanceAfter,
      `Возврат за размещение ${placement.type === 'article' ? 'статьи' : 'ссылки'} на ${placement.site_name || 'сайт'} (${placement.project_name || 'проект'})`,
      placement.id
    ]
  );

  logger.info('Refund processed within transaction', {
    placementId: placement.id,
    userId: placement.user_id,
    refundAmount: finalPrice,
    newBalance: balanceAfter,
    tierChanged,
    newTier: newTierName
  });

  return {
    refunded: true,
    amount: finalPrice,
    newBalance: balanceAfter,
    tierChanged,
    newTier: newTierName,
    oldDiscount: parseFloat(user.current_discount),
    newDiscount: newTier.discount
  };
};

/**
 * Restore usage counts for links and articles after placement refund
 * Used by both direct placement deletion and site deletion
 *
 * @param {object} client - PostgreSQL client with active transaction
 * @param {number} placementId - ID of placement being refunded
 * @returns {object} Counts of restored items { linkCount: number, articleCount: number }
 */
const restoreUsageCountsInTransaction = async (client, placementId) => {
  // Get content IDs
  const contentResult = await client.query(
    `
    SELECT
      array_agg(DISTINCT link_id) FILTER (WHERE link_id IS NOT NULL) as link_ids,
      array_agg(DISTINCT article_id) FILTER (WHERE article_id IS NOT NULL) as article_ids,
      COUNT(DISTINCT link_id) as link_count,
      COUNT(DISTINCT article_id) as article_count
    FROM placement_content
    WHERE placement_id = $1
  `,
    [placementId]
  );

  const { link_ids, article_ids, link_count, article_count } = contentResult.rows[0];

  // Decrement usage_count for links (batch UPDATE - 1 query instead of N)
  if (link_ids && link_ids.length > 0) {
    await client.query(
      `
      UPDATE project_links
      SET usage_count = GREATEST(0, usage_count - 1),
          status = CASE
            WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
            ELSE status
          END
      WHERE id = ANY($1::int[])
    `,
      [link_ids]
    );
  }

  // Decrement usage_count for articles (batch UPDATE - 1 query instead of N)
  if (article_ids && article_ids.length > 0) {
    await client.query(
      `
      UPDATE project_articles
      SET usage_count = GREATEST(0, usage_count - 1),
          status = CASE
            WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
            ELSE status
          END
      WHERE id = ANY($1::int[])
    `,
      [article_ids]
    );
  }

  return {
    linkCount: parseInt(link_count, 10) || 0,
    articleCount: parseInt(article_count, 10) || 0
  };
};

/**
 * CRITICAL FIX: Atomic delete with refund (single transaction)
 * Prevents race conditions and ensures money safety
 *
 * @param {number} placementId - ID of placement to delete
 * @param {number} userId - ID of user requesting deletion (for refund target)
 * @param {string} userRole - Role of user ('admin' or 'user')
 *
 * ADMIN-ONLY: Only administrators can delete placements
 * - Admins can delete ANY placement (no ownership check)
 * - Refund always goes to the placement owner, not the admin
 */
const deleteAndRefundPlacement = async (placementId, userId, userRole = 'user') => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get placement with lock
    const placementResult = await client.query(
      `
      SELECT
        p.id,
        p.user_id,
        p.project_id,
        p.site_id,
        p.type,
        p.final_price,
        p.original_price,
        p.discount_applied,
        p.purchase_transaction_id,
        p.placed_at,
        p.status,
        s.site_name,
        s.api_key,
        proj.name as project_name
      FROM placements p
      LEFT JOIN sites s ON p.site_id = s.id
      LEFT JOIN projects proj ON p.project_id = proj.id
      WHERE p.id = $1
      FOR UPDATE OF p
    `,
      [placementId]
    );

    if (placementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Placement not found');
    }

    const placement = placementResult.rows[0];

    // 2. ADMIN-ONLY: Verify authorization
    // Only admins can delete placements (enforced by adminMiddleware at route level)
    // This is a safety check in case service is called directly
    if (userRole !== 'admin') {
      await client.query('ROLLBACK');
      throw new Error('Unauthorized: Only administrators can delete placements');
    }

    // Note: Refund will go to placement.user_id (the owner), not the admin who deleted it
    const refundUserId = placement.user_id;

    // 3. Process refund if paid
    let refundResult = { refunded: false, amount: 0 };
    const finalPrice = parseFloat(placement.final_price || 0);

    if (finalPrice > 0) {
      // Get placement owner (refund recipient) with lock
      const userResult = await client.query(
        'SELECT id, balance, total_spent, current_discount FROM users WHERE id = $1 FOR UPDATE',
        [refundUserId]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Placement owner not found');
      }

      const user = userResult.rows[0];
      const balanceBefore = parseFloat(user.balance);
      const balanceAfter = balanceBefore + finalPrice;

      // CRITICAL FIX (BUG #10): Decrement total_spent on refund to prevent discount tier exploitation
      // Scenario: User buys $500 → gets 10% discount → deletes all → without this fix keeps 10% discount
      const totalSpentBefore = parseFloat(user.total_spent || 0);
      const totalSpentAfter = Math.max(0, totalSpentBefore - finalPrice);

      // Refund money and decrement total_spent
      await client.query('UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3', [
        balanceAfter,
        totalSpentAfter,
        refundUserId
      ]);

      // CRITICAL FIX (BUG #11): Recalculate discount tier after refund
      // User may no longer qualify for their current tier after total_spent decrease
      const newTier = await calculateDiscountTier(totalSpentAfter);
      if (newTier.discount !== parseFloat(user.current_discount)) {
        await client.query('UPDATE users SET current_discount = $1 WHERE id = $2', [
          newTier.discount,
          refundUserId
        ]);

        logger.info('Discount tier downgraded after refund', {
          userId: refundUserId,
          oldDiscount: parseFloat(user.current_discount),
          newDiscount: newTier.discount,
          newTier: newTier.tier,
          totalSpentAfter
        });

        // Notify placement owner about tier downgrade
        await client.query(
          `
          INSERT INTO notifications (user_id, type, title, message)
          VALUES ($1, 'discount_tier_changed', $2, $3)
        `,
          [
            refundUserId,
            'Изменение уровня скидки',
            `Ваш уровень скидки изменён на "${newTier.tier}" (${newTier.discount}%) после возврата средств.`
          ]
        );
      }

      // Create refund transaction (for placement owner)
      await client.query(
        `
        INSERT INTO transactions (
          user_id, type, amount, balance_before, balance_after,
          description, placement_id
        ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
      `,
        [
          refundUserId,
          finalPrice,
          balanceBefore,
          balanceAfter,
          `Возврат за размещение ${placement.type === 'article' ? 'статьи' : 'ссылки'} на ${placement.site_name} (${placement.project_name})`,
          placementId
        ]
      );

      // Audit log for refund (for placement owner)
      await client.query(
        `
        INSERT INTO audit_log (
          user_id, action, details
        ) VALUES ($1, 'placement_refund', $2)
      `,
        [
          refundUserId,
          JSON.stringify({
            entity_type: 'placement',
            entity_id: placementId,
            refund_amount: finalPrice,
            original_price: placement.original_price,
            discount_applied: placement.discount_applied,
            site_name: placement.site_name,
            project_name: placement.project_name,
            type: placement.type,
            deleted_by_admin: userId // Track which admin deleted it
          })
        ]
      );

      refundResult = {
        refunded: true,
        amount: finalPrice,
        newBalance: balanceAfter
      };

      logger.info('Refund processed within delete transaction', {
        placementId,
        ownerId: refundUserId,
        adminId: userId,
        refundAmount: finalPrice,
        newBalance: balanceAfter
      });
    }

    // 4. Delete placement content and placement itself
    // Get content IDs
    const contentResult = await client.query(
      `
      SELECT
        array_agg(DISTINCT link_id) FILTER (WHERE link_id IS NOT NULL) as link_ids,
        array_agg(DISTINCT article_id) FILTER (WHERE article_id IS NOT NULL) as article_ids,
        COUNT(DISTINCT link_id) as link_count,
        COUNT(DISTINCT article_id) as article_count
      FROM placement_content
      WHERE placement_id = $1
    `,
      [placementId]
    );

    const { link_ids, article_ids, link_count, article_count } = contentResult.rows[0];

    // Delete placement (cascade will delete placement_content)
    await client.query('DELETE FROM placements WHERE id = $1', [placementId]);

    // Update site quotas
    if (parseInt(link_count, 10) > 0) {
      await client.query(
        'UPDATE sites SET used_links = GREATEST(0, used_links - $1) WHERE id = $2',
        [link_count, placement.site_id]
      );
    }
    if (parseInt(article_count, 10) > 0) {
      await client.query(
        'UPDATE sites SET used_articles = GREATEST(0, used_articles - $1) WHERE id = $2',
        [article_count, placement.site_id]
      );
    }

    // Decrement usage_count for links (batch UPDATE - 1 query instead of N)
    if (link_ids && link_ids.length > 0) {
      await client.query(
        `
        UPDATE project_links
        SET usage_count = GREATEST(0, usage_count - 1),
            status = CASE
              WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
              ELSE status
            END
        WHERE id = ANY($1::int[])
      `,
        [link_ids]
      );
    }

    // Decrement usage_count for articles (batch UPDATE - 1 query instead of N)
    if (article_ids && article_ids.length > 0) {
      await client.query(
        `
        UPDATE project_articles
        SET usage_count = GREATEST(0, usage_count - 1),
            status = CASE
              WHEN GREATEST(0, usage_count - 1) < usage_limit THEN 'active'
              ELSE status
            END
        WHERE id = ANY($1::int[])
      `,
        [article_ids]
      );
    }

    // 5. Audit log for deletion (track admin who deleted)
    await client.query(
      `
      INSERT INTO audit_log (
        user_id, action, details
      ) VALUES ($1, 'placement_delete', $2)
    `,
      [
        userId, // Admin who performed the deletion
        JSON.stringify({
          entity_type: 'placement',
          entity_id: placementId,
          placement_owner_id: refundUserId,
          placement_type: placement.type,
          site_name: placement.site_name,
          project_name: placement.project_name,
          refunded: refundResult.refunded,
          refund_amount: refundResult.amount
        })
      ]
    );

    // 6. COMMIT everything atomically
    await client.query('COMMIT');

    // Clear cache for both placement owner and admin
    const cache = require('./cache.service');
    await cache.delPattern(`placements:user:${refundUserId}:*`); // Owner's cache
    await cache.delPattern(`projects:user:${refundUserId}:*`); // Owner's cache
    // Targeted cache invalidation - only this site
    if (placement.api_key) {
      await cache.del(`wp:content:${placement.api_key}`);
    }

    logger.info('Placement deleted atomically with refund by admin', {
      placementId,
      ownerId: refundUserId,
      adminId: userId,
      refunded: refundResult.refunded,
      refundAmount: refundResult.amount
    });

    return {
      deleted: true,
      ...refundResult
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Atomic delete with refund failed - transaction rolled back', {
      placementId,
      adminId: userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Batch purchase placements (parallel processing)
 * OPTIMIZATION: Process multiple purchases in parallel for 5-10x speed improvement
 *
 * @param {number} userId - User making the purchases
 * @param {Array} purchases - Array of purchase objects: { projectId, siteId, type, contentIds, scheduledDate }
 * @returns {Object} - { successful: number, failed: number, results: Array, errors: Array }
 */
const batchPurchasePlacements = async (userId, purchases) => {
  const startTime = Date.now();

  logger.info('Starting batch purchase', {
    userId,
    totalPurchases: purchases.length
  });

  // Process in chunks to avoid exhausting DB connection pool
  // Pool has 50 connections, each purchase spawns async operations (publishPlacementAsync,
  // createReferralCommission) that take additional connections. With 10 parallel purchases,
  // max connections = 10 × 3 = 30, safely within pool limit of 50.
  const CONCURRENCY_LIMIT = 10;
  const successful = [];
  const failed = [];
  let lastBalance = null;

  for (let i = 0; i < purchases.length; i += CONCURRENCY_LIMIT) {
    const chunk = purchases.slice(i, i + CONCURRENCY_LIMIT);

    const chunkResults = await Promise.allSettled(
      chunk.map(async purchase => {
        try {
          const result = await purchasePlacement({
            userId,
            projectId: purchase.projectId,
            siteId: purchase.siteId,
            type: purchase.type,
            contentIds: purchase.contentIds,
            scheduledDate: purchase.scheduledDate,
            autoRenewal: purchase.autoRenewal || false
          });

          return {
            siteId: purchase.siteId,
            success: true,
            placement: result.placement,
            newBalance: result.newBalance
          };
        } catch (error) {
          return {
            siteId: purchase.siteId,
            success: false,
            error: error.message
          };
        }
      })
    );

    // Aggregate chunk results
    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.success) {
          successful.push(data);
          lastBalance = data.newBalance;
        } else {
          failed.push({ siteId: data.siteId, error: data.error });
        }
      } else {
        failed.push({
          siteId: chunk[idx]?.siteId,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    // Log progress for long batches
    if (purchases.length > CONCURRENCY_LIMIT) {
      logger.info('Batch purchase progress', {
        userId,
        processed: Math.min(i + CONCURRENCY_LIMIT, purchases.length),
        total: purchases.length,
        successful: successful.length,
        failed: failed.length
      });
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Batch purchase completed', {
    userId,
    totalPurchases: purchases.length,
    successful: successful.length,
    failed: failed.length,
    durationMs: duration,
    avgTimePerPurchase: Math.round(duration / purchases.length)
  });

  // NOTIFICATION: Create grouped notification for batch purchase (if more than 1 successful)
  if (successful.length > 1) {
    try {
      // Get project names for the notification
      const projectIds = [...new Set(purchases.map(p => p.projectId))];
      const projectResult = await query(
        `
        SELECT id, name FROM projects WHERE id = ANY($1::int[])
      `,
        [projectIds]
      );
      const projectNames = projectResult.rows.map(p => p.name).join(', ');

      // Calculate total spent
      const totalSpent = successful.reduce((sum, r) => {
        const placement = r.placement;
        return sum + (parseFloat(placement?.final_price) || 0);
      }, 0);

      // Get user info for admin notification
      const userResult = await query('SELECT username FROM users WHERE id = $1', [userId]);
      const username = userResult.rows[0]?.username || 'Unknown';

      // User notification (grouped)
      await query(
        `
        INSERT INTO notifications (user_id, type, title, message, metadata)
        VALUES ($1, 'batch_placement_purchased', $2, $3, $4)
      `,
        [
          userId,
          'Массовая покупка',
          `Куплено ${successful.length} размещений для проекта "${projectNames}". Списано $${totalSpent.toFixed(2)}.`,
          JSON.stringify({ count: successful.length, projectIds, totalSpent })
        ]
      );

      // Admin notification (grouped) - exclude buyer to avoid duplicates
      await query(
        `
        INSERT INTO notifications (user_id, type, title, message, metadata)
        SELECT id, 'admin_batch_purchased', $1, $2, $3
        FROM users WHERE role = 'admin' AND id != $4
      `,
        [
          'Массовая покупка',
          `Пользователь "${username}" купил ${successful.length} размещений за $${totalSpent.toFixed(2)}.`,
          JSON.stringify({ userId, username, count: successful.length, projectIds, totalSpent }),
          userId
        ]
      );
    } catch (notifyError) {
      logger.error('Failed to create batch purchase notification', {
        userId,
        error: notifyError.message
      });
      // Don't throw - notifications are not critical
    }
  }

  // Clear cache after batch
  await cache.delPattern(`placements:user:${userId}:*`);
  await cache.delPattern(`projects:user:${userId}:*`);
  // Targeted cache invalidation - only affected sites
  const siteIds = [...new Set(purchases.map(p => p.siteId))];
  if (siteIds.length > 0) {
    const sitesResult = await query(
      'SELECT api_key FROM sites WHERE id = ANY($1::int[]) AND api_key IS NOT NULL',
      [siteIds]
    );
    for (const site of sitesResult.rows) {
      await cache.del(`wp:content:${site.api_key}`);
    }
  }

  return {
    successful: successful.length,
    failed: failed.length,
    results: successful,
    errors: failed,
    finalBalance: lastBalance,
    durationMs: duration
  };
};

/**
 * Batch delete placements with refund (parallel processing)
 * OPTIMIZATION: Process multiple deletes in parallel for 5-10x speed improvement
 * ADMIN ONLY: Only administrators can delete placements
 *
 * @param {number} userId - Admin user making the deletions
 * @param {string} userRole - User role (must be 'admin')
 * @param {Array} placementIds - Array of placement IDs to delete
 * @returns {Object} - { successful: number, failed: number, totalRefunded: number, results: Array, errors: Array }
 */
const batchDeletePlacements = async (userId, userRole, placementIds) => {
  const startTime = Date.now();

  logger.info('Starting batch delete', {
    userId,
    userRole,
    totalPlacements: placementIds.length
  });

  // Process in chunks to avoid exhausting DB connection pool
  const CONCURRENCY_LIMIT = 15;
  const successful = [];
  const failed = [];
  let totalRefunded = 0;
  let lastBalance = null;

  for (let i = 0; i < placementIds.length; i += CONCURRENCY_LIMIT) {
    const chunk = placementIds.slice(i, i + CONCURRENCY_LIMIT);

    const chunkResults = await Promise.allSettled(
      chunk.map(async placementId => {
        try {
          const result = await deleteAndRefundPlacement(placementId, userId, userRole);
          return {
            placementId,
            success: true,
            refunded: result.refunded,
            amount: result.amount || 0,
            newBalance: result.newBalance
          };
        } catch (error) {
          return {
            placementId,
            success: false,
            error: error.message
          };
        }
      })
    );

    // Aggregate chunk results
    chunkResults.forEach(result => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.success) {
          successful.push(data);
          totalRefunded += data.amount || 0;
          lastBalance = data.newBalance;
        } else {
          failed.push({ placementId: data.placementId, error: data.error });
        }
      } else {
        failed.push({
          placementId: null,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    // Log progress for long batches
    if (placementIds.length > CONCURRENCY_LIMIT) {
      logger.info('Batch delete progress', {
        userId,
        processed: Math.min(i + CONCURRENCY_LIMIT, placementIds.length),
        total: placementIds.length,
        successful: successful.length,
        failed: failed.length
      });
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Batch delete completed', {
    userId,
    totalPlacements: placementIds.length,
    successful: successful.length,
    failed: failed.length,
    totalRefunded,
    durationMs: duration,
    avgTimePerDelete: Math.round(duration / placementIds.length)
  });

  // Clear cache after batch
  await cache.delPattern(`placements:user:*`);
  await cache.delPattern(`projects:user:*`);
  // Note: wp:content cache invalidation handled by individual deleteAndRefundPlacement calls

  return {
    successful: successful.length,
    failed: failed.length,
    totalRefunded,
    results: successful,
    errors: failed,
    finalBalance: lastBalance,
    durationMs: duration
  };
};

/**
 * Create referral commission for the referrer when a referred user makes a purchase
 * Called asynchronously after purchase commits - doesn't block purchase flow
 *
 * @param {number} userId - ID of user who made the purchase (referee)
 * @param {number} transactionId - ID of the purchase transaction
 * @param {number} placementId - ID of the created placement
 * @param {number} purchaseAmount - Final price paid (after discounts)
 */
const createReferralCommission = async (userId, transactionId, placementId, purchaseAmount) => {
  try {
    // Get user's referrer (if any)
    const userResult = await query(
      'SELECT referred_by_user_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].referred_by_user_id) {
      // User has no referrer, skip
      return null;
    }

    const referrerId = userResult.rows[0].referred_by_user_id;
    const commissionRate = PRICING.REFERRAL_COMMISSION_RATE;
    const commissionAmount = parseFloat(purchaseAmount) * (commissionRate / 100);

    // Minimum commission threshold ($0.01)
    if (commissionAmount < 0.01) {
      logger.info('Referral commission too small, skipping', {
        userId,
        referrerId,
        purchaseAmount,
        commissionAmount
      });
      return null;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create referral transaction record
      await client.query(
        `INSERT INTO referral_transactions (
          referrer_id, referee_id, original_transaction_id, placement_id,
          transaction_amount, commission_rate, commission_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'credited')`,
        [referrerId, userId, transactionId, placementId, purchaseAmount, commissionRate, commissionAmount]
      );

      // Update referrer's balances
      await client.query(
        `UPDATE users
         SET referral_balance = referral_balance + $1,
             total_referral_earnings = total_referral_earnings + $1
         WHERE id = $2`,
        [commissionAmount, referrerId]
      );

      // Create notification for referrer
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         VALUES ($1, 'referral_commission', $2, $3, $4)`,
        [
          referrerId,
          'Реферальная комиссия',
          `Вы получили $${commissionAmount.toFixed(2)} комиссии от покупки привлечённого пользователя.`,
          JSON.stringify({
            refereeId: userId,
            purchaseAmount,
            commissionRate,
            commissionAmount,
            placementId
          })
        ]
      );

      await client.query('COMMIT');

      logger.info('Referral commission created', {
        referrerId,
        refereeId: userId,
        purchaseAmount,
        commissionAmount,
        placementId
      });

      return {
        referrerId,
        commissionAmount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to create referral commission', {
      userId,
      transactionId,
      placementId,
      purchaseAmount,
      error: error.message
    });
    // Don't re-throw - referral commission failure should not affect purchase
    return null;
  }
};

// ============================================
// SLOT RENTAL SYSTEM
// ============================================

const RENTAL_PRICING = {
  DEFAULT_PRICE_PER_SLOT: 25.0,
  RENTAL_PERIOD_DAYS: 365,
  RENEWAL_DISCOUNT: 30 // 30% discount on renewal
};

/**
 * Create slot rental (owner creates, tenant pays)
 * @param {number} ownerId - Site owner who creates the rental
 * @param {number} siteId - Site ID
 * @param {string} tenantUsername - Username of the tenant
 * @param {number} slotsCount - Number of slots to rent
 * @param {number} pricePerSlot - Price per slot (optional, defaults to site price or $25)
 */
const createSlotRental = async (ownerId, siteId, tenantUsername, slotsCount, pricePerSlot = null) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get site and verify ownership, also get owner role
    const siteResult = await client.query(
      `SELECT s.*, u.username as owner_username, u.role as owner_role
       FROM sites s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 FOR UPDATE`,
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      throw new Error('Сайт не найден');
    }

    const site = siteResult.rows[0];
    const isAdminOwner = site.owner_role === 'admin';

    if (site.user_id !== ownerId) {
      throw new Error('Только владелец сайта может создавать аренду');
    }

    // 2. Get tenant by username
    const tenantResult = await client.query(
      `SELECT id, username, balance, current_discount FROM users WHERE username = $1 FOR UPDATE`,
      [tenantUsername]
    );

    if (tenantResult.rows.length === 0) {
      throw new Error(`Пользователь "${tenantUsername}" не найден`);
    }

    const tenant = tenantResult.rows[0];

    if (tenant.id === ownerId) {
      throw new Error('Нельзя сдать сайт в аренду самому себе');
    }

    // 3. Check available slots (considering reserved slots in other rentals)
    const reservedResult = await client.query(
      `SELECT COALESCE(SUM(slots_count), 0) as reserved_slots
       FROM site_slot_rentals
       WHERE site_id = $1 AND status IN ('active', 'pending_approval', 'pending_payment')`,
      [siteId]
    );

    const reservedSlots = parseInt(reservedResult.rows[0].reserved_slots) || 0;
    const availableSlots = site.max_links - site.used_links - reservedSlots;

    if (slotsCount > availableSlots) {
      throw new Error(
        `Доступно только ${availableSlots} свободных слотов. ` +
        `Занято: ${site.used_links} размещений + ${reservedSlots} в аренде из ${site.max_links}`
      );
    }

    // 4. Check for existing active or pending rental
    const existingRental = await client.query(
      `SELECT id, status FROM site_slot_rentals
       WHERE site_id = $1 AND tenant_id = $2 AND status IN ('active', 'pending_approval')`,
      [siteId, tenant.id]
    );

    if (existingRental.rows.length > 0) {
      const status = existingRental.rows[0].status;
      if (status === 'active') {
        throw new Error(`У пользователя "${tenantUsername}" уже есть активная аренда на этом сайте`);
      } else {
        throw new Error(`У пользователя "${tenantUsername}" уже есть ожидающий запрос на аренду`);
      }
    }

    // 5. Calculate price (owner sets the price, NO tenant discount applied here)
    const finalPricePerSlot = pricePerSlot || site.price_link || RENTAL_PRICING.DEFAULT_PRICE_PER_SLOT;
    const totalPrice = finalPricePerSlot * slotsCount;

    // 6. Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + RENTAL_PRICING.RENTAL_PERIOD_DAYS);

    // ADMIN OWNER: Create immediately active rental with payment
    if (isAdminOwner) {
      // Check tenant balance
      const tenantBalance = parseFloat(tenant.balance);
      if (tenantBalance < totalPrice) {
        throw new Error(
          `Недостаточно средств у арендатора. Требуется: $${totalPrice.toFixed(2)}, доступно: $${tenantBalance.toFixed(2)}`
        );
      }

      // Get owner balance
      const ownerResult = await client.query(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [ownerId]);
      const ownerBalance = parseFloat(ownerResult.rows[0].balance);

      // Deduct from tenant
      const newTenantBalance = tenantBalance - totalPrice;
      await client.query(
        `UPDATE users SET balance = $1, total_spent = total_spent + $2, updated_at = NOW() WHERE id = $3`,
        [newTenantBalance, totalPrice, tenant.id]
      );

      // Pay owner (P2P transfer)
      const newOwnerBalance = ownerBalance + totalPrice;
      await client.query(`UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2`, [
        newOwnerBalance,
        ownerId
      ]);

      // Create tenant transaction (debit)
      const tenantTxResult = await client.query(
        `INSERT INTO transactions (
          user_id, type, amount, balance_before, balance_after, description, metadata, created_at
        ) VALUES ($1, 'slot_rental', $2, $3, $4, $5, $6, NOW()) RETURNING id`,
        [
          tenant.id,
          -totalPrice,
          tenantBalance,
          newTenantBalance,
          `Аренда ${slotsCount} слотов на ${site.site_name || site.site_url} (${RENTAL_PRICING.RENTAL_PERIOD_DAYS} дней)`,
          JSON.stringify({
            siteId,
            siteName: site.site_name || site.site_url,
            slotsCount,
            pricePerSlot: finalPricePerSlot,
            ownerId,
            ownerUsername: site.owner_username
          })
        ]
      );

      // Create owner transaction (credit)
      await client.query(
        `INSERT INTO transactions (
          user_id, type, amount, balance_before, balance_after, description, metadata, created_at
        ) VALUES ($1, 'slot_rental_income', $2, $3, $4, $5, $6, NOW())`,
        [
          ownerId,
          totalPrice,
          ownerBalance,
          newOwnerBalance,
          `Доход от аренды ${slotsCount} слотов на ${site.site_name || site.site_url}`,
          JSON.stringify({
            siteId,
            slotsCount,
            tenantId: tenant.id,
            tenantUsername: tenant.username,
            pricePerSlot: finalPricePerSlot
          })
        ]
      );

      // Create ACTIVE rental record
      const rentalResult = await client.query(
        `INSERT INTO site_slot_rentals (
          site_id, owner_id, tenant_id, slots_count, slots_used,
          price_per_slot, total_price, discount_applied,
          starts_at, expires_at, status, payment_transaction_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 0, $5, $6, 0, NOW(), $7, 'active', $8, NOW(), NOW())
        RETURNING *`,
        [
          siteId,
          ownerId,
          tenant.id,
          slotsCount,
          finalPricePerSlot,
          totalPrice,
          expiresAt,
          tenantTxResult.rows[0].id
        ]
      );

      // Reserve slots on site
      await client.query(`UPDATE sites SET used_links = used_links + $1, updated_at = NOW() WHERE id = $2`, [
        slotsCount,
        siteId
      ]);

      // Log rental creation
      await logRentalAction(
        client,
        rentalResult.rows[0].id,
        'created',
        ownerId,
        'admin',
        null,
        'active',
        { slotsCount, totalPrice, tenantUsername: tenant.username }
      );

      // Notifications for admin-created rental
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
         VALUES ($1, 'slot_rental_purchased', $2, $3, $4, NOW())`,
        [
          tenant.id,
          'Аренда слотов оформлена',
          `Вы арендовали ${slotsCount} слотов на ${site.site_name || site.site_url} до ${expiresAt.toLocaleDateString('ru-RU')}. Размещайте ссылки бесплатно!`,
          JSON.stringify({ rentalId: rentalResult.rows[0].id, expiresAt })
        ]
      );

      await client.query('COMMIT');

      // Invalidate cache for this site (slots changed)
      await cache.clearRentalCache(siteId);

      logger.info('Slot rental created by admin (immediate activation)', {
        rentalId: rentalResult.rows[0].id,
        ownerId,
        tenantId: tenant.id,
        siteId,
        slotsCount,
        totalPrice
      });

      return {
        success: true,
        rental: rentalResult.rows[0],
        tenantNewBalance: newTenantBalance,
        ownerNewBalance: newOwnerBalance,
        status: 'active'
      };
    }

    // NON-ADMIN OWNER: Create PENDING rental (no payment yet)
    const rentalResult = await client.query(
      `INSERT INTO site_slot_rentals (
        site_id, owner_id, tenant_id, slots_count, slots_used,
        price_per_slot, total_price, discount_applied,
        starts_at, expires_at, status, payment_transaction_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 0, $5, $6, 0, NULL, $7, 'pending_approval', NULL, NOW(), NOW())
      RETURNING *`,
      [
        siteId,
        ownerId,
        tenant.id,
        slotsCount,
        finalPricePerSlot,
        totalPrice,
        expiresAt
      ]
    );

    // Log rental creation
    await logRentalAction(
      client,
      rentalResult.rows[0].id,
      'created',
      ownerId,
      'owner',
      null,
      'pending_approval',
      { slotsCount, totalPrice, tenantUsername: tenant.username }
    );

    // Notification for tenant about pending request
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
       VALUES ($1, 'rental_request', $2, $3, $4, NOW())`,
      [
        tenant.id,
        'Запрос на аренду',
        `Пользователь "${site.owner_username}" предлагает вам арендовать ${slotsCount} слотов на ${site.site_name || site.site_url} за $${totalPrice.toFixed(2)}`,
        JSON.stringify({ rentalId: rentalResult.rows[0].id, slotsCount, totalPrice })
      ]
    );

    await client.query('COMMIT');

    // Invalidate cache for this site (slots reserved in pending state)
    await cache.clearRentalCache(siteId);

    logger.info('Slot rental request created (pending approval)', {
      rentalId: rentalResult.rows[0].id,
      ownerId,
      tenantId: tenant.id,
      siteId,
      slotsCount,
      totalPrice
    });

    return {
      success: true,
      rental: rentalResult.rows[0],
      status: 'pending_approval',
      message: 'Запрос на аренду отправлен арендатору для подтверждения'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create slot rental', {
      ownerId,
      siteId,
      tenantUsername,
      slotsCount,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Renew slot rental (tenant pays owner)
 * Price = total_price * 0.7 (only 30% discount, NO personal discount)
 */
const renewSlotRental = async (tenantId, rentalId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get rental with all related data
    const rentalResult = await client.query(
      `SELECT r.*,
              s.site_name, s.site_url,
              o.balance as owner_balance, o.username as owner_username,
              t.balance as tenant_balance
       FROM site_slot_rentals r
       JOIN sites s ON r.site_id = s.id
       JOIN users o ON r.owner_id = o.id
       JOIN users t ON r.tenant_id = t.id
       WHERE r.id = $1 AND r.tenant_id = $2
       FOR UPDATE OF r, o, t`,
      [rentalId, tenantId]
    );

    if (rentalResult.rows.length === 0) {
      throw new Error('Аренда не найдена или недостаточно прав');
    }

    const rental = rentalResult.rows[0];

    if (rental.status !== 'active' && rental.status !== 'expired') {
      throw new Error('Можно продлить только активную или истёкшую аренду');
    }

    // 2. Calculate renewal price
    // Formula: total_price * 0.7 (only 30% discount, NO personal discount on rental renewals)
    const originalPrice = parseFloat(rental.total_price);
    const renewalPrice = originalPrice * (1 - RENTAL_PRICING.RENEWAL_DISCOUNT / 100);

    // 3. Check tenant balance
    const tenantBalance = parseFloat(rental.tenant_balance);
    if (tenantBalance < renewalPrice) {
      throw new Error(`Недостаточно средств для продления. Требуется: $${renewalPrice.toFixed(2)}`);
    }

    // 4. Process payment
    const newTenantBalance = tenantBalance - renewalPrice;
    await client.query(
      `UPDATE users SET balance = $1, total_spent = total_spent + $2, updated_at = NOW() WHERE id = $3`,
      [newTenantBalance, renewalPrice, tenantId]
    );

    const newOwnerBalance = parseFloat(rental.owner_balance) + renewalPrice;
    await client.query(`UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2`, [
      newOwnerBalance,
      rental.owner_id
    ]);

    // 5. Extend rental
    const currentExpiry = new Date(rental.expires_at);
    const newExpiresAt = new Date(Math.max(currentExpiry.getTime(), Date.now()));
    newExpiresAt.setDate(newExpiresAt.getDate() + RENTAL_PRICING.RENTAL_PERIOD_DAYS);

    await client.query(
      `UPDATE site_slot_rentals
       SET expires_at = $1, status = 'active', updated_at = NOW()
       WHERE id = $2`,
      [newExpiresAt, rentalId]
    );

    // 6. Create transactions
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, metadata, created_at)
       VALUES ($1, 'slot_rental_renewal', $2, $3, $4, $5, $6, NOW())`,
      [
        tenantId,
        -renewalPrice,
        tenantBalance,
        newTenantBalance,
        `Продление аренды ${rental.slots_count} слотов на ${rental.site_name || rental.site_url}`,
        JSON.stringify({
          rentalId,
          siteId: rental.site_id,
          slotsCount: rental.slots_count,
          originalPrice,
          renewalDiscount: RENTAL_PRICING.RENEWAL_DISCOUNT
        })
      ]
    );

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, metadata, created_at)
       VALUES ($1, 'slot_rental_income', $2, $3, $4, $5, $6, NOW())`,
      [
        rental.owner_id,
        renewalPrice,
        rental.owner_balance,
        newOwnerBalance,
        `Продление аренды ${rental.slots_count} слотов от ${rental.tenant_username || 'арендатора'}`,
        JSON.stringify({ rentalId, tenantId })
      ]
    );

    // 7. Notifications
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
       VALUES ($1, 'slot_rental_renewed', $2, $3, $4, NOW())`,
      [
        tenantId,
        'Аренда продлена',
        `Аренда ${rental.slots_count} слотов на ${rental.site_name || rental.site_url} продлена до ${newExpiresAt.toLocaleDateString('ru-RU')}`,
        JSON.stringify({ rentalId, newExpiresAt })
      ]
    );

    await client.query('COMMIT');

    logger.info('Slot rental renewed', {
      rentalId,
      tenantId,
      renewalPrice,
      newExpiresAt
    });

    return {
      success: true,
      newExpiresAt,
      renewalPrice,
      newBalance: newTenantBalance,
      discountsApplied: {
        renewal: RENTAL_PRICING.RENEWAL_DISCOUNT,
        personal: 0, // NO personal discount on rental renewals
        total: RENTAL_PRICING.RENEWAL_DISCOUNT
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to renew slot rental', { tenantId, rentalId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get user's slot rentals
 * @param {number} userId - User ID
 * @param {string} role - 'owner', 'tenant', or 'all'
 */
const getUserSlotRentals = async (userId, role = 'all') => {
  let whereClause = '';

  if (role === 'owner') {
    whereClause = 'WHERE r.owner_id = $1';
  } else if (role === 'tenant') {
    whereClause = 'WHERE r.tenant_id = $1';
  } else {
    whereClause = 'WHERE r.owner_id = $1 OR r.tenant_id = $1';
  }

  const result = await query(
    `SELECT
       r.*,
       s.site_name, s.site_url, s.max_links, s.max_articles,
       s.dr, s.da, s.tf, s.cf, s.ref_domains, s.rd_main, s.norm,
       s.keywords, s.traffic, s.geo, s.site_type,
       owner.username as owner_username,
       tenant.username as tenant_username
     FROM site_slot_rentals r
     JOIN sites s ON r.site_id = s.id
     JOIN users owner ON r.owner_id = owner.id
     JOIN users tenant ON r.tenant_id = tenant.id
     ${whereClause}
     ORDER BY r.created_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Get active rental for a specific site and user
 */
const getActiveRentalForSite = async (userId, siteId) => {
  const result = await query(
    `SELECT r.*, s.site_name, s.site_url
     FROM site_slot_rentals r
     JOIN sites s ON r.site_id = s.id
     WHERE r.tenant_id = $1 AND r.site_id = $2
     AND r.status = 'active' AND r.expires_at > NOW()
     AND r.slots_used < r.slots_count`,
    [userId, siteId]
  );

  return result.rows[0] || null;
};

/**
 * Cancel slot rental (owner only, if no slots used)
 */
const cancelSlotRental = async (ownerId, rentalId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get rental
    const rentalResult = await client.query(
      `SELECT r.*, s.site_name, t.username as tenant_username
       FROM site_slot_rentals r
       JOIN sites s ON r.site_id = s.id
       JOIN users t ON r.tenant_id = t.id
       WHERE r.id = $1 AND r.owner_id = $2
       FOR UPDATE`,
      [rentalId, ownerId]
    );

    if (rentalResult.rows.length === 0) {
      throw new Error('Аренда не найдена или недостаточно прав');
    }

    const rental = rentalResult.rows[0];

    if (rental.slots_used > 0) {
      throw new Error(`Нельзя отменить аренду: использовано ${rental.slots_used} слотов`);
    }

    if (rental.status !== 'active') {
      throw new Error('Можно отменить только активную аренду');
    }

    // Update rental status
    await client.query(`UPDATE site_slot_rentals SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [
      rentalId
    ]);

    // Log cancellation
    await logRentalAction(
      client,
      rentalId,
      'cancelled',
      ownerId,
      'owner',
      rental.status,
      'cancelled',
      { refundAmount: rental.total_price, tenantUsername: rental.tenant_username }
    );

    // Release reserved slots
    await client.query(`UPDATE sites SET used_links = used_links - $1, updated_at = NOW() WHERE id = $2`, [
      rental.slots_count,
      rental.site_id
    ]);

    // Refund tenant
    await client.query(`UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`, [
      rental.total_price,
      rental.tenant_id
    ]);

    // Deduct from owner
    await client.query(`UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2`, [
      rental.total_price,
      ownerId
    ]);

    // Create refund transactions
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, metadata, created_at)
       VALUES ($1, 'slot_rental_refund', $2, $3, $4, NOW())`,
      [
        rental.tenant_id,
        rental.total_price,
        `Возврат за отменённую аренду ${rental.slots_count} слотов на ${rental.site_name}`,
        JSON.stringify({ rentalId, reason: 'cancelled_by_owner' })
      ]
    );

    // Notification to tenant
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
       VALUES ($1, 'slot_rental_cancelled', $2, $3, $4, NOW())`,
      [
        rental.tenant_id,
        'Аренда отменена',
        `Владелец отменил аренду ${rental.slots_count} слотов на ${rental.site_name}. Средства возвращены на баланс.`,
        JSON.stringify({ rentalId, refundAmount: rental.total_price })
      ]
    );

    await client.query('COMMIT');

    logger.info('Slot rental cancelled', { rentalId, ownerId, refundAmount: rental.total_price });

    return { success: true, refundAmount: rental.total_price };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to cancel slot rental', { ownerId, rentalId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Use rented slot for placement (called from purchasePlacement)
 * Returns rental if used, null if no rental available
 */
const useRentedSlot = async (client, tenantId, siteId, placementId) => {
  // Find active rental with available slots
  const rentalResult = await client.query(
    `SELECT * FROM site_slot_rentals
     WHERE tenant_id = $1 AND site_id = $2
     AND status = 'active' AND expires_at > NOW()
     AND slots_used < slots_count
     FOR UPDATE`,
    [tenantId, siteId]
  );

  if (rentalResult.rows.length === 0) {
    return null;
  }

  const rental = rentalResult.rows[0];

  // Increment slots_used
  await client.query(
    `UPDATE site_slot_rentals SET slots_used = slots_used + 1, updated_at = NOW() WHERE id = $1`,
    [rental.id]
  );

  // Link placement to rental
  await client.query(`INSERT INTO rental_placements (rental_id, placement_id) VALUES ($1, $2)`, [
    rental.id,
    placementId
  ]);

  logger.info('Rented slot used', {
    rentalId: rental.id,
    tenantId,
    siteId,
    placementId,
    slotsRemaining: rental.slots_count - rental.slots_used - 1
  });

  return rental;
};

/**
 * Get rentals for a specific site (for owner view)
 */
const getSiteRentals = async (siteId, ownerId) => {
  const result = await query(
    `SELECT r.*, t.username as tenant_username
     FROM site_slot_rentals r
     JOIN users t ON r.tenant_id = t.id
     WHERE r.site_id = $1 AND r.owner_id = $2
     ORDER BY r.created_at DESC`,
    [siteId, ownerId]
  );

  return result.rows;
};

/**
 * Toggle auto-renewal for a rental (tenant only)
 * @param {number} tenantId - Tenant user ID
 * @param {number} rentalId - Rental ID
 * @param {boolean} enabled - Enable or disable auto-renewal
 */
const toggleRentalAutoRenewal = async (tenantId, rentalId, enabled) => {
  // First check if rental exists and get its details
  const checkResult = await query(
    `SELECT id, tenant_id, status FROM site_slot_rentals WHERE id = $1`,
    [rentalId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Аренда не найдена');
  }

  const rental = checkResult.rows[0];

  if (rental.tenant_id !== tenantId) {
    throw new Error('Недостаточно прав для изменения этой аренды');
  }

  if (rental.status !== 'active') {
    throw new Error('Авто-продление доступно только для активных аренд');
  }

  // Now perform the update
  const result = await query(
    `UPDATE site_slot_rentals
     SET auto_renewal = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [enabled, rentalId]
  );

  const updatedRental = result.rows[0];

  // Calculate renewal price for response (30% discount only, NO personal discount)
  const renewalPrice = parseFloat(updatedRental.total_price) * 0.7;

  logger.info('Rental auto-renewal toggled', {
    rentalId,
    tenantId,
    enabled,
    renewalPrice
  });

  return {
    ...updatedRental,
    renewal_price: renewalPrice
  };
};

/**
 * Approve a pending rental request (tenant approves)
 * @param {number} tenantId - Tenant user ID
 * @param {number} rentalId - Rental ID
 */
const approveSlotRental = async (tenantId, rentalId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get rental with lock
    const rentalResult = await client.query(
      `SELECT r.*, s.site_name, s.site_url, s.api_key, u.username as owner_username
       FROM site_slot_rentals r
       JOIN sites s ON r.site_id = s.id
       JOIN users u ON r.owner_id = u.id
       WHERE r.id = $1 AND r.tenant_id = $2 AND r.status = 'pending_approval'
       FOR UPDATE`,
      [rentalId, tenantId]
    );

    if (rentalResult.rows.length === 0) {
      throw new Error('Аренда не найдена или уже обработана');
    }

    const rental = rentalResult.rows[0];
    const totalPrice = parseFloat(rental.total_price);

    // Check tenant balance
    const balanceResult = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [
      tenantId
    ]);
    const tenantBalance = parseFloat(balanceResult.rows[0].balance);

    if (tenantBalance < totalPrice) {
      throw new Error(`Недостаточно средств. Требуется: $${totalPrice.toFixed(2)}, на балансе: $${tenantBalance.toFixed(2)}`);
    }

    // Re-check available slots before approving (in case other rentals were approved meanwhile)
    const siteCheck = await client.query(
      'SELECT max_links, used_links FROM sites WHERE id = $1',
      [rental.site_id]
    );
    const site = siteCheck.rows[0];

    // Count already reserved slots (excluding current rental)
    const reservedCheck = await client.query(
      `SELECT COALESCE(SUM(slots_count), 0) as reserved_slots
       FROM site_slot_rentals
       WHERE site_id = $1 AND status IN ('active', 'pending_approval', 'pending_payment') AND id != $2`,
      [rental.site_id, rentalId]
    );
    const reservedSlots = parseInt(reservedCheck.rows[0].reserved_slots) || 0;
    const availableSlots = site.max_links - site.used_links - reservedSlots;

    if (rental.slots_count > availableSlots) {
      throw new Error(
        `Недостаточно свободных слотов для одобрения. ` +
        `Доступно ${availableSlots}, запрошено ${rental.slots_count}. ` +
        `Занято: ${site.used_links} размещений + ${reservedSlots} в активных арендах из ${site.max_links}`
      );
    }

    // Deduct from tenant
    await client.query('UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [
      totalPrice,
      tenantId
    ]);

    // Credit to owner
    await client.query('UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [
      totalPrice,
      rental.owner_id
    ]);

    // Reserve slots on site
    await client.query('UPDATE sites SET used_links = used_links + $1, updated_at = NOW() WHERE id = $2', [
      rental.slots_count,
      rental.site_id
    ]);

    // Activate rental
    await client.query(
      `UPDATE site_slot_rentals
       SET status = 'active', starts_at = NOW(), expires_at = NOW() + INTERVAL '365 days', updated_at = NOW()
       WHERE id = $1`,
      [rentalId]
    );

    // Log approval action
    await logRentalAction(
      client,
      rentalId,
      'approved',
      tenantId,
      'tenant',
      'pending_approval',
      'active',
      { totalPrice, ownerUsername: rental.owner_username }
    );

    // Create transaction for tenant (expense)
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, created_at)
       VALUES ($1, 'slot_rental', $2, $3, NOW())`,
      [tenantId, -totalPrice, `Аренда ${rental.slots_count} слотов на ${rental.site_name}`]
    );

    // Create transaction for owner (income)
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, created_at)
       VALUES ($1, 'slot_rental_income', $2, $3, NOW())`,
      [rental.owner_id, totalPrice, `Доход от аренды ${rental.slots_count} слотов на ${rental.site_name}`]
    );

    // Create notification for owner
    const notificationService = require('./notification.service');
    await notificationService.create(rental.owner_id, {
      type: 'rental_approved',
      title: 'Аренда подтверждена',
      message: `Пользователь подтвердил аренду ${rental.slots_count} слотов на сайте ${rental.site_name}`
    });

    await client.query('COMMIT');

    // Invalidate cache for this site (slots activated)
    await cache.clearRentalCache(rental.site_id);

    logger.info('Slot rental approved', {
      rentalId,
      tenantId,
      ownerId: rental.owner_id,
      siteId: rental.site_id,
      slotsCount: rental.slots_count,
      totalPrice
    });

    // Send webhook to WordPress site (optional - won't break if fails)
    const webhookResult = await wordpressRentalService.notifyRentalStatusChange(
      rental.site_url,
      rental.api_key || '',
      {
        id: rentalId,
        slot_type: rental.slot_type || 'link',
        slot_count: rental.slots_count,
        tenant_id: tenantId,
        expires_at: rental.expires_at,
        status: 'active'
      },
      'approved'
    );

    if (!webhookResult.success) {
      logger.warn(`[Rental] WordPress webhook failed for rental ${rentalId}, but rental approved successfully`);
    }

    return { rentalId, approved: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reject a pending rental request (tenant rejects)
 * @param {number} tenantId - Tenant user ID
 * @param {number} rentalId - Rental ID
 */
const rejectSlotRental = async (tenantId, rentalId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get rental with site data before updating
    const rentalCheck = await client.query(
      `SELECT r.*, s.site_url, s.api_key, s.site_name
       FROM site_slot_rentals r
       JOIN sites s ON r.site_id = s.id
       WHERE r.id = $1 AND r.tenant_id = $2 AND r.status = 'pending_approval'`,
      [rentalId, tenantId]
    );

    if (rentalCheck.rows.length === 0) {
      throw new Error('Аренда не найдена или уже обработана');
    }

    const siteData = rentalCheck.rows[0];

    // Now update the rental status
    const result = await client.query(
      `UPDATE site_slot_rentals
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending_approval'
       RETURNING *`,
      [rentalId, tenantId]
    );

    const rental = result.rows[0];

    // Log rejection
    await logRentalAction(
      client,
      rentalId,
      'rejected',
      tenantId,
      'tenant',
      'pending_approval',
      'rejected',
      { ownerUsername: rental.owner_username }
    );

    // Notify owner about rejection
    const notificationService = require('./notification.service');
    await notificationService.create(rental.owner_id, {
      type: 'rental_rejected',
      title: 'Аренда отклонена',
      message: `Пользователь отклонил запрос на аренду слотов`
    });

    await client.query('COMMIT');

    logger.info('Slot rental rejected', {
      rentalId,
      tenantId,
      ownerId: rental.owner_id
    });

    // Send webhook to WordPress site (optional - won't break if fails)
    const webhookResult = await wordpressRentalService.notifyRentalStatusChange(
      siteData.site_url,
      siteData.api_key || '',
      {
        id: rentalId,
        slot_type: rental.slot_type || 'link',
        slot_count: rental.slots_count,
        tenant_id: tenantId,
        expires_at: rental.expires_at,
        status: 'rejected'
      },
      'rejected'
    );

    if (!webhookResult.success) {
      logger.warn(`[Rental] WordPress webhook failed for rental ${rentalId}, but rental rejected successfully`);
    }

    return { rentalId, rejected: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Log rental action to history JSONB field
 * @param {object} client - Database client (transaction)
 * @param {number} rentalId - Rental ID
 * @param {string} action - Action type (created, approved, rejected, cancelled, renewed)
 * @param {number} actorId - User ID who performed action
 * @param {string} actorRole - Role (owner, tenant, admin)
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @param {object} metadata - Additional metadata (optional)
 */
const logRentalAction = async (
  client,
  rentalId,
  action,
  actorId,
  actorRole,
  oldStatus,
  newStatus,
  metadata = {}
) => {
  const entry = {
    action,
    actor_id: actorId,
    actor_role: actorRole,
    old_status: oldStatus,
    new_status: newStatus,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  await client.query(
    `UPDATE site_slot_rentals
     SET history = COALESCE(history, '[]'::jsonb) || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify([entry]), rentalId]
  );
};

/**
 * Get available slots for rental on a site
 * Takes into account: used_links + reserved slots in active/pending rentals
 * @param {number} siteId - Site ID
 * @param {number} userId - User ID (must be site owner)
 */
const getAvailableSlots = async (siteId, userId) => {
  // Try cache first (60 second TTL)
  const cacheKey = `rental:available:site:${siteId}`;
  const cached = await cache.get(cacheKey);
  if (cached && cached.userId === userId) {
    return cached.data;
  }

  const client = await pool.connect();
  try {
    // 1. Get site data and verify ownership
    const siteResult = await client.query(
      'SELECT max_links, used_links, user_id, site_name, site_url FROM sites WHERE id = $1',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      throw new Error('Сайт не найден');
    }

    const site = siteResult.rows[0];

    // 2. Verify user is site owner
    if (site.user_id !== userId) {
      throw new Error('Только владелец сайта может просматривать доступные слоты');
    }

    // 3. Count slots reserved in rentals (active + pending approval/payment)
    const rentalsResult = await client.query(
      `SELECT COALESCE(SUM(slots_count), 0) as reserved_slots
       FROM site_slot_rentals
       WHERE site_id = $1 AND status IN ('active', 'pending_approval', 'pending_payment')`,
      [siteId]
    );

    const reservedSlots = parseInt(rentalsResult.rows[0].reserved_slots) || 0;

    // 4. Calculate available slots
    const availableSlots = Math.max(0, site.max_links - site.used_links - reservedSlots);

    const result = {
      max_links: site.max_links,
      used_links: site.used_links,
      reserved_slots: reservedSlots,
      available_slots: availableSlots,
      site_name: site.site_name || site.site_url
    };

    // Cache result with 60 second TTL
    await cache.set(cacheKey, { userId, data: result }, 60);

    return result;
  } finally {
    client.release();
  }
};

module.exports = {
  PRICING,
  RENTAL_PRICING,
  getUserBalance,
  calculateDiscountTier,
  getDiscountTiers,
  addBalance,
  purchasePlacement,
  batchPurchasePlacements,
  batchDeletePlacements,
  renewPlacement,
  toggleAutoRenewal,
  getUserTransactions,
  getPricingForUser,
  refundPlacement,
  deleteAndRefundPlacement,
  refundPlacementInTransaction,
  restoreUsageCountsInTransaction,
  publishScheduledPlacement,
  publishPlacementAsync,
  createReferralCommission,
  // Slot rentals
  createSlotRental,
  renewSlotRental,
  getUserSlotRentals,
  getActiveRentalForSite,
  cancelSlotRental,
  useRentedSlot,
  getSiteRentals,
  toggleRentalAutoRenewal,
  approveSlotRental,
  rejectSlotRental,
  getAvailableSlots
};
