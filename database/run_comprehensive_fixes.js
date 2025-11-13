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
  console.log('🔄 Starting comprehensive fixes migration...\n');

  try {
    // Pre-flight checks
    console.log('📋 Running pre-flight checks...\n');

    // Check 1: Invalid placement_content
    const invalidPlacementContent = await pool.query(`
      SELECT COUNT(*) as count
      FROM placement_content
      WHERE (link_id IS NULL AND article_id IS NULL)
         OR (link_id IS NOT NULL AND article_id IS NOT NULL)
    `);

    const invalidCount = parseInt(invalidPlacementContent.rows[0].count);
    if (invalidCount > 0) {
      console.log(`⚠️  WARNING: Found ${invalidCount} invalid placement_content records`);
      console.log('   These will be blocked by CHECK constraint.');

      const samples = await pool.query(`
        SELECT id, placement_id, link_id, article_id
        FROM placement_content
        WHERE (link_id IS NULL AND article_id IS NULL)
           OR (link_id IS NOT NULL AND article_id IS NOT NULL)
        LIMIT 5
      `);
      console.log('   Sample invalid records:', samples.rows);
      console.log('');
    } else {
      console.log('✅ No invalid placement_content records');
    }

    // Check 2: Duplicate anchor texts
    const duplicateAnchors = await pool.query(`
      SELECT project_id, LOWER(anchor_text) as anchor, COUNT(*) as count
      FROM project_links
      GROUP BY project_id, LOWER(anchor_text)
      HAVING COUNT(*) > 1
      LIMIT 5
    `);

    if (duplicateAnchors.rows.length > 0) {
      console.log(`⚠️  WARNING: Found ${duplicateAnchors.rows.length} duplicate anchor texts`);
      console.log('   Sample duplicates:', duplicateAnchors.rows);
      console.log('   UNIQUE index creation will FAIL. Please fix duplicates first.');
      console.log('');
      process.exit(1);
    } else {
      console.log('✅ No duplicate anchor texts found');
    }

    // Check 3: Articles without slug
    const articlesWithoutSlug = await pool.query(`
      SELECT COUNT(*) as count
      FROM project_articles
      WHERE slug IS NULL OR slug = ''
    `);

    const sluglessCount = parseInt(articlesWithoutSlug.rows[0].count);
    if (sluglessCount > 0) {
      console.log(`ℹ️  INFO: Found ${sluglessCount} articles without slug (will be auto-generated)`);
    } else {
      console.log('✅ All articles have slugs');
    }

    console.log('\n========================================');
    console.log('Starting migration...');
    console.log('========================================\n');

    // Read and execute migration
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrate_comprehensive_fixes.sql'),
      'utf8'
    );

    await pool.query(migration);

    console.log('\n✅ Migration executed successfully!\n');

    // Post-migration verification
    console.log('📊 Post-migration verification:\n');

    // Verify constraints
    const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'placement_content'::regclass
        AND conname = 'check_placement_content_has_content'
    `);

    if (constraints.rows.length > 0) {
      console.log('✅ CHECK constraint added:', constraints.rows[0].conname);
    } else {
      console.log('⚠️  CHECK constraint not found');
    }

    // Verify indexes
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('project_links', 'placements')
        AND indexname IN ('idx_project_links_project_anchor_unique', 'idx_placements_status')
      ORDER BY indexname
    `);

    console.log(`\n✅ Indexes created: ${indexes.rows.length}/2`);
    indexes.rows.forEach(idx => {
      console.log(`   - ${idx.indexname}`);
    });

    // Verify slug column
    const slugColumn = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'project_articles'
        AND column_name = 'slug'
    `);

    if (slugColumn.rows.length > 0) {
      console.log('\n✅ Slug column added to project_articles');

      // Check how many slugs were generated
      const slugStats = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(slug) as with_slug,
          COUNT(*) - COUNT(slug) as without_slug
        FROM project_articles
      `);

      console.log(`   Total articles: ${slugStats.rows[0].total}`);
      console.log(`   With slug: ${slugStats.rows[0].with_slug}`);
      console.log(`   Without slug: ${slugStats.rows[0].without_slug}`);
    }

    console.log('\n========================================');
    console.log('✅ All fixes applied successfully!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.code === '23505') {
      console.error('\n💡 Duplicate key violation detected.');
      console.error('   This means you have duplicate anchor texts in project_links.');
      console.error('   Please remove duplicates before running this migration.\n');
    }
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
