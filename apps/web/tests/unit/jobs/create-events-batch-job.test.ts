/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockContext, createMockImportFile } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    generateUniqueId: vi.fn(),
    getGeocodingResults: vi.fn(),
    getGeocodingResultForRow: vi.fn(),
    startStage: vi.fn(),
    updateStageProgress: vi.fn(),
    completeBatch: vi.fn(),
    completeStage: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/utils/file-readers", () => ({
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: mocks.generateUniqueId }));

vi.mock("@/lib/types/geocoding", () => ({
  getGeocodingResults: mocks.getGeocodingResults,
  getGeocodingResultForRow: mocks.getGeocodingResultForRow,
}));

vi.mock("@/lib/services/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: mocks.startStage,
    updateStageProgress: mocks.updateStageProgress,
    completeBatch: mocks.completeBatch,
    completeStage: mocks.completeStage,
  },
}));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getImportFilePath: vi.fn((filename: string) => `/mock/import-files/${filename}`),
}));

vi.mock("@/lib/services/quota-service", () => ({
  getQuotaService: vi.fn(() => ({
    checkQuota: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 10000, remaining: 10000 }),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
  })),
}));

/** Helper to create a mock async iterable from arrays of batches. */
const mockAsyncGenerator = (batches: Record<string, unknown>[][]) => ({
  [Symbol.asyncIterator]: () => {
    let index = 0;
    return {
      next: async () => {
        await Promise.resolve();
        if (index < batches.length) {
          return { value: batches[index++], done: false as const };
        }
        return { value: undefined, done: true as const };
      },
    };
  },
});

