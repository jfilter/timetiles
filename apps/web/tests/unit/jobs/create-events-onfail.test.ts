/**
 * Unit tests for the create-events-batch onFail cleanup isolation.
 *
 * Verifies that the onFail callback wraps cleanup and status update
 * in separate try/catch blocks so a cleanup failure does not prevent
 * the status update to FAILED.
 *
 * @module
 * @category Tests
 */
// Import centralized mocks FIRST
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { TaskCallbackArgs } from "@/lib/jobs/utils/job-context";

// Mock all heavy dependencies to isolate onFail behavior
vi.mock("@/lib/ingest/file-readers", () => ({ streamBatchesFromFile: vi.fn(), cleanupSidecarFiles: vi.fn() }));
vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: vi.fn() }));
vi.mock("@/lib/types/geocoding", () => ({ getImportGeocodingResults: vi.fn(), getGeocodingResultForRow: vi.fn() }));
vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: vi.fn(),
    updateStageProgress: vi.fn(),
    updateAndCompleteBatch: vi.fn(),
    completeBatch: vi.fn(),
    completeStage: vi.fn(),
  },
}));
vi.mock("@/lib/jobs/utils/upload-path", () => ({ getIngestFilePath: vi.fn(() => "/mock/path") }));
vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({
    checkQuota: vi.fn().mockResolvedValue({ allowed: true }),
    incrementUsage: vi.fn(),
  })),
}));
vi.mock("@/lib/jobs/utils/bulk-event-insert", () => ({ bulkInsertEvents: vi.fn() }));
vi.mock("@/lib/collections/catalog-ownership", () => ({ extractDenormalizedAccessFields: vi.fn() }));

describe.sequential("create-events-batch onFail isolation", () => {
  let mockPayload: { update: ReturnType<typeof vi.fn>; findByID: ReturnType<typeof vi.fn>; db: any };

  /**
   * Build a minimal drizzle mock that simulates cleanupPriorAttempt behavior.
   * When selectResult is provided, the select chain resolves to that value.
   * When selectError is provided, the select chain rejects.
   */
  const createDrizzleMock = (options: { selectResult?: unknown[]; selectError?: Error } = {}) => {
    const buildChain = (resolveValue: unknown = [], rejectWith?: Error) => {
      const chain: Record<string, any> = {};
      for (const m of ["select", "from", "where", "limit", "insert", "values", "returning", "delete"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      // oxlint-disable-next-line unicorn/no-thenable, promise/prefer-await-to-then -- intentional thenable for Drizzle mock
      chain.then = (resolve: any, reject?: any) =>
        rejectWith
          ? Promise.reject(rejectWith).then(resolve, reject)
          : Promise.resolve(resolveValue).then(resolve, reject);
      return chain;
    };

    if (options.selectError) {
      return {
        select: vi.fn().mockImplementation(() => buildChain(undefined, options.selectError)),
        delete: vi.fn().mockImplementation(() => buildChain()),
      };
    }

    // Default: first select returns provided rows (or []), subsequent selects return []
    const results = [options.selectResult ?? [], []];
    let callIndex = 0;
    return {
      select: vi.fn().mockImplementation(() => buildChain(results[callIndex++] ?? [])),
      delete: vi.fn().mockImplementation(() => buildChain()),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = { update: vi.fn().mockResolvedValue({}), findByID: vi.fn(), db: { drizzle: createDrizzleMock() } };
  });

  /** Build TaskCallbackArgs for onFail. */
  const buildArgs = (overrides: Partial<TaskCallbackArgs> = {}): TaskCallbackArgs => ({
    input: { ingestJobId: "import-onfail-1" },
    job: { id: "job-1", error: "Something went wrong" },
    req: { payload: mockPayload as any },
    ...overrides,
  });

  it("should update status to FAILED even when cleanup throws", async () => {
    // Make cleanupPriorAttempt throw by having the drizzle select fail
    mockPayload.db.drizzle = createDrizzleMock({ selectError: new Error("Drizzle connection error") });

    await createEventsBatchJob.onFail(buildArgs());

    // The status update should still be called despite cleanup failure
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "ingest-jobs",
      id: "import-onfail-1",
      data: { stage: "failed", errorLog: { lastError: "Something went wrong", context: "create-events-batch" } },
    });
  });

  it("should not throw when cleanup succeeds but status update throws", async () => {
    // Cleanup succeeds (no events to delete), but status update throws
    mockPayload.update.mockRejectedValueOnce(new Error("Database unavailable"));

    // Should not throw — onFail wraps the update in its own try/catch
    await expect(createEventsBatchJob.onFail(buildArgs())).resolves.toBeUndefined();
  });

  it("should call both cleanup and status update when both succeed", async () => {
    // Setup: cleanupPriorAttempt finds some events to delete
    mockPayload.db.drizzle = createDrizzleMock({ selectResult: [{ id: 1 }, { id: 2 }] });

    await createEventsBatchJob.onFail(buildArgs());

    // Cleanup ran (drizzle select was called)
    expect(mockPayload.db.drizzle.select).toHaveBeenCalled();

    // Status update was called
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "ingest-jobs",
        id: "import-onfail-1",
        data: expect.objectContaining({ stage: "failed" }),
      })
    );
  });

  it("should use error string from job when available", async () => {
    await createEventsBatchJob.onFail(buildArgs({ job: { id: "job-2", error: "Quota exceeded: too many events" } }));

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorLog: expect.objectContaining({ lastError: "Quota exceeded: too many events" }),
        }),
      })
    );
  });

  it("should use fallback error message when job.error is not a string", async () => {
    await createEventsBatchJob.onFail(buildArgs({ job: { id: "job-3", error: { code: 500 } } }));

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorLog: expect.objectContaining({ lastError: "Task failed after all retries" }),
        }),
      })
    );
  });

  it("should do nothing when ingestJobId is missing from input", async () => {
    await createEventsBatchJob.onFail(buildArgs({ input: {} }));

    // Neither cleanup nor status update should be called
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockPayload.db.drizzle.select).not.toHaveBeenCalled();
  });
});
