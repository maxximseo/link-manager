/**
 * Cleanup script: Remove all homepage placements from specified sites
 */

const { query, pool } = require('./backend/config/database');

const SITES_TO_CLEAN = [
  'cederika.com',
  'shurara-bon.com',
  'thesoralife.com',
  'playdarkwinds.com',
  'tomeore.com',
  'mfr-morreformation.com',
  'tulanecitycenter.org',
  'winwap.org',
  'tokyo-lgff.org',
  'hungercliff.org',
  'balvaneranyc.com',
  'forum2015.org',
  '7pc.co',
  'bdolan.net',
  'fancynancybk.com',
  'realworldplaybook.com',
  'stateofplaymovie.net',
  'vignoblegavet.com',
  'litlong.org',
  'grandesynthelefilm.com',
  'thenewwriter.com',
  'arnmovie.com',
  'socialcasehistoryforum.com',
  'hometextilespremium.com',
  'elearning-reviews.org',
  'echoearth.org'
];

async function cleanupHomepagePlacements() {
  console.log('🧹 Starting cleanup of homepage placements...\n');
  console.log(`Sites to clean: ${SITES_TO_CLEAN.length}\n`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find all link placements for these sites
    const placementsQuery = `
      SELECT
        p.id,
        p.site_id,
        s.site_url,
        p.type,
        p.purchased_at
      FROM placements p
      JOIN sites s ON s.id = p.site_id
      WHERE p.type = 'link'
        AND (${SITES_TO_CLEAN.map((_, i) => `s.site_url LIKE $${i + 1}`).join(' OR ')})
      ORDER BY s.site_url, p.id
    `;

    const params = SITES_TO_CLEAN.map(site => `%${site}%`);
    const result = await client.query(placementsQuery, params);

    console.log(`Found ${result.rows.length} homepage placements to delete:\n`);
    console.log('═══════════════════════════════════════════════════════');

    if (result.rows.length === 0) {
      console.log('✨ No homepage placements found - sites are already clean!');
      await client.query('ROLLBACK');
      return;
    }

    // Group by site for display
    const bySite = {};
    result.rows.forEach(p => {
      if (!bySite[p.site_url]) {
        bySite[p.site_url] = [];
      }
      bySite[p.site_url].push(p);
    });

    Object.entries(bySite).forEach(([url, placements]) => {
      console.log(`\n${url}:`);
      placements.forEach(p => {
        console.log(`  - Placement ID: ${p.id}, Type: ${p.type}, Created: ${p.created_at.toISOString().split('T')[0]}`);
      });
    });

    console.log('\n═══════════════════════════════════════════════════════\n');

    // Delete placements
    const placementIds = result.rows.map(p => p.id);

    console.log(`🗑️  Deleting ${placementIds.length} placements...\n`);

    // Delete placement_content first (foreign key constraint)
    const contentResult = await client.query(
      `DELETE FROM placement_content WHERE placement_id = ANY($1::int[])`,
      [placementIds]
    );
    console.log(`✅ Deleted ${contentResult.rowCount} placement_content records`);

    // Delete placements
    const placementResult = await client.query(
      `DELETE FROM placements WHERE id = ANY($1::int[])`,
      [placementIds]
    );
    console.log(`✅ Deleted ${placementResult.rowCount} placements`);

    // Update used_links counters on sites
    const siteIds = [...new Set(result.rows.map(p => p.site_id))];

    for (const siteId of siteIds) {
      const sitePlacements = result.rows.filter(p => p.site_id === siteId);
      const linkCount = sitePlacements.filter(p => p.type === 'link').length;

      if (linkCount > 0) {
        await client.query(
          'UPDATE sites SET used_links = GREATEST(0, used_links - $1), updated_at = NOW() WHERE id = $2',
          [linkCount, siteId]
        );
      }
    }
    console.log(`✅ Updated used_links counters for ${siteIds.length} sites`);

    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 Cleanup completed successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    // Verify
    const verifyResult = await query(
      `SELECT COUNT(*) as count FROM placements p
       JOIN sites s ON s.id = p.site_id
       WHERE p.type = 'link'
         AND (${SITES_TO_CLEAN.map((_, i) => `s.site_url LIKE $${i + 1}`).join(' OR ')})`,
      params
    );

    const remaining = parseInt(verifyResult.rows[0].count);
    if (remaining === 0) {
      console.log('✅ Verification: All homepage placements removed');
    } else {
      console.log(`⚠️  Warning: ${remaining} homepage placements still remain`);
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Cleanup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupHomepagePlacements().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
