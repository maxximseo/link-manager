/**
 * Migration script to sync user discount tiers with actual spent amounts from transactions
 *
 * This script:
 * 1. Calculates total_spent for each user from transactions table (purchase + renewal)
 * 2. Updates users.total_spent to match calculated value
 * 3. Updates users.current_discount based on discount_tiers table
 *
 * Run: node database/run_sync_discounts_migration.js
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_HOST?.includes('digitalocean') ? { rejectUnauthorized: false } : false
    };

const pool = new Pool(connectionConfig);

async function syncDiscounts() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting discount sync migration...\n');

    // Get all users with their calculated total_spent from transactions
    const usersResult = await client.query(`
      SELECT
        u.id,
        u.username,
        u.total_spent as old_total_spent,
        u.current_discount as old_discount,
        COALESCE(ABS((
          SELECT SUM(amount)
          FROM transactions t
          WHERE t.user_id = u.id AND t.type IN ('purchase', 'renewal')
        )), 0) as calculated_total_spent
      FROM users u
      ORDER BY u.id
    `);

    console.log(`Found ${usersResult.rows.length} users to check\n`);

    // Get discount tiers
    const tiersResult = await client.query(`
      SELECT min_spent, discount_percentage, tier_name
      FROM discount_tiers
      ORDER BY min_spent DESC
    `);

    const tiers = tiersResult.rows;

    // Function to calculate discount tier
    function getDiscountTier(totalSpent) {
      for (const tier of tiers) {
        if (totalSpent >= parseFloat(tier.min_spent)) {
          return { discount: tier.discount_percentage, tier: tier.tier_name };
        }
      }
      return { discount: 0, tier: 'Стандарт' };
    }

    let updatedCount = 0;

    for (const user of usersResult.rows) {
      const oldTotalSpent = parseFloat(user.old_total_spent || 0);
      const calculatedTotalSpent = parseFloat(user.calculated_total_spent || 0);
      const oldDiscount = parseInt(user.old_discount || 0);

      const newTier = getDiscountTier(calculatedTotalSpent);

      // Check if update is needed
      const needsUpdate =
        Math.abs(oldTotalSpent - calculatedTotalSpent) > 0.01 ||
        oldDiscount !== newTier.discount;

      if (needsUpdate) {
        await client.query(`
          UPDATE users
          SET total_spent = $1, current_discount = $2
          WHERE id = $3
        `, [calculatedTotalSpent, newTier.discount, user.id]);

        console.log(`✅ Updated ${user.username} (ID: ${user.id}):`);
        console.log(`   total_spent: $${oldTotalSpent.toFixed(2)} → $${calculatedTotalSpent.toFixed(2)}`);
        console.log(`   discount: ${oldDiscount}% → ${newTier.discount}% (${newTier.tier})`);
        console.log('');

        updatedCount++;
      }
    }

    console.log(`\n✨ Migration complete! Updated ${updatedCount} users.`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

syncDiscounts().catch(err => {
  console.error(err);
  process.exit(1);
});
