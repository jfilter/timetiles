/**
 * Tests for the enhanced ProgressTrackingService with per-stage tracking.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import type { ImportJob } from "@/payload-types";

describe.sequential("ProgressTrackingService", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      findByID: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  describe("initializeStageProgress", () => {
    it("should initialize all stages with pending status", async () => {
      await ProgressTrackingService.initializeStageProgress(mockPayload, 123, 1000);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "import-jobs",
          id: 123,
          data: expect.objectContaining({
            progress: expect.objectContaining({
              stages: expect.any(Object),
              overallPercentage: 0,
              estimatedCompletionTime: null,
            }),
          }),
        })
      );

      const updateCall = mockPayload.update.mock.calls[0][0];
      const stages = updateCall.data.progress.stages;

      // Check a few key stages
      expect(stages[PROCESSING_STAGE.ANALYZE_DUPLICATES]).toMatchObject({
        status: "pending",
        startedAt: null,
        completedAt: null,
        rowsProcessed: 0,
        rowsTotal: 1000,
      });

      expect(stages[PROCESSING_STAGE.CREATE_EVENTS]).toMatchObject({
        status: "pending",
        startedAt: null,
        completedAt: null,
      });
    });
  });

  describe("startStage", () => {
    it("should mark stage as in_progress with start time", async () => {
      const mockJob = {
        progress: {
          stages: {
            [PROCESSING_STAGE.DETECT_SCHEMA]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 0,
              batchesProcessed: 0,
              batchesTotal: 0,
              currentBatchRows: 0,
              currentBatchTotal: 0,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
          },
        },
      } as unknown as ImportJob;

      mockPayload.findByID.mockResolvedValue(mockJob);

      await ProgressTrackingService.startStage(mockPayload, 123, PROCESSING_STAGE.DETECT_SCHEMA, 800);

      expect(mockPayload.update).toHaveBeenCalled();

      const updateCall = mockPayload.update.mock.calls[0][0];

      expect(updateCall.collection).toBe("import-jobs");
      expect(updateCall.id).toBe(123);
      expect(updateCall.data.stage).toBe(PROCESSING_STAGE.DETECT_SCHEMA);
      expect(updateCall.data.progress).toBeDefined();
      expect(updateCall.data.progress.stages).toBeDefined();

      const stage = updateCall.data.progress.stages[PROCESSING_STAGE.DETECT_SCHEMA];

      expect(stage.status).toBe("in_progress");
      expect(stage.rowsTotal).toBe(800);
      expect(stage.startedAt).toBeTruthy();
    });
  });

  describe("updateStageProgress", () => {
    it("should update progress metrics and calculate processing rate", async () => {
      const startTime = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago as ISO string
      const mockJob = {
        progress: {
          stages: {
            [PROCESSING_STAGE.GEOCODE_BATCH]: {
              status: "in_progress",
              startedAt: startTime,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 100,
              batchesProcessed: 0,
              batchesTotal: 10,
              currentBatchRows: 0,
              currentBatchTotal: 10,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
          },
        },
      } as unknown as ImportJob;

      mockPayload.findByID.mockResolvedValue(mockJob);

      await ProgressTrackingService.updateStageProgress(mockPayload, 123, PROCESSING_STAGE.GEOCODE_BATCH, 50, 10);

      expect(mockPayload.update).toHaveBeenCalled();

      const updateCall = mockPayload.update.mock.calls[0][0];
      const stage = updateCall.data.progress.stages[PROCESSING_STAGE.GEOCODE_BATCH];

      expect(stage.rowsProcessed).toBe(50);
      expect(stage.currentBatchRows).toBe(10);
      expect(stage.rowsPerSecond).toBeGreaterThan(0);
      expect(stage.estimatedSecondsRemaining).toBeGreaterThan(0);
    });
  });

  describe("completeBatch", () => {
    it("should increment batch counter and reset current batch rows", async () => {
      const mockJob = {
        progress: {
          stages: {
            [PROCESSING_STAGE.CREATE_EVENTS]: {
              status: "in_progress",
              startedAt: new Date().toISOString(),
              completedAt: null,
              rowsProcessed: 500,
              rowsTotal: 1000,
              batchesProcessed: 4,
              batchesTotal: 10,
              currentBatchRows: 100,
              currentBatchTotal: 100,
              rowsPerSecond: 10,
              estimatedSecondsRemaining: 50,
            },
          },
        },
      } as unknown as ImportJob;

      mockPayload.findByID.mockResolvedValue(mockJob);

      await ProgressTrackingService.completeBatch(mockPayload, 123, PROCESSING_STAGE.CREATE_EVENTS, 5);

      const updateCall = mockPayload.update.mock.calls[0][0];
      const stage = updateCall.data.progress.stages[PROCESSING_STAGE.CREATE_EVENTS];

      expect(stage.batchesProcessed).toBe(5);
      expect(stage.currentBatchRows).toBe(0);
    });
  });

  describe("completeStage", () => {
    it("should mark stage as completed with completion time", async () => {
      const mockJob = {
        progress: {
          stages: {
            [PROCESSING_STAGE.VALIDATE_SCHEMA]: {
              status: "in_progress",
              startedAt: new Date(Date.now() - 5000).toISOString(),
              completedAt: null,
              rowsProcessed: 800,
              rowsTotal: 800,
              batchesProcessed: 1,
              batchesTotal: 1,
              currentBatchRows: 0,
              currentBatchTotal: 800,
              rowsPerSecond: 160,
              estimatedSecondsRemaining: 0,
            },
          },
        },
      } as unknown as ImportJob;

      mockPayload.findByID.mockResolvedValue(mockJob);

      await ProgressTrackingService.completeStage(mockPayload, 123, PROCESSING_STAGE.VALIDATE_SCHEMA);

      const updateCall = mockPayload.update.mock.calls[0][0];
      const stage = updateCall.data.progress.stages[PROCESSING_STAGE.VALIDATE_SCHEMA];

      expect(stage.status).toBe("completed");
      expect(stage.completedAt).toBeTruthy();
      expect(stage.estimatedSecondsRemaining).toBe(0);
    });
  });

  describe("skipStage", () => {
    it("should mark stage as skipped", async () => {
      const mockJob = {
        progress: {
          stages: {
            [PROCESSING_STAGE.GEOCODE_BATCH]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 0,
              batchesProcessed: 0,
              batchesTotal: 0,
              currentBatchRows: 0,
              currentBatchTotal: 0,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
          },
        },
      } as unknown as ImportJob;

      mockPayload.findByID.mockResolvedValue(mockJob);

      await ProgressTrackingService.skipStage(mockPayload, 123, PROCESSING_STAGE.GEOCODE_BATCH);

      const updateCall = mockPayload.update.mock.calls[0][0];
      const stage = updateCall.data.progress.stages[PROCESSING_STAGE.GEOCODE_BATCH];

      expect(stage.status).toBe("skipped");
      expect(stage.completedAt).toBeTruthy();
    });
  });

  describe("calculateWeightedProgress", () => {
    it("should calculate weighted progress across all stages", () => {
      const stages = {
        [PROCESSING_STAGE.ANALYZE_DUPLICATES]: {
          status: "completed" as const,
          startedAt: new Date(),
          completedAt: new Date(),
          rowsProcessed: 1000,
          rowsTotal: 1000,
          batchesProcessed: 1,
          batchesTotal: 1,
          currentBatchRows: 0,
          currentBatchTotal: 1000,
          rowsPerSecond: null,
          estimatedSecondsRemaining: null,
        },
        [PROCESSING_STAGE.DETECT_SCHEMA]: {
          status: "in_progress" as const,
          startedAt: new Date(),
          completedAt: null,
          rowsProcessed: 400,
          rowsTotal: 800,
          batchesProcessed: 4,
          batchesTotal: 8,
          currentBatchRows: 0,
          currentBatchTotal: 100,
          rowsPerSecond: 10,
          estimatedSecondsRemaining: 40,
        },
        [PROCESSING_STAGE.VALIDATE_SCHEMA]: {
          status: "pending" as const,
          startedAt: null,
          completedAt: null,
          rowsProcessed: 0,
          rowsTotal: 800,
          batchesProcessed: 0,
          batchesTotal: 1,
          currentBatchRows: 0,
          currentBatchTotal: 800,
          rowsPerSecond: null,
          estimatedSecondsRemaining: null,
        },
      };

      const progress = ProgressTrackingService.calculateWeightedProgress(stages);

      // ANALYZE_DUPLICATES completed (100% of its weight)
      // DETECT_SCHEMA 50% complete (400/800)
      // Should be positive and less than 100
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(100);
    });
  });

  describe("getBatchSizeForStage", () => {
    it("should return correct batch size for each stage", () => {
      expect(ProgressTrackingService.getBatchSizeForStage(PROCESSING_STAGE.ANALYZE_DUPLICATES)).toBeGreaterThan(0);
      expect(ProgressTrackingService.getBatchSizeForStage(PROCESSING_STAGE.DETECT_SCHEMA)).toBeGreaterThan(0);
      expect(ProgressTrackingService.getBatchSizeForStage(PROCESSING_STAGE.CREATE_EVENTS)).toBeGreaterThan(0);
      expect(ProgressTrackingService.getBatchSizeForStage(PROCESSING_STAGE.VALIDATE_SCHEMA)).toBeNull();
    });
  });

  describe("updatePostDeduplicationTotals", () => {
    it("should update row totals for post-deduplication stages", async () => {
      const mockJob = {
        progress: {
          stages: {
            [PROCESSING_STAGE.DETECT_SCHEMA]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 1000,
              batchesProcessed: 0,
              batchesTotal: 10,
              currentBatchRows: 0,
              currentBatchTotal: 100,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
            [PROCESSING_STAGE.VALIDATE_SCHEMA]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 1000,
              batchesProcessed: 0,
              batchesTotal: 1,
              currentBatchRows: 0,
              currentBatchTotal: 1000,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
            [PROCESSING_STAGE.CREATE_SCHEMA_VERSION]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 1000,
              batchesProcessed: 0,
              batchesTotal: 1,
              currentBatchRows: 0,
              currentBatchTotal: 1000,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
            [PROCESSING_STAGE.GEOCODE_BATCH]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 1000,
              batchesProcessed: 0,
              batchesTotal: 10,
              currentBatchRows: 0,
              currentBatchTotal: 100,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
            [PROCESSING_STAGE.CREATE_EVENTS]: {
              status: "pending",
              startedAt: null,
              completedAt: null,
              rowsProcessed: 0,
              rowsTotal: 1000,
              batchesProcessed: 0,
              batchesTotal: 10,
              currentBatchRows: 0,
              currentBatchTotal: 100,
              rowsPerSecond: null,
              estimatedSecondsRemaining: null,
            },
          },
        },
      } as unknown as ImportJob;

      mockPayload.findByID.mockResolvedValue(mockJob);

      await ProgressTrackingService.updatePostDeduplicationTotals(mockPayload, 123, 800);

      const updateCall = mockPayload.update.mock.calls[0][0];
      const detectSchemaStage = updateCall.data.progress.stages[PROCESSING_STAGE.DETECT_SCHEMA];
      const validateSchemaStage = updateCall.data.progress.stages[PROCESSING_STAGE.VALIDATE_SCHEMA];
      const createEventsStage = updateCall.data.progress.stages[PROCESSING_STAGE.CREATE_EVENTS];

      expect(detectSchemaStage.rowsTotal).toBe(800);
      expect(validateSchemaStage.rowsTotal).toBe(800);
      expect(createEventsStage.rowsTotal).toBe(800);
    });
  });
});
