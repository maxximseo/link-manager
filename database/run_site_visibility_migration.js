/**
 * Migration Runner for Site Visibility Control
 * Adds is_public column to sites table for marketplace visibility
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('========================================');
    console.log('Site Visibility Migration Runner');
    console.log('========================================');
    console.log('');

    // Step 1: Show current sites status
    console.log('📊 CURRENT Sites (BEFORE migration):');
    console.log('');
    const currentSites = await client.query(`
      SELECT
        COUNT(*) as total_sites,
        COUNT(DISTINCT user_id) as total_owners
      FROM sites
    `);

    const stats = currentSites.rows[0];
    console.log(`  Total sites: ${stats.total_sites}`);
    console.log(`  Total site owners: ${stats.total_owners}`);
    console.log('');

    // Check if is_public column already exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sites' AND column_name = 'is_public'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('⚠️  Column is_public already exists. Migration may have been run before.');
      console.log('');

      // Show current visibility distribution
      const visibilityStats = await client.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_public THEN 1 ELSE 0 END) as public_sites,
          SUM(CASE WHEN NOT is_public THEN 1 ELSE 0 END) as private_sites
        FROM sites
      `);

      const vis = visibilityStats.rows[0];
      console.log('Current visibility distribution:');
      console.log(`  Public sites: ${vis.public_sites}`);
      console.log(`  Private sites: ${vis.private_sites}`);
      console.log('');
      console.log('Skipping migration (already applied).');
      console.log('========================================');
      return;
    }

    // Step 2: Read migration SQL file
    console.log('🔄 Starting migration...');
    console.log('');

    const migrationPath = path.join(__dirname, 'migrate_add_site_visibility.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Step 3: Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration executed successfully!');
    console.log('');

    // Step 4: Show updated sites statistics
    console.log('📊 AFTER Migration:');
    console.log('');

    const updatedStats = await client.query(`
      SELECT
        COUNT(*) as total_sites,
        SUM(CASE WHEN is_public THEN 1 ELSE 0 END) as public_sites,
        SUM(CASE WHEN NOT is_public THEN 1 ELSE 0 END) as private_sites
      FROM sites
    `);

    const updated = updatedStats.rows[0];
    console.log(`  Total sites: ${updated.total_sites}`);
    console.log(`  Public sites: ${updated.public_sites} (available to all users)`);
    console.log(`  Private sites: ${updated.private_sites} (owner only - DEFAULT)`);
    console.log('');

    // Step 5: Show sample sites
    console.log('📋 Sample Sites (first 5):');
    console.log('');
    const sampleSites = await client.query(`
      SELECT id, site_name, user_id, is_public
      FROM sites
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('ID    | Site Name                      | Owner ID | Visibility');
    console.log('------|--------------------------------|----------|------------');
    sampleSites.rows.forEach(site => {
      const id = String(site.id).padEnd(5);
      const name = site.site_name.substring(0, 30).padEnd(30);
      const ownerId = String(site.user_id).padEnd(8);
      const visibility = site.is_public ? 'Public' : 'Private';
      console.log(`${id} | ${name} | ${ownerId} | ${visibility}`);
    });
    console.log('');

    // Step 6: Show index status
    console.log('📈 Index Created:');
    console.log('');
    const indexCheck = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename = 'sites' AND indexname = 'idx_sites_visibility'
    `);

    if (indexCheck.rows.length > 0) {
      console.log('  ✅ idx_sites_visibility (optimizes marketplace queries)');
    } else {
      console.log('  ⚠️  Index not found - may need manual creation');
    }
    console.log('');

    console.log('========================================');
    console.log('Migration completed successfully! ✨');
    console.log('========================================');
    console.log('');
    console.log('📝 Summary:');
    console.log(`  - Added is_public column (default: FALSE)`);
    console.log(`  - All ${updated.private_sites} existing sites are now PRIVATE`);
    console.log(`  - Site owners can enable public access via UI checkbox`);
    console.log(`  - Created performance index for marketplace queries`);
    console.log('');
    console.log('🎯 Next steps:');
    console.log('  1. Restart server to reload schema');
    console.log('  2. Test site creation with public/private option');
    console.log('  3. Verify marketplace filtering works correctly');
    console.log('');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
console.log('');
runMigration()
  .then(() => {
    console.log('Migration runner finished successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration runner failed:', error);
    process.exit(1);
  });
