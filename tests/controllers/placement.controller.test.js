/**
 * Placement Controller Tests
 */

const placementController = require('../../backend/controllers/placement.controller');

// Mock dependencies
jest.mock('../../backend/services/placement.service');
jest.mock('../../backend/services/billing.service');
jest.mock('../../backend/config/queue', () => ({
  createQueue: jest.fn()
}));
jest.mock('../../backend/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const placementService = require('../../backend/services/placement.service');
const billingService = require('../../backend/services/billing.service');
const queueService = require('../../backend/config/queue');
const { query } = require('../../backend/config/database');

describe('Placement Controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: { id: 1, username: 'testuser', role: 'user' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getPlacements', () => {
    it('should return paginated placements', async () => {
      mockReq.query = { page: '1', limit: '20' };
      const mockResult = {
        data: [{ id: 1, type: 'link', status: 'placed' }],
        pagination: { page: 1, limit: 20, total: 1 }
      };
      placementService.getUserPlacements.mockResolvedValue(mockResult);

      await placementController.getPlacements(mockReq, mockRes);

      expect(placementService.getUserPlacements).toHaveBeenCalledWith(1, 1, 20, {
        project_id: undefined,
        status: undefined
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should filter by status', async () => {
      mockReq.query = { status: 'placed' };
      placementService.getUserPlacements.mockResolvedValue({ data: [] });

      await placementController.getPlacements(mockReq, mockRes);

      expect(placementService.getUserPlacements).toHaveBeenCalledWith(
        1,
        1,
        20,
        expect.objectContaining({ status: 'placed' })
      );
    });

    it('should filter by project_id', async () => {
      mockReq.query = { project_id: '123' };
      placementService.getUserPlacements.mockResolvedValue({ data: [] });

      await placementController.getPlacements(mockReq, mockRes);

      expect(placementService.getUserPlacements).toHaveBeenCalledWith(
        1,
        1,
        20,
        expect.objectContaining({ project_id: '123' })
      );
    });

    it('should return 400 on validation error', async () => {
      mockReq.query = { page: 'invalid' };
      placementService.getUserPlacements.mockRejectedValue(new Error('Page number must be valid'));

      await placementController.getPlacements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on service error', async () => {
      placementService.getUserPlacements.mockRejectedValue(new Error('Database error'));

      await placementController.getPlacements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPlacementsBySite', () => {
    it('should return placements for a site', async () => {
      mockReq.params = { siteId: '1' };
      query.mockResolvedValue({
        rows: [{ id: 1, final_price: '10.00', project_name: 'Test' }]
      });

      await placementController.getPlacementsBySite(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          placements: expect.any(Array),
          summary: expect.objectContaining({
            total: 1,
            paidCount: 1,
            totalRefund: 10
          })
        })
      );
    });

    it('should return 400 for invalid site ID', async () => {
      mockReq.params = { siteId: 'invalid' };

      await placementController.getPlacementsBySite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid site ID' });
    });

    it('should calculate correct totals with free placements', async () => {
      mockReq.params = { siteId: '1' };
      query.mockResolvedValue({
        rows: [
          { id: 1, final_price: '10.00' },
          { id: 2, final_price: '0.00' },
          { id: 3, final_price: '5.50' }
        ]
      });

      await placementController.getPlacementsBySite(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: {
            total: 3,
            paidCount: 2,
            totalRefund: 15.5
          }
        })
      );
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { siteId: '1' };
      query.mockRejectedValue(new Error('Database error'));

      await placementController.getPlacementsBySite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPlacement', () => {
    it('should return placement by id', async () => {
      mockReq.params = { id: '1' };
      const mockPlacement = { id: 1, type: 'link', status: 'placed' };
      placementService.getPlacementById.mockResolvedValue(mockPlacement);

      await placementController.getPlacement(mockReq, mockRes);

      expect(placementService.getPlacementById).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockPlacement);
    });

    it('should return 404 if placement not found', async () => {
      mockReq.params = { id: '999' };
      placementService.getPlacementById.mockResolvedValue(null);

      await placementController.getPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Placement not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      placementService.getPlacementById.mockRejectedValue(new Error('Database error'));

      await placementController.getPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createBatchPlacement', () => {
    it('should return 400 if project_id is missing', async () => {
      mockReq.body = { site_ids: [1], link_ids: [1] };

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid input: project_id and non-empty site_ids array are required'
      });
    });

    it('should return 400 if site_ids is empty', async () => {
      mockReq.body = { project_id: 1, site_ids: [], link_ids: [1] };

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if no links or articles', async () => {
      mockReq.body = { project_id: 1, site_ids: [1], link_ids: [], article_ids: [] };

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'At least one link or article must be specified'
      });
    });

    it('should return 400 if too many sites', async () => {
      mockReq.body = {
        project_id: 1,
        site_ids: Array(1001).fill(1),
        link_ids: [1]
      };

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Maximum 1000 sites per batch operation'
      });
    });

    it('should return 400 if too many links', async () => {
      mockReq.body = {
        project_id: 1,
        site_ids: [1],
        link_ids: Array(5001).fill(1)
      };

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Maximum 5000 links per batch operation'
      });
    });

    it('should return 400 if too many articles', async () => {
      mockReq.body = {
        project_id: 1,
        site_ids: [1],
        article_ids: Array(1001).fill(1)
      };

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Maximum 1000 articles per batch operation'
      });
    });

    it('should return 404 if project not found', async () => {
      mockReq.body = { project_id: 999, site_ids: [1], link_ids: [1] };
      query.mockResolvedValueOnce({ rows: [] }); // project check

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project 999 not found or access denied'
      });
    });

    it('should return 400 if invalid site IDs', async () => {
      mockReq.body = { project_id: 1, site_ids: [1, 999], link_ids: [1] };
      query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // project check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // sites check (only 1 found)

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid or inaccessible site IDs: 999'
      });
    });

    it('should create placements successfully', async () => {
      mockReq.body = { project_id: 1, site_ids: [1, 2], link_ids: [1, 2] };
      query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // project check
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }); // sites check
      placementService.createPlacement
        .mockResolvedValueOnce({ id: 1, site_id: 1 })
        .mockResolvedValueOnce({ id: 2, site_id: 2 });

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          successful: 2,
          failed: 0,
          placements: expect.any(Array)
        })
      );
    });

    it('should handle partial failures', async () => {
      mockReq.body = { project_id: 1, site_ids: [1, 2], link_ids: [1, 2] };
      query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // project check
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }); // sites check
      placementService.createPlacement
        .mockResolvedValueOnce({ id: 1, site_id: 1 })
        .mockRejectedValueOnce(new Error('Site quota exceeded'));

      await placementController.createBatchPlacement(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          successful: 1,
          failed: 1,
          errors: expect.arrayContaining([expect.objectContaining({ site_id: 2 })])
        })
      );
    });
  });

  describe('deletePlacement', () => {
    it('should delete placement successfully', async () => {
      mockReq.params = { id: '1' };
      mockReq.user = { id: 1, role: 'admin' };
      billingService.deleteAndRefundPlacement.mockResolvedValue({
        refunded: true,
        amount: 10.0,
        newBalance: 100.0
      });

      await placementController.deletePlacement(mockReq, mockRes);

      expect(billingService.deleteAndRefundPlacement).toHaveBeenCalledWith('1', 1, 'admin');
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Placement deleted successfully',
        refund: { amount: 10.0, newBalance: 100.0 }
      });
    });

    it('should delete without refund info if not refunded', async () => {
      mockReq.params = { id: '1' };
      mockReq.user = { id: 1, role: 'admin' };
      billingService.deleteAndRefundPlacement.mockResolvedValue({
        refunded: false
      });

      await placementController.deletePlacement(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Placement deleted successfully'
      });
    });

    it('should return 404 if placement not found', async () => {
      mockReq.params = { id: '999' };
      mockReq.user = { id: 1, role: 'admin' };
      billingService.deleteAndRefundPlacement.mockRejectedValue(new Error('Placement not found'));

      await placementController.deletePlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 if unauthorized', async () => {
      mockReq.params = { id: '1' };
      mockReq.user = { id: 1, role: 'admin' };
      billingService.deleteAndRefundPlacement.mockRejectedValue(
        new Error('unauthorized to delete')
      );

      await placementController.deletePlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      mockReq.user = { id: 1, role: 'admin' };
      billingService.deleteAndRefundPlacement.mockRejectedValue(new Error('Database error'));

      await placementController.deletePlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const mockStats = {
        total_placements: 10,
        total_links_placed: 7,
        total_articles_placed: 3
      };
      placementService.getStatistics.mockResolvedValue(mockStats);

      await placementController.getStatistics(mockReq, mockRes);

      expect(placementService.getStatistics).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith(mockStats);
    });

    it('should return 500 on service error', async () => {
      placementService.getStatistics.mockRejectedValue(new Error('Database error'));

      await placementController.getStatistics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAvailableSites', () => {
    it('should return available sites', async () => {
      mockReq.params = { projectId: '1' };
      const mockSites = [{ id: 1, site_name: 'Site 1', available: true }];
      placementService.getAvailableSites.mockResolvedValue(mockSites);

      await placementController.getAvailableSites(mockReq, mockRes);

      expect(placementService.getAvailableSites).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockSites);
    });

    it('should return 400 if project ID is missing', async () => {
      mockReq.params = {};

      await placementController.getAvailableSites(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project ID is required' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { projectId: '1' };
      placementService.getAvailableSites.mockRejectedValue(new Error('Database error'));

      await placementController.getAvailableSites(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createBatchPlacementAsync', () => {
    it('should return 400 if project_id is missing', async () => {
      mockReq.body = { site_ids: [1], link_ids: [1] };

      await placementController.createBatchPlacementAsync(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 503 if queue unavailable', async () => {
      mockReq.body = { project_id: 1, site_ids: [1], link_ids: [1] };
      queueService.createQueue.mockReturnValue(null);

      await placementController.createBatchPlacementAsync(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          fallback_endpoint: '/api/placements/batch/create'
        })
      );
    });

    it('should queue job successfully', async () => {
      mockReq.body = { project_id: 1, site_ids: [1, 2], link_ids: [1] };
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-123' })
      };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.createBatchPlacementAsync(mockReq, mockRes);

      expect(mockQueue.add).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          total_sites: 2
        })
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return 503 if queue unavailable', async () => {
      mockReq.params = { jobId: 'job-123' };
      queueService.createQueue.mockReturnValue(null);

      await placementController.getJobStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
    });

    it('should return 404 if job not found', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(null) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.getJobStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 if job belongs to different user', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockQueue = {
        getJob: jest.fn().mockResolvedValue({ data: { userId: 999 } })
      };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.getJobStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return completed job status', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockJob = {
        data: { userId: 1, site_ids: [1, 2], createdAt: '2025-01-01' },
        getState: jest.fn().mockResolvedValue('completed'),
        progress: jest.fn().mockReturnValue({ percent: 100 }),
        failedReason: null,
        returnvalue: { results: [1, 2], errors: [] }
      };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(mockJob) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.getJobStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          successful: 2,
          failed: 0
        })
      );
    });

    it('should return failed job status', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockJob = {
        data: { userId: 1, site_ids: [1], createdAt: '2025-01-01' },
        getState: jest.fn().mockResolvedValue('failed'),
        progress: jest.fn().mockReturnValue(0),
        failedReason: 'Database error',
        returnvalue: null
      };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(mockJob) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.getJobStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errors: [{ error: 'Database error' }]
        })
      );
    });
  });

  describe('cancelJob', () => {
    it('should return 503 if queue unavailable', async () => {
      mockReq.params = { jobId: 'job-123' };
      queueService.createQueue.mockReturnValue(null);

      await placementController.cancelJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
    });

    it('should return 404 if job not found', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(null) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.cancelJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 if job already completed', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockJob = {
        data: { userId: 1 },
        getState: jest.fn().mockResolvedValue('completed')
      };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(mockJob) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.cancelJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Cannot cancel completed job' });
    });

    it('should return 400 if job failed', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockJob = {
        data: { userId: 1 },
        getState: jest.fn().mockResolvedValue('failed')
      };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(mockJob) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.cancelJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Cannot cancel failed job' });
    });

    it('should cancel job successfully', async () => {
      mockReq.params = { jobId: 'job-123' };
      const mockJob = {
        data: { userId: 1 },
        getState: jest.fn().mockResolvedValue('waiting'),
        remove: jest.fn().mockResolvedValue(undefined)
      };
      const mockQueue = { getJob: jest.fn().mockResolvedValue(mockJob) };
      queueService.createQueue.mockReturnValue(mockQueue);

      await placementController.cancelJob(mockReq, mockRes);

      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Job cancelled successfully',
        job_id: 'job-123'
      });
    });
  });

  describe('publishScheduledPlacement', () => {
    it('should return 400 for invalid placement ID', async () => {
      mockReq.params = { id: 'invalid' };

      await placementController.publishScheduledPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid placement ID' });
    });

    it('should publish placement successfully', async () => {
      mockReq.params = { id: '1' };
      const mockResult = { success: true, post_id: 123 };
      billingService.publishScheduledPlacement.mockResolvedValue(mockResult);

      await placementController.publishScheduledPlacement(mockReq, mockRes);

      expect(billingService.publishScheduledPlacement).toHaveBeenCalledWith(1, 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 404 if placement not found', async () => {
      mockReq.params = { id: '999' };
      billingService.publishScheduledPlacement.mockRejectedValue(new Error('Placement not found'));

      await placementController.publishScheduledPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 if unauthorized', async () => {
      mockReq.params = { id: '1' };
      billingService.publishScheduledPlacement.mockRejectedValue(
        new Error('Unauthorized to publish')
      );

      await placementController.publishScheduledPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 if placement not scheduled', async () => {
      mockReq.params = { id: '1' };
      billingService.publishScheduledPlacement.mockRejectedValue(
        new Error("Placement status is not 'scheduled'")
      );

      await placementController.publishScheduledPlacement(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('batchDeletePlacements', () => {
    it('should return 400 if placementIds is empty', async () => {
      mockReq.body = { placementIds: [] };

      await placementController.batchDeletePlacements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'placementIds must be a non-empty array'
      });
    });

    it('should return 400 if too many placements', async () => {
      mockReq.body = { placementIds: Array(101).fill(1) };

      await placementController.batchDeletePlacements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Maximum 100 placements per batch delete'
      });
    });

    it('should return 400 if IDs are not positive integers', async () => {
      mockReq.body = { placementIds: [1, -1, 3] };

      await placementController.batchDeletePlacements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'All placement IDs must be positive integers'
      });
    });

    it('should batch delete placements successfully', async () => {
      mockReq.body = { placementIds: [1, 2, 3] };
      const mockResult = {
        successful: 3,
        failed: 0,
        totalRefunded: 30.0,
        results: [{ id: 1 }, { id: 2 }, { id: 3 }],
        errors: [],
        finalBalance: 100.0,
        durationMs: 500
      };
      billingService.batchDeletePlacements.mockResolvedValue(mockResult);

      await placementController.batchDeletePlacements(mockReq, mockRes);

      expect(billingService.batchDeletePlacements).toHaveBeenCalledWith(1, 'user', [1, 2, 3]);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          successful: 3,
          failed: 0
        })
      });
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { placementIds: [1] };
      billingService.batchDeletePlacements.mockRejectedValue(new Error('Database error'));

      await placementController.batchDeletePlacements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
