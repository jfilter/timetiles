/**
 * @module
 */
import type { Payload } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { StageTransitionService } from "@/lib/services/stage-transition";
import type { ImportJob } from "@/payload-types";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// Mock external dependencies
vi.mock("@/lib/logger", () => ({
  logger: mocks.logger,
}));

describe.sequential("StageTransitionService", () => {
  let mockQueue: ReturnType<typeof vi.fn>;
  let mockPayload: Payload;
  let mockImportJob: ImportJob;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Clear any existing transition locks before each test
    StageTransitionService.clearTransitionLocks();

    // Create mock queue function
    mockQueue = vi.fn().mockResolvedValue({});

    // Mock payload - cast as unknown first to bypass type checking
    mockPayload = {
      jobs: {
        queue: mockQueue,
      },
    } as unknown as Payload;

    // Mock import job
    mockImportJob = {
      id: 123,
      stage: PROCESSING_STAGE.DETECT_SCHEMA,
      dataset: 456,
      importFile: 789,
      updatedAt: "2023-01-01T00:00:00.000Z",
      createdAt: "2023-01-01T00:00:00.000Z",
    } as ImportJob;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up transition locks after each test
    StageTransitionService.clearTransitionLocks();
  });

  describe("validateStageTransition", () => {
    it("should allow valid stage transitions", () => {
      // Test all valid transitions defined in VALID_STAGE_TRANSITIONS
      expect(
        StageTransitionService.validateStageTransition(
          PROCESSING_STAGE.ANALYZE_DUPLICATES,
          PROCESSING_STAGE.DETECT_SCHEMA
        )
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.DETECT_SCHEMA, PROCESSING_STAGE.VALIDATE_SCHEMA)
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(
          PROCESSING_STAGE.VALIDATE_SCHEMA,
          PROCESSING_STAGE.AWAIT_APPROVAL
        )
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.VALIDATE_SCHEMA, PROCESSING_STAGE.GEOCODE_BATCH)
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(
          PROCESSING_STAGE.AWAIT_APPROVAL,
          PROCESSING_STAGE.CREATE_SCHEMA_VERSION
        )
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(
          PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
          PROCESSING_STAGE.GEOCODE_BATCH
        )
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.GEOCODE_BATCH, PROCESSING_STAGE.CREATE_EVENTS)
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.CREATE_EVENTS, PROCESSING_STAGE.COMPLETED)
      ).toBe(true);
    });

    it("should allow transitions to failed state from any stage", () => {
      const allStages = [
        PROCESSING_STAGE.ANALYZE_DUPLICATES,
        PROCESSING_STAGE.DETECT_SCHEMA,
        PROCESSING_STAGE.VALIDATE_SCHEMA,
        PROCESSING_STAGE.AWAIT_APPROVAL,
        PROCESSING_STAGE.GEOCODE_BATCH,
        PROCESSING_STAGE.CREATE_EVENTS,
        PROCESSING_STAGE.COMPLETED,
      ];

      allStages.forEach((stage) => {
        expect(StageTransitionService.validateStageTransition(stage, PROCESSING_STAGE.FAILED)).toBe(true);
      });
    });

    it("should allow staying in the same stage", () => {
      const allStages = [
        PROCESSING_STAGE.ANALYZE_DUPLICATES,
        PROCESSING_STAGE.DETECT_SCHEMA,
        PROCESSING_STAGE.VALIDATE_SCHEMA,
        PROCESSING_STAGE.AWAIT_APPROVAL,
        PROCESSING_STAGE.GEOCODE_BATCH,
        PROCESSING_STAGE.CREATE_EVENTS,
        PROCESSING_STAGE.COMPLETED,
        PROCESSING_STAGE.FAILED,
      ];

      allStages.forEach((stage) => {
        expect(StageTransitionService.validateStageTransition(stage, stage)).toBe(true);
      });
    });

    it("should reject invalid stage transitions", () => {
      // Test invalid transitions
      expect(
        StageTransitionService.validateStageTransition(
          PROCESSING_STAGE.ANALYZE_DUPLICATES,
          PROCESSING_STAGE.GEOCODE_BATCH
        )
      ).toBe(false);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.DETECT_SCHEMA, PROCESSING_STAGE.CREATE_EVENTS)
      ).toBe(false);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.GEOCODE_BATCH)
      ).toBe(false);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.FAILED, PROCESSING_STAGE.DETECT_SCHEMA)
      ).toBe(false);
    });

    it("should handle unknown stages gracefully", () => {
      expect(StageTransitionService.validateStageTransition("unknown-stage", PROCESSING_STAGE.DETECT_SCHEMA)).toBe(
        false
      );

      expect(StageTransitionService.validateStageTransition(PROCESSING_STAGE.DETECT_SCHEMA, "unknown-stage")).toBe(
        false
      );
    });
  });

  describe("processStageTransition", () => {
    it("should successfully transition and queue detect-schema job", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(true);
      expect(result.queuedJobType).toBe(JOB_TYPES.DETECT_SCHEMA);

      expect(mockQueue).toHaveBeenCalledWith({
        task: JOB_TYPES.DETECT_SCHEMA,
        input: { importJobId: newJob.id, batchNumber: 0 },
      });

      expect(mocks.logger.info).toHaveBeenCalledWith("Processing stage transition", {
        importJobId: "123",
        fromStage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        toStage: PROCESSING_STAGE.DETECT_SCHEMA,
      });
    });

    it("should successfully transition and queue validate-schema job", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.VALIDATE_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(true);
      expect(result.queuedJobType).toBe(JOB_TYPES.VALIDATE_SCHEMA);

      expect(mockQueue).toHaveBeenCalledWith({
        task: JOB_TYPES.VALIDATE_SCHEMA,
        input: { importJobId: newJob.id },
      });
    });

    it("should successfully transition and queue geocode-batch job", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.VALIDATE_SCHEMA } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.GEOCODE_BATCH } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(true);
      expect(result.queuedJobType).toBe(JOB_TYPES.GEOCODE_BATCH);

      expect(mockQueue).toHaveBeenCalledWith({
        task: JOB_TYPES.GEOCODE_BATCH,
        input: { importJobId: newJob.id, batchNumber: 0 },
      });
    });

    it("should successfully transition and queue create-events job", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.GEOCODE_BATCH } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.CREATE_EVENTS } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(true);
      expect(result.queuedJobType).toBe(JOB_TYPES.CREATE_EVENTS);

      expect(mockQueue).toHaveBeenCalledWith({
        task: JOB_TYPES.CREATE_EVENTS,
        input: { importJobId: newJob.id, batchNumber: 0 },
      });
    });

    it("should handle await-approval stage without queuing jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.VALIDATE_SCHEMA } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.AWAIT_APPROVAL } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(false);
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith("Import requires manual approval", {
        importJobId: newJob.id,
      });
    });

    it("should handle completed stage without queuing jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.CREATE_EVENTS } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.COMPLETED } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(false);
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith("Import job completed successfully", {
        importJobId: newJob.id,
      });
    });

    it("should handle failed stage without queuing jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.GEOCODE_BATCH } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.FAILED } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(false);
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.error).toHaveBeenCalledWith("Import job failed", {
        importJobId: newJob.id,
      });
    });

    it("should skip processing when no stage change occurs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBeUndefined();
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.info).not.toHaveBeenCalled();
    });

    it("should handle first transition (no previous job)", async () => {
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, undefined);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(true);
      expect(result.queuedJobType).toBe(JOB_TYPES.DETECT_SCHEMA);

      expect(mockQueue).toHaveBeenCalledWith({
        task: JOB_TYPES.DETECT_SCHEMA,
        input: { importJobId: newJob.id, batchNumber: 0 },
      });
    });
  });

  describe("race condition prevention", () => {
    it("should prevent duplicate transitions for the same job", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // Make the first transition take some time
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentional: mock returns promise to simulate async queue delay
      mockQueue.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      // Start two transitions simultaneously
      const promise1 = StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);
      const promise2 = StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should fail due to race condition
      const results = [result1, result2];
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success && r.error === "Transition already in progress").length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
      expect(mocks.logger.warn).toHaveBeenCalledWith("Stage transition already in progress", {
        importJobId: "123",
        fromStage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        toStage: PROCESSING_STAGE.DETECT_SCHEMA,
      });
    });

    it("should allow different transitions for the same job", async () => {
      const job1 = { ...mockImportJob, id: 123, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const job2 = { ...mockImportJob, id: 123, stage: PROCESSING_STAGE.VALIDATE_SCHEMA } as ImportJob;
      const previousJob1 = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const previousJob2 = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // These are different transitions (different target stages) so both should succeed
      const [result1, result2] = await Promise.all([
        StageTransitionService.processStageTransition(mockPayload, job1, previousJob1),
        StageTransitionService.processStageTransition(mockPayload, job2, previousJob2),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it("should allow same transition for different jobs", async () => {
      const job1 = { ...mockImportJob, id: 123, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const job2 = { ...mockImportJob, id: 456, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;

      const [result1, result2] = await Promise.all([
        StageTransitionService.processStageTransition(mockPayload, job1, previousJob),
        StageTransitionService.processStageTransition(mockPayload, job2, previousJob),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle invalid stage transitions", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.CREATE_EVENTS } as ImportJob; // Invalid jump

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid stage transition from 'analyze-duplicates' to 'create-events'");

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Invalid stage transition from 'analyze-duplicates' to 'create-events'",
        { importJobId: "123" }
      );
    });

    it("should handle job queue failures", async () => {
      const queueError = new Error("Queue service unavailable");
      mockQueue.mockRejectedValue(queueError);

      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Queue service unavailable");

      expect(mocks.logger.error).toHaveBeenCalledWith("Stage transition failed", {
        importJobId: "123",
        fromStage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        toStage: PROCESSING_STAGE.DETECT_SCHEMA,
        error: queueError,
      });
    });

    it("should handle unknown stage gracefully", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: "unknown-stage" as any } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid stage transition from 'analyze-duplicates' to 'unknown-stage'");

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Invalid stage transition from 'analyze-duplicates' to 'unknown-stage'",
        { importJobId: "123" }
      );
    });

    it("should clean up transition locks after errors", async () => {
      const queueError = new Error("Queue failed");
      mockQueue.mockRejectedValue(queueError);

      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      expect(StageTransitionService.getTransitioningCount()).toBe(0);

      await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      // Lock should be cleaned up even after error
      expect(StageTransitionService.getTransitioningCount()).toBe(0);
    });
  });

  describe("utility methods", () => {
    it("should correctly track transitioning jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      expect(StageTransitionService.getTransitioningCount()).toBe(0);
      expect(StageTransitionService.isTransitioning("123")).toBe(false);

      // Make transition take some time
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentional: mock returns promise to simulate async queue delay
      mockQueue.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      // Start transition
      const transitionPromise = StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      // Check that it's being tracked
      expect(StageTransitionService.getTransitioningCount()).toBe(1);
      expect(StageTransitionService.isTransitioning("123")).toBe(true);
      expect(
        StageTransitionService.isTransitioning(
          "123",
          PROCESSING_STAGE.ANALYZE_DUPLICATES,
          PROCESSING_STAGE.DETECT_SCHEMA
        )
      ).toBe(true);
      expect(
        StageTransitionService.isTransitioning("123", PROCESSING_STAGE.DETECT_SCHEMA, PROCESSING_STAGE.VALIDATE_SCHEMA)
      ).toBe(false);

      // Wait for completion
      await transitionPromise;

      // Should be cleaned up
      expect(StageTransitionService.getTransitioningCount()).toBe(0);
      expect(StageTransitionService.isTransitioning("123")).toBe(false);
    });

    it("should clear all transition locks", () => {
      // Simulate some active transitions by adding to the private set
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob1 = { ...mockImportJob, id: 1, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const newJob2 = { ...mockImportJob, id: 2, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // Start transitions but don't await (they'll be blocked by queue mock)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentional: mock returns never-resolving promise to hold transition lock
      mockQueue.mockImplementation(() => new Promise(() => {})); // Never resolves

      void StageTransitionService.processStageTransition(mockPayload, newJob1, previousJob);
      void StageTransitionService.processStageTransition(mockPayload, newJob2, previousJob);

      // Wait a bit for the transitions to start
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(StageTransitionService.getTransitioningCount()).toBeGreaterThan(0);

          StageTransitionService.clearTransitionLocks();

          expect(StageTransitionService.getTransitioningCount()).toBe(0);
          expect(mocks.logger.warn).toHaveBeenCalledWith("Clearing all stage transition locks");
          resolve();
        }, 10);
      });
    });

    it("should clean up old locks", () => {
      // Add some mock transitions
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentional: mock returns never-resolving promise to hold transition lock
      mockQueue.mockImplementation(() => new Promise(() => {})); // Never resolves

      void StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(StageTransitionService.getTransitioningCount()).toBe(1);

          const cleaned = StageTransitionService.cleanupOldLocks();

          expect(cleaned).toBe(1);
          expect(StageTransitionService.getTransitioningCount()).toBe(0);
          resolve();
        }, 10);
      });
    });

    it("should execute cleanup task", async () => {
      // Add some mock transitions
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- intentional: mock returns never-resolving promise to hold transition lock
      mockQueue.mockImplementation(() => new Promise(() => {})); // Never resolves

      void StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      // Wait for transition to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(StageTransitionService.getTransitioningCount()).toBe(1);

      const result = StageTransitionService.cleanupTask();

      expect(result).toEqual({ output: { cleaned: 1 } });
      expect(StageTransitionService.getTransitioningCount()).toBe(0);
      expect(mocks.logger.info).toHaveBeenCalledWith("Cleaned up stage transition locks", {
        count: 1,
      });
    });

    it("should handle cleanup task with no locks to clean", () => {
      expect(StageTransitionService.getTransitioningCount()).toBe(0);

      const result = StageTransitionService.cleanupTask();

      expect(result).toEqual({ output: { cleaned: 0 } });
      expect(mocks.logger.info).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle numeric job IDs", async () => {
      const numericJob = { ...mockImportJob, id: 123 } as ImportJob;
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...numericJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(mockQueue).toHaveBeenCalledWith({
        task: JOB_TYPES.DETECT_SCHEMA,
        input: { importJobId: 123, batchNumber: 0 },
      });
    });

    it("should handle concurrent different transitions for same job", async () => {
      // Test that different transition types for the same job can run concurrently
      const job123_to_detect = {
        ...mockImportJob,
        id: 123,
        stage: PROCESSING_STAGE.DETECT_SCHEMA,
      } as ImportJob;
      const job123_to_validate = {
        ...mockImportJob,
        id: 123,
        stage: PROCESSING_STAGE.VALIDATE_SCHEMA,
      } as ImportJob;

      const prevJob_analyze = {
        ...mockImportJob,
        stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
      } as ImportJob;
      const prevJob_detect = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // Both should succeed since they are different transitions
      const [result1, result2] = await Promise.all([
        StageTransitionService.processStageTransition(mockPayload, job123_to_detect, prevJob_analyze),
        StageTransitionService.processStageTransition(mockPayload, job123_to_validate, prevJob_detect),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockQueue).toHaveBeenCalledTimes(2);
    });
  });
});
