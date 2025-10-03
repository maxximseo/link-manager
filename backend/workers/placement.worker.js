/**
 * Placement worker for batch operations
 * Handles creation of placements across multiple sites with retry logic
 */

const logger = require('../config/logger');
const { query } = require('../config/database');

module.exports = async function placementWorker(job) {
  const { project_id, site_ids, link_ids = [], article_ids = [], user_id, priority } = job.data;
  
  logger.info('Starting batch placement job', { 
    jobId: job.id, 
    projectId: project_id,
    siteCount: site_ids.length,
    linkCount: link_ids.length,
    articleCount: article_ids.length,
    priority
  });
  
  // Initialize progress
  await job.progress(0);
  
  const results = [];
  let successful = 0;
  let failed = 0;
  
  try {
    // Pre-flight validation
    await job.progress(5);
    
    // Validate project exists
    const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [project_id, user_id]);
    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found or access denied');
    }
    
    // Process each site
    const totalOperations = site_ids.length;
    
    for (let i = 0; i < site_ids.length; i++) {
      const siteId = site_ids[i];
      const siteResult = {
        siteId,
        success: false,
        error: null,
        placements: [],
        skipped: []
      };
      
      try {
        // Get site info for logging
        const siteInfo = await query('SELECT site_name, site_url FROM sites WHERE id = $1', [siteId]);
        const siteName = siteInfo.rows[0]?.site_name || `Site ${siteId}`;
        
        logger.debug('Processing site', { siteId, siteName, jobId: job.id });
        
        // Create placement record
        const placementResult = await query(`
          INSERT INTO placements (site_id, project_id, type, status, placed_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          RETURNING id
        `, [siteId, project_id, 'manual', 'active']);
        
        const placementId = placementResult.rows[0].id;
        siteResult.placementId = placementId;
        
        // Add links to placement
        if (link_ids.length > 0) {
          for (const linkId of link_ids) {
            try {
              await query(`
                INSERT INTO placement_content (placement_id, link_id)
                VALUES ($1, $2)
                ON CONFLICT (placement_id, link_id) DO NOTHING
              `, [placementId, linkId]);
              
              siteResult.placements.push({ type: 'link', id: linkId });
            } catch (linkError) {
              if (linkError.code === '23503') { // Foreign key constraint
                siteResult.skipped.push({ type: 'link', id: linkId, reason: 'Link not found' });
              } else {
                throw linkError;
              }
            }
          }
        }
        
        // Add articles to placement
        if (article_ids.length > 0) {
          for (const articleId of article_ids) {
            try {
              await query(`
                INSERT INTO placement_content (placement_id, article_id)
                VALUES ($1, $2)
                ON CONFLICT (placement_id, article_id) DO NOTHING
              `, [placementId, articleId]);
              
              siteResult.placements.push({ type: 'article', id: articleId });
            } catch (articleError) {
              if (articleError.code === '23503') { // Foreign key constraint
                siteResult.skipped.push({ type: 'article', id: articleId, reason: 'Article not found' });
              } else {
                throw articleError;
              }
            }
          }
        }
        
        siteResult.success = true;
        successful++;
        
        logger.debug('Site processed successfully', { 
          siteId, 
          siteName, 
          placementId,
          linksAdded: siteResult.placements.filter(p => p.type === 'link').length,
          articlesAdded: siteResult.placements.filter(p => p.type === 'article').length,
          skipped: siteResult.skipped.length
        });
        
      } catch (siteError) {
        siteResult.error = siteError.message;
        failed++;
        
        logger.error('Site processing failed', { 
          siteId, 
          error: siteError.message,
          jobId: job.id
        });
        
        // Check if we should continue or fail the job
        if (siteError.message.includes('access denied') || siteError.message.includes('not found')) {
          // Critical error - fail the entire job
          throw new Error(`Critical error processing site ${siteId}: ${siteError.message}`);
        }
        
        // Non-critical error - continue with other sites
      }
      
      results.push(siteResult);
      
      // Update progress
      const progress = Math.floor(((i + 1) / totalOperations) * 90) + 10;
      await job.progress(progress);
      
      // Add small delay to prevent overwhelming the database
      if (i < site_ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, priority === 'high' ? 100 : 300));
      }
    }
    
    // Final progress update
    await job.progress(100);
    
    const summary = {
      success: true,
      processed: results.length,
      successful,
      failed,
      details: {
        totalSites: site_ids.length,
        successRate: `${Math.round((successful / site_ids.length) * 100)}%`,
        linksPlaced: results.reduce((sum, r) => sum + r.placements.filter(p => p.type === 'link').length, 0),
        articlesPlaced: results.reduce((sum, r) => sum + r.placements.filter(p => p.type === 'article').length, 0),
        totalSkipped: results.reduce((sum, r) => sum + r.skipped.length, 0)
      },
      results: results.map(r => ({
        siteId: r.siteId,
        success: r.success,
        placementId: r.placementId,
        placements: r.placements.length,
        skipped: r.skipped.length,
        error: r.error
      }))
    };
    
    logger.info('Batch placement job completed', {
      jobId: job.id,
      projectId: project_id,
      ...summary.details,
      duration: Date.now() - job.timestamp
    });
    
    return summary;
    
  } catch (error) {
    failed = site_ids.length - successful;
    
    logger.error('Batch placement job failed', { 
      jobId: job.id, 
      error: error.message,
      stack: error.stack,
      processed: successful,
      failed
    });
    
    // Return partial results if some sites were processed
    if (successful > 0) {
      return {
        success: false,
        processed: results.length,
        successful,
        failed,
        error: error.message,
        partialResults: results.map(r => ({
          siteId: r.siteId,
          success: r.success,
          placementId: r.placementId,
          error: r.error
        }))
      };
    }
    
    throw error;
  }
};