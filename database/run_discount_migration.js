/**
 * Migration Runner for Discount Tier Updates
 * Updates discount tier thresholds and recalculates all users' discounts
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('========================================');
    console.log('Discount Tier Migration Runner');
    console.log('========================================');
    console.log('');

    // Step 1: Show current discount tiers
    console.log('📊 CURRENT Discount Tiers (BEFORE migration):');
    console.log('');
    const currentTiers = await client.query(`
      SELECT min_spent, discount_percentage, tier_name
      FROM discount_tiers
      ORDER BY min_spent
    `);

    console.log('Tier Name       | Min Spent  | Discount');
    console.log('----------------|------------|----------');
    currentTiers.rows.forEach(tier => {
      const minSpent = `$${parseFloat(tier.min_spent).toFixed(2)}`.padEnd(10);
      const tierName = tier.tier_name.padEnd(15);
      console.log(`${tierName} | ${minSpent} | ${tier.discount_percentage}%`);
    });
    console.log('');

    // Step 2: Show users who will be affected
    console.log('👥 Users Affected by Migration:');
    console.log('');
    const affectedUsers = await client.query(`
      SELECT
        u.id,
        u.username,
        u.total_spent,
        u.current_discount as old_discount,
        (
          SELECT COALESCE(MAX(dt.discount_percentage), 0)
          FROM discount_tiers dt
          WHERE dt.min_spent <= u.total_spent
        ) as current_calculated_discount
      FROM users u
      WHERE u.total_spent > 0
      ORDER BY u.total_spent DESC
    `);

    if (affectedUsers.rows.length === 0) {
      console.log('No users with spending history found.');
    } else {
      console.log('User ID | Username       | Total Spent | Current Discount | Will Change?');
      console.log('--------|----------------|-------------|------------------|-------------');
      affectedUsers.rows.forEach(user => {
        const userId = String(user.id).padEnd(7);
        const username = user.username.substring(0, 14).padEnd(14);
        const totalSpent = `$${parseFloat(user.total_spent).toFixed(2)}`.padEnd(11);
        const oldDiscount = `${user.old_discount}%`.padEnd(16);

        // Determine new discount based on NEW thresholds
        let newDiscount = 0;
        const spent = parseFloat(user.total_spent);
        if (spent >= 10000) newDiscount = 30;
        else if (spent >= 5000) newDiscount = 25;
        else if (spent >= 3000) newDiscount = 20;
        else if (spent >= 2000) newDiscount = 15;
        else if (spent >= 1000) newDiscount = 10;

        const willChange = newDiscount !== user.old_discount ? `YES (${user.old_discount}% → ${newDiscount}%)` : 'NO';
        console.log(`${userId} | ${username} | ${totalSpent} | ${oldDiscount} | ${willChange}`);
      });
    }
    console.log('');

    // Step 3: Execute migration
    console.log('🔄 Starting migration...');
    console.log('');

    const migrationPath = path.join(__dirname, 'migrate_update_discount_tiers.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');

    // Step 4: Show NEW discount tiers
    console.log('📊 NEW Discount Tiers (AFTER migration):');
    console.log('');
    const newTiers = await client.query(`
      SELECT min_spent, discount_percentage, tier_name
      FROM discount_tiers
      ORDER BY min_spent
    `);

    console.log('Tier Name       | Min Spent  | Discount');
    console.log('----------------|------------|----------');
    newTiers.rows.forEach(tier => {
      const minSpent = `$${parseFloat(tier.min_spent).toFixed(2)}`.padEnd(10);
      const tierName = tier.tier_name.padEnd(15);
      console.log(`${tierName} | ${minSpent} | ${tier.discount_percentage}%`);
    });
    console.log('');

    // Step 5: Show updated user discounts
    console.log('👥 User Discounts (AFTER recalculation):');
    console.log('');
    const updatedUsers = await client.query(`
      SELECT
        u.id,
        u.username,
        u.total_spent,
        u.current_discount,
        dt.tier_name
      FROM users u
      LEFT JOIN discount_tiers dt ON dt.discount_percentage = u.current_discount
        AND dt.min_spent = (
          SELECT MAX(dt2.min_spent)
          FROM discount_tiers dt2
          WHERE dt2.min_spent <= u.total_spent
        )
      WHERE u.total_spent > 0
      ORDER BY u.total_spent DESC
    `);

    if (updatedUsers.rows.length === 0) {
      console.log('No users with spending history.');
    } else {
      console.log('User ID | Username       | Total Spent | New Discount | Tier Name');
      console.log('--------|----------------|-------------|--------------|---------------');
      updatedUsers.rows.forEach(user => {
        const userId = String(user.id).padEnd(7);
        const username = user.username.substring(0, 14).padEnd(14);
        const totalSpent = `$${parseFloat(user.total_spent).toFixed(2)}`.padEnd(11);
        const discount = `${user.current_discount}%`.padEnd(12);
        const tierName = (user.tier_name || 'Стандарт').padEnd(14);
        console.log(`${userId} | ${username} | ${totalSpent} | ${discount} | ${tierName}`);
      });
    }
    console.log('');

    // Step 6: Show summary statistics
    console.log('📈 Migration Summary:');
    console.log('');
    const stats = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE current_discount = 0) as standard_count,
        COUNT(*) FILTER (WHERE current_discount = 10) as bronze_count,
        COUNT(*) FILTER (WHERE current_discount = 15) as silver_count,
        COUNT(*) FILTER (WHERE current_discount = 20) as gold_count,
        COUNT(*) FILTER (WHERE current_discount = 25) as platinum_count,
        COUNT(*) FILTER (WHERE current_discount = 30) as diamond_count
      FROM users
      WHERE total_spent > 0
    `);

    const s = stats.rows[0];
    console.log(`  Standard (0%):   ${s.standard_count || 0} users`);
    console.log(`  Bronze (10%):    ${s.bronze_count || 0} users (min $1000 spent)`);
    console.log(`  Silver (15%):    ${s.silver_count || 0} users (min $2000 spent)`);
    console.log(`  Gold (20%):      ${s.gold_count || 0} users (min $3000 spent)`);
    console.log(`  Platinum (25%):  ${s.platinum_count || 0} users (min $5000 spent)`);
    console.log(`  Diamond (30%):   ${s.diamond_count || 0} users (min $10000 spent)`);
    console.log('');

    console.log('========================================');
    console.log('Migration completed successfully! ✨');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Error details:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('');
    console.log('Migration runner finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('Migration runner failed');
    process.exit(1);
  });
