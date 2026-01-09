/**
 * Fix placement_content issues:
 * 1. Delete orphan records
 * 2. Drop invalid UNIQUE index on link_id
 *
 * Run: node database/fix_placement_content.js
 */

const { query } = require('../backend/config/database');

async function fix() {
  console.log('🔧 Fixing placement_content issues...\n');

  try {
    // Step 1: Delete orphan records
    console.log('1. Deleting orphan records...');
    const deleteOrphans = await query(`
      DELETE FROM placement_content
      WHERE placement_id NOT IN (SELECT id FROM placements)
      RETURNING id, link_id, article_id
    `);
    console.log(`   ✅ Deleted ${deleteOrphans.rows.length} orphan records`);
    if (deleteOrphans.rows.length > 0) {
      deleteOrphans.rows.forEach(r => {
        console.log(`      - id=${r.id}, link_id=${r.link_id || 'null'}, article_id=${r.article_id || 'null'}`);
      });
    }

    // Step 2: Drop the problematic UNIQUE index on link_id
    console.log('\n2. Dropping placement_content_link_id_key index...');
    await query(`DROP INDEX IF EXISTS placement_content_link_id_key`);
    console.log('   ✅ Index dropped');

    // Step 3: Verify the fix
    console.log('\n3. Verifying indexes after fix...');
    const indexes = await query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'placement_content'
        AND indexname LIKE '%link_id%'
    `);
    console.log('   Remaining link_id indexes:');
    indexes.rows.forEach(i => {
      const isUnique = i.indexdef.includes('UNIQUE') ? '⚠️ UNIQUE' : '✅ regular';
      console.log(`   - ${i.indexname}: ${isUnique}`);
    });

    console.log('\n✅ Fix complete! You can now place links again.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

fix();
