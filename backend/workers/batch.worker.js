/**
 * Batch worker for export and heavy operations
 */

const logger = require('../config/logger');

module.exports = async function batchWorker(job) {
  try {
    logger.info('Processing batch job', { jobId: job.id, data: job.data });

    const { type, options = {} } = job.data;

    job.progress(10);

    let result;

    switch (type) {
      case 'export':
        result = await processExport(job);
        break;
      default:
        throw new Error(`Unknown batch job type: ${type}`);
    }

    job.progress(100);

    logger.info('Batch job completed', {
      jobId: job.id,
      type,
      result: result.success
    });

    return result;
  } catch (error) {
    logger.error('Batch worker error', {
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
};

async function processExport(job) {
  const { project_id, site_id, format } = job.data;

  // Simulate export processing
  job.progress(30);
  await new Promise(resolve => setTimeout(resolve, 1000));

  job.progress(60);
  await new Promise(resolve => setTimeout(resolve, 1000));

  job.progress(90);

  return {
    success: true,
    format,
    recordCount: 150,
    exportUrl: '/exports/export_' + job.id + '.' + format
  };
}
