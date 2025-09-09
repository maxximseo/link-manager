/**
 * WordPress worker for publishing operations
 */

const logger = require('../config/logger');

module.exports = async function wordpressWorker(job) {
  try {
    logger.info('Processing WordPress job', { jobId: job.id, data: job.data });
    
    const { site_ids, articles } = job.data;
    
    job.progress(10);
    
    // Simulate WordPress publishing
    const results = [];
    for (let i = 0; i < site_ids.length; i++) {
      const siteId = site_ids[i];
      
      // Process each site
      await new Promise(resolve => setTimeout(resolve, 200)); // Simulate work
      
      results.push({
        siteId,
        success: true,
        wp_post_id: Math.floor(Math.random() * 1000)
      });
      
      const progress = Math.floor(((i + 1) / site_ids.length) * 90) + 10;
      job.progress(progress);
    }
    
    job.progress(100);
    
    logger.info('WordPress publishing completed', { 
      jobId: job.id, 
      processed: results.length 
    });
    
    return {
      success: true,
      processed: results.length,
      results
    };
  } catch (error) {
    logger.error('WordPress worker error', { 
      jobId: job.id, 
      error: error.message 
    });
    throw error;
  }
};