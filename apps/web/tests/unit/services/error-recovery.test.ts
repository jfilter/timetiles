/**
 * Unit tests for ErrorRecoveryService.
 *
 * Tests error classification, retry scheduling, recovery stage determination,
 * and quota integration for the import job retry system.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import type { ImportJob } from "@/payload-types";

// Mock payload
const mockPayload = {
  findByID: vi.fn(),
  update: vi.fn(),
  find: vi.fn(),
  jobs: {
    queue: vi.fn(),
  },
} as any;

// Mock quota service
vi.mock("@/lib/services/quota-service", () => ({
  getQuotaService: () => ({
    checkQuota: vi.fn().mockReturnValue({ allowed: true, current: 0, limit: 5 }),
  }),
}));

describe.sequential("ErrorRecoveryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Error Classification", () => {
    it("should classify file not found as permanent error", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "ENOENT: file not found",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("permanent");
      expect(classification.retryable).toBe(false);
      expect(classification.reason).toContain("File not found");
    });

    it("should classify connection errors as recoverable", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Connection timeout",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("recoverable");
      expect(classification.retryable).toBe(true);
      expect(classification.reason).toContain("connection issue");
    });

    it("should classify quota errors as non-retryable", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Quota limit exceeded",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("user-action-required");
      expect(classification.retryable).toBe(false);
      expect(classification.reason).toContain("Quota");
    });

    it("should classify rate limit errors as recoverable", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Too many requests - 429 rate limit",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("recoverable");
      expect(classification.retryable).toBe(true);
      expect(classification.reason).toContain("Rate limiting");
    });

    it("should classify memory errors as recoverable", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Out of memory",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("recoverable");
      expect(classification.retryable).toBe(true);
    });

    it("should classify permission errors as permanent", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Permission denied",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("permanent");
      expect(classification.retryable).toBe(false);
    });

    it("should classify schema validation as user-action-required", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Schema validation failed",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("user-action-required");
      expect(classification.retryable).toBe(true);
      expect(classification.suggestedAction).toBeDefined();
    });

    it("should default unknown errors to recoverable", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        errorLog: {
          lastError: "Some unknown error occurred",
        },
      } as unknown as ImportJob;

      const classification = (ErrorRecoveryService as any).classifyError(job);

      expect(classification.type).toBe("recoverable");
      expect(classification.retryable).toBe(true);
    });
  });

  describe("Recovery Stage Determination", () => {
    it("should restart from last successful stage", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        lastSuccessfulStage: PROCESSING_STAGE.DETECT_SCHEMA,
      } as unknown as ImportJob;

      const classification = { type: "recoverable", retryable: true, reason: "test" };
      const recoveryStage = (ErrorRecoveryService as any).determineRecoveryStage(job, classification);

      expect(recoveryStage).toBe(PROCESSING_STAGE.VALIDATE_SCHEMA);
    });

    it("should restart from schema validation for schema errors", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        lastSuccessfulStage: PROCESSING_STAGE.GEOCODE_BATCH,
      } as unknown as ImportJob;

      const classification = {
        type: "user-action-required",
        retryable: true,
        reason: "schema validation error",
      };
      const recoveryStage = (ErrorRecoveryService as any).determineRecoveryStage(job, classification);

      expect(recoveryStage).toBe(PROCESSING_STAGE.VALIDATE_SCHEMA);
    });

    it("should default to ANALYZE_DUPLICATES if no last successful stage", () => {
      const job = {
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        lastSuccessfulStage: null,
      } as unknown as ImportJob;

      const classification = { type: "recoverable", retryable: true, reason: "test" };
      const recoveryStage = (ErrorRecoveryService as any).determineRecoveryStage(job, classification);

      expect(recoveryStage).toBe(PROCESSING_STAGE.ANALYZE_DUPLICATES);
    });
  });

  describe("Retry Scheduling", () => {
    it("should reject retry if job not found", async () => {
      mockPayload.findByID.mockResolvedValue(null);

      const result = await ErrorRecoveryService.recoverFailedJob(mockPayload, 999);

      expect(result.success).toBe(false);
      expect(result.action).toBe("job_not_found");
    });

    it("should reject retry if job not in failed state", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: 1,
        stage: PROCESSING_STAGE.COMPLETED,
      });

      const result = await ErrorRecoveryService.recoverFailedJob(mockPayload, 1);

      expect(result.success).toBe(false);
      expect(result.action).toBe("not_failed");
    });

    it("should reject retry if error is not retryable", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        importFile: { id: "file1" },
        errorLog: {
          lastError: "Permission denied",
        },
      });

      mockPayload.findByID.mockResolvedValueOnce({
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        importFile: "file1",
        errorLog: {
          lastError: "Permission denied",
        },
      });

      mockPayload.findByID.mockResolvedValueOnce({
        id: "file1",
        user: null,
      });

      const result = await ErrorRecoveryService.recoverFailedJob(mockPayload, 1);

      expect(result.success).toBe(false);
      expect(result.action).toBe("not_retryable");
    });

    it("should reject retry if max retries exceeded", async () => {
      // Reset the mock completely to avoid pollution from previous tests
      mockPayload.findByID.mockReset();

      let callCount = 0;
      mockPayload.findByID.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            id: 1,
            stage: PROCESSING_STAGE.FAILED,
            importFile: "file1",
            retryAttempts: 3, // Max retries
            errorLog: {
              lastError: "Connection timeout",
            },
          };
        } else if (callCount === 2) {
          return {
            id: "file1",
            user: null, // No user means no quota check needed
          };
        }
        return null;
      });

      const result = await ErrorRecoveryService.recoverFailedJob(mockPayload, 1);

      expect(result.success).toBe(false);
      expect(result.action).toBe("max_retries_exceeded");
    });

    it("should calculate exponential backoff correctly", async () => {
      // Reset the mock completely to avoid pollution from previous tests
      mockPayload.findByID.mockReset();
      mockPayload.update.mockReset();

      const baseDelayMs = 30000;
      const backoffMultiplier = 2;

      let callCount = 0;
      mockPayload.findByID.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get import job
          return {
            id: 1,
            stage: PROCESSING_STAGE.FAILED,
            importFile: "file1",
            retryAttempts: 2, // Third attempt
            errorLog: {
              lastError: "Connection timeout",
            },
          };
        } else if (callCount === 2) {
          // Second call: get import file
          return {
            id: "file1",
            user: null, // No user means no quota check needed
          };
        }
        return null;
      });

      mockPayload.update.mockResolvedValue({});

      const result = await ErrorRecoveryService.recoverFailedJob(mockPayload, 1);

      expect(result.success).toBe(true);
      expect(result.nextRetryAt).toBeDefined();

      // Check that delay is approximately 30s * 2^2 = 120s (120000ms)
      const delay = result.nextRetryAt!.getTime() - Date.now();
      const expectedDelay = baseDelayMs * Math.pow(backoffMultiplier, 2);
      expect(delay).toBeGreaterThanOrEqual(expectedDelay - 1000);
      expect(delay).toBeLessThanOrEqual(expectedDelay + 1000);
    });

    it("should cap delay at max delay", async () => {
      // Reset the mock completely to avoid pollution from previous tests
      mockPayload.findByID.mockReset();
      mockPayload.update.mockReset();

      const maxDelayMs = 300000; // 5 minutes

      let callCount = 0;
      mockPayload.findByID.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get import job
          return {
            id: 1,
            stage: PROCESSING_STAGE.FAILED,
            importFile: "file1",
            retryAttempts: 10, // Would exceed max delay without cap
            errorLog: {
              lastError: "Connection timeout",
            },
          };
        } else if (callCount === 2) {
          // Second call: get import file
          return {
            id: "file1",
            user: null, // No user means no quota check needed
          };
        }
        return null;
      });

      mockPayload.update.mockResolvedValue({});

      const result = await ErrorRecoveryService.recoverFailedJob(mockPayload, 1, { maxRetries: 15 });

      expect(result.success).toBe(true);
      expect(result.nextRetryAt).toBeDefined();

      // Check that delay doesn't exceed max
      const delay = result.nextRetryAt!.getTime() - Date.now();
      expect(delay).toBeLessThanOrEqual(maxDelayMs + 1000);
    });
  });

  describe("Manual Reset", () => {
    it("should allow resetting to any valid stage", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
      });

      mockPayload.update.mockResolvedValue({});

      const result = await ErrorRecoveryService.resetJobToStage(mockPayload, 1, PROCESSING_STAGE.GEOCODE_BATCH, true);

      expect(result.success).toBe(true);
      expect(result.action).toBe("manual_reset");
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "import-jobs",
          id: 1,
          data: expect.objectContaining({
            stage: PROCESSING_STAGE.GEOCODE_BATCH,
            retryAttempts: 0,
          }),
        })
      );
    });

    it("should preserve retry count if clearRetries is false", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: 1,
        stage: PROCESSING_STAGE.FAILED,
        retryAttempts: 2,
      });

      mockPayload.update.mockResolvedValue({});

      await ErrorRecoveryService.resetJobToStage(mockPayload, 1, PROCESSING_STAGE.ANALYZE_DUPLICATES, false);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            retryAttempts: expect.anything(),
          }),
        })
      );
    });
  });

  describe("Get Recovery Recommendations", () => {
    it("should provide recommendations for all failed jobs", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: 1,
            stage: PROCESSING_STAGE.FAILED,
            retryAttempts: 0,
            errorLog: { lastError: "Connection timeout" },
          },
          {
            id: 2,
            stage: PROCESSING_STAGE.FAILED,
            retryAttempts: 3,
            errorLog: { lastError: "Connection timeout" },
          },
          {
            id: 3,
            stage: PROCESSING_STAGE.FAILED,
            retryAttempts: 1,
            errorLog: { lastError: "Permission denied" },
          },
        ],
      });

      const recommendations = await ErrorRecoveryService.getRecoveryRecommendations(mockPayload);

      expect(recommendations).toHaveLength(3);
      expect(recommendations[0]?.recommendedAction).toBe("Automatic retry available");
      expect(recommendations[1]?.recommendedAction).toContain("max retries");
      expect(recommendations[2]?.recommendedAction).toBe("No action recommended");
    });
  });
});
