/**
 * Diagnostic script for placement_content issues
 * Run: node database/diagnose_placement_content.js
 */

const { query } = require('../backend/config/database');

async function diagnose() {
  console.log('🔍 Diagnosing placement_content issues...\n');

  try {
    // Step 1: Check constraints
    console.log('1. Checking constraints on placement_content table:');
    const constraints = await query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'placement_content'
    `);
    console.log('   Constraints found:');
    constraints.rows.forEach(c => {
      console.log(`   - ${c.constraint_name} (${c.constraint_type})`);
    });

    // Step 2: Find orphan records
    console.log('\n2. Finding orphan records (placement_content without valid placement):');
    const orphans = await query(`
      SELECT pc.* FROM placement_content pc
      WHERE pc.placement_id NOT IN (SELECT id FROM placements)
    `);
    console.log(`   Found ${orphans.rows.length} orphan records`);
    if (orphans.rows.length > 0) {
      console.log('   Orphan IDs:', orphans.rows.map(r => r.id).join(', '));
    }

    // Step 3: Find the problematic link
    console.log('\n3. Finding "casino uden om rofus" link records:');
    const problemLink = await query(`
      SELECT pc.id as content_id, pc.placement_id, pc.link_id,
             pl.anchor_text, p.site_id, s.site_url, p.status
      FROM placement_content pc
      LEFT JOIN placements p ON p.id = pc.placement_id
      LEFT JOIN project_links pl ON pl.id = pc.link_id
      LEFT JOIN sites s ON s.id = p.site_id
      WHERE pl.anchor_text ILIKE '%casino uden om rofus%'
    `);
    console.log(`   Found ${problemLink.rows.length} records:`);
    problemLink.rows.forEach(r => {
      const status = r.placement_id ? `placement #${r.placement_id} on ${r.site_url || 'N/A'}` : 'ORPHAN (no placement!)';
      console.log(`   - content_id=${r.content_id}, link_id=${r.link_id}: ${status}`);
    });

    // Step 4: Check for any duplicate link_ids
    console.log('\n4. Checking for duplicate link_id entries:');
    const duplicates = await query(`
      SELECT link_id, COUNT(*) as count
      FROM placement_content
      WHERE link_id IS NOT NULL
      GROUP BY link_id
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    console.log(`   Found ${duplicates.rows.length} link_ids with multiple entries`);
    duplicates.rows.forEach(r => {
      console.log(`   - link_id=${r.link_id}: ${r.count} entries`);
    });

    // Step 5: Check if constraint allows placement
    console.log('\n5. Specific constraint check for placement_content_link_id_key:');
    const specificConstraint = await query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'placement_content'::regclass
        AND conname LIKE '%link_id%'
    `);
    if (specificConstraint.rows.length > 0) {
      specificConstraint.rows.forEach(c => {
        console.log(`   - ${c.conname}: ${c.definition}`);
      });
    } else {
      console.log('   No constraint with "link_id" in name found');
    }

    console.log('\n✅ Diagnosis complete!');

  } catch (error) {
    console.error('\n❌ Error during diagnosis:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

diagnose();
