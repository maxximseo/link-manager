const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Parse DATABASE_URL
const url = new URL(process.env.DATABASE_URL);
const config = {
  host: url.hostname,
  port: url.port || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false }
};

const pool = new Pool(config);

async function runMigration() {
  console.log('🔄 Starting billing system migration...');

  try {
    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_add_billing_system.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ Migration completed successfully!');

    // Verify changes - users table
    console.log('\n📊 Verifying users table...');
    const usersColumns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('balance', 'total_spent', 'current_discount', 'last_login', 'failed_login_attempts', 'account_locked_until', 'email_verified', 'verification_token')
      ORDER BY column_name
    `);
    console.log('Users columns added:', usersColumns.rows);

    // Verify new tables
    console.log('\n📊 Verifying new tables...');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('transactions', 'discount_tiers', 'renewal_history', 'notifications', 'audit_log')
      ORDER BY table_name
    `);
    console.log('New tables created:', tables.rows.map(r => r.table_name));

    // Verify placements updates
    console.log('\n📊 Verifying placements table...');
    const placementsColumns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'placements'
      AND column_name IN ('original_price', 'discount_applied', 'final_price', 'purchased_at', 'scheduled_publish_date', 'published_at', 'expires_at', 'auto_renewal', 'renewal_price', 'last_renewed_at', 'renewal_count', 'purchase_transaction_id')
      ORDER BY column_name
    `);
    console.log('Placements columns added:', placementsColumns.rows.length, 'columns');

    // Check discount tiers
    console.log('\n💰 Discount tiers:');
    const discountTiers = await pool.query(`
      SELECT tier_name, min_spent, discount_percentage
      FROM discount_tiers
      ORDER BY min_spent
    `);
    console.table(discountTiers.rows);

    // Show current database stats
    console.log('\n📈 Current database stats:');
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM projects) as projects,
        (SELECT COUNT(*) FROM sites) as sites,
        (SELECT COUNT(*) FROM placements) as placements,
        (SELECT COUNT(*) FROM project_links) as links,
        (SELECT COUNT(*) FROM project_articles) as articles,
        (SELECT COUNT(*) FROM transactions) as transactions,
        (SELECT COUNT(*) FROM notifications) as notifications
    `);
    console.table(stats.rows[0]);

    console.log('\n✨ Billing system migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Create billing.service.js');
    console.log('2. Update placement.service.js with purchase logic');
    console.log('3. Create billing API routes');
    console.log('4. Update frontend interfaces');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