describe.sequential("CreateEventsBatchJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup ProgressTrackingService mocks to return resolved promises
    mocks.startStage.mockResolvedValue(undefined);
    mocks.updateStageProgress.mockResolvedValue(undefined);
    mocks.completeBatch.mockResolvedValue(undefined);
    mocks.completeStage.mockResolvedValue(undefined);

    // Mock payload
    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({ docs: [] }),
      count: vi.fn().mockResolvedValue({ totalDocs: 2 }),
      jobs: { queue: vi.fn().mockResolvedValue({}) },
    };

    // Mock context — no batchNumber needed
    mockContext = createMockContext(mockPayload, { importJobId: "import-123" });
  });

  describe("Success Cases", () => {
    it("should create events successfully from streamed data", async () => {
      // Mock import job - needs to be mutable to track updates (using const with Object.assign)
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 2 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset
      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      // Mock import file
      const mockImportFile = createMockImportFile();

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "456 Oak Ave" },
      ];

      // Setup mocks - findByID will be called multiple times by ProgressTrackingService
      // update mock should update the mockImportJob
      mockPayload.update.mockImplementation(({ collection, data }: any) => {
        if (collection === "import-jobs") {
          Object.assign(mockImportJob, data);
        }
        return Promise.resolve(mockImportJob);
      });

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Execute job
      const result = await createEventsBatchJob.handler(mockContext);

      // Verify result — new output format
      expect(result).toEqual({ output: { totalBatches: 1, eventsCreated: 2, eventsSkipped: 0, errors: 0 } });

      // Verify streaming was used
      expect(mocks.streamBatchesFromFile).toHaveBeenCalledWith("/mock/import-files/test.csv", {
        sheetIndex: 0,
        batchSize: expect.any(Number),
      });

      // Verify events were created
      expect(mockPayload.create).toHaveBeenCalledTimes(2);
      expect(mockPayload.create).toHaveBeenNthCalledWith(1, {
        collection: "events",
        data: expect.objectContaining({
          dataset: "dataset-456",
          uniqueId: "dataset-456:ext:1",
          data: expect.objectContaining({ id: "1", title: "Event 1", address: "123 Main St" }),
        }),
      });

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();

      // Verify no batch queuing (single job)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("preserves string import file IDs when marking the file complete", async () => {
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      const mockImportFile = createMockImportFile("file-789");

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "import-files", id: "file-789", data: { status: "completed" } })
      );
    });

    it("should skip duplicate rows identified in previous stage", async () => {
      // Mock import job with duplicates
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [{ rowNumber: 1, uniqueId: "dataset-456:ext:2" }],
          external: [{ rowNumber: 2, uniqueId: "dataset-456:ext:3" }],
          summary: { uniqueRows: 1 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      const mockImportFile = createMockImportFile();

      // Mock file data (3 rows, but 2 are duplicates)
      const mockFileData = [
        { id: "1", title: "Event 1" }, // Will be created
        { id: "2", title: "Event 2" }, // Internal duplicate - skip
        { id: "3", title: "Event 3" }, // External duplicate - skip
      ];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:3");

      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          totalBatches: 1,
          eventsCreated: 1, // Only first row created
          eventsSkipped: 2, // Second and third rows skipped
          errors: 0,
        },
      });

      // Should only create one event (for the non-duplicate row)
      expect(mockPayload.create).toHaveBeenCalledTimes(1);

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();
    });

    it("should process multiple batches in single job", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 4 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Two batches of data
      const batch1 = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];
      const batch2 = [
        { id: "3", title: "Event 3" },
        { id: "4", title: "Event 4" },
      ];
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([batch1, batch2]));

      // Mock unique ID generation for all rows
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Should indicate all batches processed
      expect(result).toEqual({ output: { totalBatches: 2, eventsCreated: 4, eventsSkipped: 0, errors: 0 } });

      // Should create 4 events
      expect(mockPayload.create).toHaveBeenCalledTimes(4);

      // Should NOT queue any follow-up jobs (single job handles everything)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("should mark import as completed after processing all batches", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: {
          internal: [],
          external: [],
          summary: { internalDuplicates: 1, externalDuplicates: 2, uniqueRows: 10 },
        },
        progress: {
          stages: { "create-events": { status: "in_progress", rowsProcessed: 10, rowsTotal: 10 } },
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = { id: "dataset-456" };
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock empty stream (no rows to process)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));

      // Set up geocoding results properly
      const geocodingResultsMap = {
        "0": { rowNumber: 0, coordinates: { lat: 1, lng: 1 }, confidence: 0.9 },
        "1": { rowNumber: 1, coordinates: { lat: 2, lng: 2 }, confidence: 0.8 },
      };

      mocks.getGeocodingResults.mockReturnValue(geocodingResultsMap);

      await createEventsBatchJob.handler(mockContext);

      // Should mark as completed
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "completed",
          results: {
            totalEvents: 2, // From payload.count() mock
            duplicatesSkipped: 3, // 1 internal + 2 external
            geocoded: 2, // 2 geocoding results
            errors: 0,
          },
        },
      });
    });
  });

  describe("Progress Tracking", () => {
    it("should pass totalRows (not uniqueRows) to startStage when duplicates exist", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [{ rowNumber: 1, uniqueId: "dataset-456:ext:2" }],
          external: [],
          // totalRows=5, uniqueRows=4 — stream iterates all 5 rows
          summary: { totalRows: 5, uniqueRows: 4, internalDuplicates: 1, externalDuplicates: 0 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();

      const mockFileData = Array.from({ length: 5 }, (_, i) => ({ id: `${i + 1}`, title: `Event ${i + 1}` }));

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Must use totalRows (5), not uniqueRows (4), because the stream iterates all rows
      expect(mocks.startStage).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "create-events",
        5 // totalRows from duplicates.summary, NOT uniqueRows
      );
    });

    it("should not double-count failed rows in batch progress", async () => {
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 5 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();

      // 5 rows in a single batch — the 3rd row (index 2) will fail
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
        { id: "4", title: "Event 4" },
        { id: "5", title: "Event 5" },
      ];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      // 3rd call throws, rest succeed
      mockPayload.create
        .mockResolvedValueOnce({ id: "event-1" })
        .mockResolvedValueOnce({ id: "event-2" })
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({ id: "event-4" })
        .mockResolvedValueOnce({ id: "event-5" });

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // 4 created, 0 skipped (no duplicates), 1 error — no double-counting
      expect(result).toEqual({ output: { totalBatches: 1, eventsCreated: 4, eventsSkipped: 0, errors: 1 } });

      // batchRowsProcessed = eventsCreated + eventsSkipped + errors.length = 4 + 0 + 1 = 5
      // Before the fix, eventsSkipped was incremented in the catch block too, giving 6
      expect(mocks.updateStageProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "create-events",
        5, // totalRowsProcessed (rows.length)
        5 // batchRowsProcessed (4 created + 0 skipped + 1 error = 5, not 6)
      );
    });
  });

  describe("Retry Idempotency", () => {
    it("should delete events from prior attempt on retry", async () => {
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // First count call (clean-slate check) returns 5 existing events from prior attempt,
      // subsequent count calls (e.g., markJobCompleted) return 2
      mockPayload.count.mockResolvedValueOnce({ totalDocs: 5 }).mockResolvedValue({ totalDocs: 2 });

      // Add delete mock for cleaning up prior events
      mockPayload.delete = vi.fn().mockResolvedValue({ docs: [] });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Verify prior events were deleted before streaming began
      expect(mockPayload.delete).toHaveBeenCalledWith({
        collection: "events",
        where: { importJob: { equals: "import-123" } },
      });

      // Verify the handler continued normally and produced a result
      expect(result).toEqual({ output: { totalBatches: 1, eventsCreated: 1, eventsSkipped: 0, errors: 0 } });
    });
  });

  describe("Error Handling", () => {
    it("should throw error when import job not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Import job not found: import-123");
    });

    it("should throw error when dataset not found", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Import file not found

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });
  });

  describe("Quota Check", () => {
    it("should check quota against uniqueRows, not totalRows, when duplicates exist", async () => {
      // totalRows=1000, uniqueRows=50 (950 internal duplicates)
      // Quota limit is 100 — uniqueRows (50) is within limit
      const mockCheckQuota = vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, remaining: 50 });

      // Must mock quota-service BEFORE handler reads it; use dynamic import override
      const { getQuotaService } = await import("@/lib/services/quota-service");
      vi.mocked(getQuotaService).mockReturnValue({ checkQuota: mockCheckQuota } as any);

      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: Array.from({ length: 950 }, (_, i) => ({ rowNumber: i + 50, uniqueId: `dup-${i}` })),
          external: [],
          summary: { totalRows: 1000, uniqueRows: 50, internalDuplicates: 950, externalDuplicates: 0 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();
      // Add user for quota check path
      (mockImportFile as any).user = { id: "user-1", role: "user" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        if (collection === "users") return Promise.resolve({ id: "user-1", role: "user" });
        return Promise.resolve(null);
      });

      // Stream with a single row for simplicity (actual row count doesn't matter for quota test)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Should succeed — quota checks uniqueRows (50), not totalRows (1000)
      await createEventsBatchJob.handler(mockContext);

      // Verify startStage was called with totalRows (1000) for progress tracking
      expect(mocks.startStage).toHaveBeenCalledWith(mockPayload, "import-123", "create-events", 1000);

      // Verify quota was checked with uniqueRows (50), not totalRows (1000)
      expect(mockCheckQuota).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1" }),
        expect.any(String), // "EVENTS_PER_IMPORT"
        50
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty stream gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 0 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456" };
      const mockImportFile = { id: "file-789", filename: "empty.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Mock find for updateImportFileStatusIfAllJobsComplete
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock empty stream
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));
      mocks.getGeocodingResults.mockReturnValue(new Map());

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({ output: { totalBatches: 0, eventsCreated: 0, eventsSkipped: 0, errors: 0 } });

      // Should mark as completed
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "completed",
          results: {
            totalEvents: 2, // From payload.count() mock
            duplicatesSkipped: 0,
            geocoded: 0,
            errors: 0,
          },
        },
      });
    });
  });

  describe("Type Transformations", () => {
    it("should skip transformations when allowTransformations is false", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: false },
        importTransforms: [
          {
            id: "transform-age",
            type: "type-cast",
            from: "age",
            fromType: "string",
            toType: "number",
            strategy: "parse",
            active: false,
          },
        ],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", name: "John", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify age is still string (transform is inactive)
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({
          data: expect.objectContaining({ age: "25" }), // Still string
          validationStatus: "pending",
          transformations: null,
        }),
      });
    });

    it("should apply type transformations and mark event as transformed", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
          {
            id: "transform-age",
            type: "type-cast",
            from: "age",
            fromType: "string",
            toType: "number",
            strategy: "parse",
            active: true,
          },
        ],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", name: "John", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify transformation was applied
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({
          data: expect.objectContaining({
            age: 25, // Transformed to number
          }),
          validationStatus: "transformed",
          transformations: expect.arrayContaining([expect.objectContaining({ path: "age" })]),
        }),
      });
    });

    it("should handle empty transformations array", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // No transformations applied
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({ validationStatus: "pending", transformations: null }),
      });
    });

    it("should apply multiple transformations to different fields", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
          {
            id: "transform-age",
            type: "type-cast",
            from: "age",
            fromType: "string",
            toType: "number",
            strategy: "parse",
            active: true,
          },
          {
            id: "transform-active",
            type: "type-cast",
            from: "active",
            fromType: "string",
            toType: "boolean",
            strategy: "parse",
            active: true,
          },
        ],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25", active: "true" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({
          data: expect.objectContaining({ age: 25, active: true }),
          transformations: expect.arrayContaining([
            expect.objectContaining({ path: "age" }),
            expect.objectContaining({ path: "active" }),
          ]),
        }),
      });
    });

    it("should skip disabled transformation rules", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
          {
            id: "transform-age",
            type: "type-cast",
            from: "age",
            fromType: "string",
            toType: "number",
            strategy: "parse",
            active: false, // Disabled
          },
        ],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({
          data: expect.objectContaining({ age: "25" }), // Still string
          validationStatus: "pending",
        }),
      });
    });

    it("should handle transformation errors gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
          {
            id: "transform-age",
            type: "type-cast",
            from: "age",
            fromType: "string",
            toType: "number",
            strategy: "parse",
            active: true,
          },
        ],
      };

      const mockImportFile = createMockImportFile();

      // Invalid data that will fail transformation
      const mockFileData = [{ id: "1", age: "not-a-number" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Event should still be created with original value preserved (transform failed)
      // But transformations array tracks what was attempted (not what succeeded)
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({
          data: expect.objectContaining({ age: "not-a-number" }), // Original value preserved
          validationStatus: "transformed", // Marks as transformed (attempted)
          transformations: expect.arrayContaining([expect.objectContaining({ path: "age" })]),
        }),
      });
    });
  });
});
