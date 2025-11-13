const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

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
  console.log('🔄 Starting placement_content CHECK constraint migration...');

  try {
    // Check for invalid records first
    const invalidCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM placement_content
      WHERE (link_id IS NULL AND article_id IS NULL)
         OR (link_id IS NOT NULL AND article_id IS NOT NULL)
    `);

    const invalidCount = parseInt(invalidCheck.rows[0].count);

    if (invalidCount > 0) {
      console.log(`❌ Found ${invalidCount} invalid placement_content records.`);
      console.log('Fetching invalid records...');

      const invalidRecords = await pool.query(`
        SELECT id, placement_id, link_id, article_id
        FROM placement_content
        WHERE (link_id IS NULL AND article_id IS NULL)
           OR (link_id IS NOT NULL AND article_id IS NOT NULL)
        LIMIT 10
      `);

      console.log('Sample invalid records:', invalidRecords.rows);
      console.log('\n⚠️  Please fix these records manually before running migration.');
      process.exit(1);
    }

    console.log('✅ No invalid records found. Proceeding with migration...');

    // Read migration file
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_fix_placement_content_constraint.sql'),
      'utf8'
    );

    // Execute migration
    await pool.query(migration);

    console.log('✅ Migration completed successfully!');

    // Verify constraint was added
    const constraintCheck = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'placement_content'::regclass
        AND conname = 'check_placement_content_has_content'
    `);

    if (constraintCheck.rows.length > 0) {
      console.log('\n📊 Constraint added successfully:');
      console.log('Name:', constraintCheck.rows[0].conname);
      console.log('Definition:', constraintCheck.rows[0].definition);
    } else {
      console.log('⚠️  Warning: Constraint not found after migration.');
    }

    // Show sample records
    const sampleRecords = await pool.query(`
      SELECT id, placement_id,
             CASE WHEN link_id IS NOT NULL THEN 'link' ELSE 'article' END as content_type,
             COALESCE(link_id, article_id) as content_id
      FROM placement_content
      LIMIT 5
    `);

    console.log('\n📈 Sample placement_content records:');
    console.table(sampleRecords.rows);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
