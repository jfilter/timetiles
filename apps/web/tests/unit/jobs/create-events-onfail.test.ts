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
/* oxlint-disable promise/prefer-await-to-then, unicorn/no-thenable */
// Import centralized mocks first
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { TaskCallbackArgs } from "@/lib/jobs/utils/job-context";

// Mock all heavy dependencies to isolate onFail behavior
vi.mock("@/lib/ingest/file-readers", () => ({ streamBatchesFromFile: vi.fn(), cleanupSidecarFiles: vi.fn() }));
vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: vi.fn() }));
vi.mock("@/lib/ingest/types/geocoding", () => ({
  getIngestGeocodingResults: vi.fn(),
  getGeocodingResultForRow: vi.fn(),
}));
vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: vi.fn(),
    updateStageProgress: vi.fn(),
    updateAndCompleteBatch: vi.fn(),
    completeBatch: vi.fn(),
    completeStage: vi.fn(),
  },
}));
vi.mock("@/lib/ingest/upload-path", () => ({ getIngestFilePath: vi.fn(() => "/mock/path") }));
vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({
    checkQuota: vi.fn().mockResolvedValue({ allowed: true }),
    checkAndIncrementUsage: vi.fn().mockResolvedValue(true),
    incrementUsage: vi.fn(),
    decrementUsage: vi.fn(),
  })),
}));
vi.mock("@/lib/jobs/utils/bulk-event-insert", () => ({ bulkInsertEvents: vi.fn() }));
vi.mock("@/lib/collections/catalog-ownership", () => ({ extractDenormalizedAccessFields: vi.fn() }));
// onFail's rollback runs under the per-dataset lease; stub it to a no-op lease.
vi.mock("@/lib/database/dataset-import-lock", () => ({
  acquireDatasetImportLease: vi.fn(() => Promise.resolve({ release: vi.fn() })),
}));

describe("create-events-batch onFail isolation", () => {
  let mockPayload: { update: ReturnType<typeof vi.fn>; findByID: ReturnType<typeof vi.fn>; db: any };

  /**
   * Build a minimal drizzle mock that simulates cleanupPriorAttempt behavior.
   * When selectResult is provided, the select chain resolves to that value.
   * When selectError is provided, the select chain rejects.
   */
  const createDrizzleMock = (options: { selectResult?: unknown[]; selectError?: Error } = {}) => {
    const buildChain = (resolveValue: unknown = [], rejectWith?: Error) => {
      const promise = rejectWith ? Promise.reject(rejectWith) : Promise.resolve(resolveValue);
      const chain: Record<string, any> = {};
      for (const m of ["select", "from", "where", "limit", "for", "insert", "values", "returning", "delete"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      // Drizzle query builders are thenable — the mock must replicate this
      chain.then = (resolve: any, reject?: any) => promise.then(resolve, reject); // NOSONAR — intentional thenable mock for drizzle query builder
      chain.catch = (reject: any) => promise.catch(reject);
      return chain;
    };

    const rootMock: Record<string, any> = {};
    if (options.selectError) {
      rootMock.select = vi.fn().mockImplementation(() => buildChain(undefined, options.selectError));
      rootMock.delete = vi.fn().mockImplementation(() => buildChain());
    } else {
      // Default: first select returns provided rows (or []), subsequent selects return []
      const results = [options.selectResult ?? [], []];
      let callIndex = 0;
      rootMock.select = vi.fn().mockImplementation(() => buildChain(results[callIndex++] ?? []));
      rootMock.delete = vi.fn().mockImplementation(() => buildChain());
    }
    // cleanupPriorAttempt runs its chunked delete inside a transaction.
    rootMock.transaction = vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(rootMock));
    return rootMock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      update: vi.fn().mockResolvedValue({}),
      // cleanupPriorAttempt loads the job to scope its delete by createdAt.
      findByID: vi.fn().mockResolvedValue({ id: "import-onfail-1", createdAt: "2026-01-01T00:00:00.000Z", dataset: 1 }),
      db: { drizzle: createDrizzleMock() },
    };
  });

  /** Build TaskCallbackArgs for onFail. */
  const buildArgs = (overrides: Partial<TaskCallbackArgs> = {}): TaskCallbackArgs => ({
    input: { ingestJobId: "import-onfail-1" },
    job: { id: "job-1", error: "Something went wrong" },
    req: { payload: mockPayload as any },
    taskStatus: { totalTried: createEventsBatchJob.retries },
    ...overrides,
  });

  it("leaves the job and its events alone on a failed attempt that Payload will retry", async () => {
    mockPayload.db.drizzle = createDrizzleMock({ selectResult: [{ id: 1 }] });

    await createEventsBatchJob.onFail(buildArgs({ taskStatus: null }));

    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockPayload.db.drizzle.select).not.toHaveBeenCalled();
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
    mockPayload.db.drizzle = createDrizzleMock({ selectResult: [{ id: 1 }, { id: 2 }] });

    await createEventsBatchJob.onFail(buildArgs());

    // Cleanup ran (drizzle select was called)
    expect(mockPayload.db.drizzle.select).toHaveBeenCalled();

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

  describe("superseded task generation", () => {
    const jobAt = (generation: number) =>
      mockPayload.findByID.mockResolvedValue({
        id: "import-onfail-1",
        generation,
        stage: "create-events",
        createdAt: "2026-01-01T00:00:00.000Z",
        dataset: 1,
      });

    it("neither rolls back nor fails a newer generation", async () => {
      jobAt(2);
      mockPayload.db.drizzle = createDrizzleMock({ selectResult: [{ id: 1 }] });

      await createEventsBatchJob.onFail(buildArgs({ input: { ingestJobId: "import-onfail-1", generation: 1 } }));

      expect(mockPayload.db.drizzle.select).not.toHaveBeenCalled();
      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("leaves newer work alone when the generation moved while the rollback waited for the lease", async () => {
      jobAt(2);
      const atOne = { id: "import-onfail-1", generation: 1, createdAt: "2026-01-01T00:00:00.000Z", dataset: 1 };
      // Current at the first check and when the rollback loads the job; bumped once the lease is held.
      mockPayload.findByID.mockResolvedValueOnce(atOne).mockResolvedValueOnce(atOne);
      mockPayload.db.drizzle = createDrizzleMock({ selectResult: [{ id: 1 }] });

      await createEventsBatchJob.onFail(buildArgs({ input: { ingestJobId: "import-onfail-1", generation: 1 } }));

      // The generation-checked FAILED write is covered by tests/integration/jobs/task-generation-writes.
      expect(mockPayload.db.drizzle.select).not.toHaveBeenCalled();
    });

    it("skips create-events without touching events", async () => {
      jobAt(2);
      mockPayload.db.drizzle = createDrizzleMock({ selectResult: [{ id: 1 }] });
      const context = {
        req: { payload: mockPayload },
        job: { id: "job-1" },
        input: { ingestJobId: "import-onfail-1", generation: 1 },
      };

      const result = await createEventsBatchJob.handler(context as never);

      expect(result.output).toMatchObject({ eventCount: 0, reason: "superseded" });
      expect(mockPayload.db.drizzle.select).not.toHaveBeenCalled();
      expect(mockPayload.update).not.toHaveBeenCalled();
    });
  });
});
