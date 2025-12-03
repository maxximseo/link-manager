const logger = require('../config/logger');
const PlacementService = require('../services/placement.service');
const billingService = require('../services/billing.service');

const placementHandlers = {
  create: async (data) => {
    logger.info('Processing placement creation:', data);
    // CRITICAL FIX: createPlacement expects a single object parameter, not multiple args
    const placement = await PlacementService.createPlacement({
      site_id: data.siteId,
      project_id: data.projectId,
      link_ids: data.linkIds || [],
      article_ids: data.articleIds || [],
      userId: data.userId
    });
    return { success: true, placementId: placement.id };
  },

  delete: async (data) => {
    logger.info('Processing placement deletion:', data);
    // CRITICAL FIX: Use billing service for proper refund with tier recalculation
    // Worker jobs run as 'admin' for automatic operations
    const result = await billingService.deleteAndRefundPlacement(
      data.placementId,
      data.userId,
      'admin'
    );
    return { success: true, refunded: result.refunded, amount: result.amount };
  }
};

const wordpressHandlers = {
  publish: async (data) => {
    logger.info('Publishing to WordPress:', data);
    // WordPress API integration here
    return { success: true, post_id: 123 };
  }
};

const batchHandlers = {
  bulk_placement: async (data) => {
    logger.info('Processing bulk placements:', data);
    // Bulk operations here
    return { success: true, processed: data.items.length };
  }
};

const process = async (job) => {
  const { queue, type } = job.data;

  let handler;
  switch (queue) {
    case 'placement':
      handler = placementHandlers[type];
      break;
    case 'wordpress':
      handler = wordpressHandlers[type];
      break;
    case 'batch':
      handler = batchHandlers[type];
      break;
    default:
      throw new Error(`Unknown queue: ${queue}`);
  }

  if (!handler) {
    throw new Error(`Unknown job type: ${type} for queue: ${queue}`);
  }

  return await handler(job.data);
};

module.exports = { process };
