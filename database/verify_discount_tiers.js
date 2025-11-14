/**
 * Verify Discount Tiers
 * Quick script to check current discount tier configuration
 */

const { pool } = require('../backend/config/database');

async function verifyTiers() {
  const client = await pool.connect();

  try {
    console.log('Current Discount Tiers:');
    console.log('========================\n');

    const tiers = await client.query(`
      SELECT min_spent, discount_percentage, tier_name
      FROM discount_tiers
      ORDER BY min_spent
    `);

    console.log('Tier Name       | Min Spent  | Discount');
    console.log('----------------|------------|----------');
    tiers.rows.forEach(tier => {
      const minSpent = `$${parseFloat(tier.min_spent).toFixed(2)}`.padEnd(10);
      const tierName = tier.tier_name.padEnd(15);
      console.log(`${tierName} | ${minSpent} | ${tier.discount_percentage}%`);
    });
    console.log('');

    console.log('✅ Verification complete!');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyTiers()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
