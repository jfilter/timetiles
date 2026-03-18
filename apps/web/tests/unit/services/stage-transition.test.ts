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
  return { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

// Mock external dependencies
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));

describe.sequential("StageTransitionService", () => {
  let mockQueue: ReturnType<typeof vi.fn>;
  let mockPayload: Payload;
  let mockImportJob: ImportJob;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock queue function
    mockQueue = vi.fn().mockResolvedValue({});

    // Mock payload - cast as unknown first to bypass type checking
    mockPayload = { jobs: { queue: mockQueue } } as unknown as Payload;

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

      // FAILED -> CREATE_EVENTS is now a valid recovery stage
      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.FAILED, PROCESSING_STAGE.CREATE_EVENTS)
      ).toBe(true);
    });

    it("should allow recovery transitions from FAILED state", () => {
      // FAILED can transition to valid recovery stages
      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.FAILED, PROCESSING_STAGE.ANALYZE_DUPLICATES)
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.FAILED, PROCESSING_STAGE.DETECT_SCHEMA)
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.FAILED, PROCESSING_STAGE.VALIDATE_SCHEMA)
      ).toBe(true);

      expect(
        StageTransitionService.validateStageTransition(PROCESSING_STAGE.FAILED, PROCESSING_STAGE.GEOCODE_BATCH)
      ).toBe(true);
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

      expect(mockQueue).toHaveBeenCalledWith({ task: JOB_TYPES.DETECT_SCHEMA, input: { importJobId: newJob.id } });

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

      expect(mockQueue).toHaveBeenCalledWith({ task: JOB_TYPES.VALIDATE_SCHEMA, input: { importJobId: newJob.id } });
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

      expect(mockQueue).toHaveBeenCalledWith({ task: JOB_TYPES.CREATE_EVENTS, input: { importJobId: newJob.id } });
    });

    it("should handle await-approval stage without queuing jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.VALIDATE_SCHEMA } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.AWAIT_APPROVAL } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(false);
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith("Import requires manual approval", { importJobId: newJob.id });
    });

    it("should handle completed stage without queuing jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.CREATE_EVENTS } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.COMPLETED } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(false);
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith("Import job completed successfully", { importJobId: newJob.id });
    });

    it("should handle failed stage without queuing jobs", async () => {
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.GEOCODE_BATCH } as ImportJob;
      const newJob = { ...mockImportJob, stage: PROCESSING_STAGE.FAILED } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(result.jobQueued).toBe(false);
      expect(result.queuedJobType).toBeUndefined();

      expect(mockQueue).not.toHaveBeenCalled();
      expect(mocks.logger.error).toHaveBeenCalledWith("Import job failed", { importJobId: newJob.id });
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

      expect(mockQueue).toHaveBeenCalledWith({ task: JOB_TYPES.DETECT_SCHEMA, input: { importJobId: newJob.id } });
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
  });

  describe("edge cases", () => {
    it("should handle numeric job IDs", async () => {
      const numericJob = { ...mockImportJob, id: 123 } as ImportJob;
      const previousJob = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const newJob = { ...numericJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      const result = await StageTransitionService.processStageTransition(mockPayload, newJob, previousJob);

      expect(result.success).toBe(true);
      expect(mockQueue).toHaveBeenCalledWith({ task: JOB_TYPES.DETECT_SCHEMA, input: { importJobId: 123 } });
    });

    it("should allow different transitions for the same job", async () => {
      const job1 = { ...mockImportJob, id: 123, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;
      const job2 = { ...mockImportJob, id: 123, stage: PROCESSING_STAGE.VALIDATE_SCHEMA } as ImportJob;
      const previousJob1 = { ...mockImportJob, stage: PROCESSING_STAGE.ANALYZE_DUPLICATES } as ImportJob;
      const previousJob2 = { ...mockImportJob, stage: PROCESSING_STAGE.DETECT_SCHEMA } as ImportJob;

      // Both should succeed since they are different transitions
      const [result1, result2] = await Promise.all([
        StageTransitionService.processStageTransition(mockPayload, job1, previousJob1),
        StageTransitionService.processStageTransition(mockPayload, job2, previousJob2),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockQueue).toHaveBeenCalledTimes(2);
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
});
