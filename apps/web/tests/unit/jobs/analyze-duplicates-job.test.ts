/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeDuplicatesJob } from "@/lib/jobs/handlers/analyze-duplicates-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockImportFile } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    getFileRowCount: vi.fn(),
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    generateUniqueId: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/services/progress-tracking", () => ({
  ProgressTrackingService: {
    initializeStageProgress: vi.fn().mockResolvedValue(undefined),
    updateStageProgress: vi.fn().mockResolvedValue(undefined),
    completeBatch: vi.fn().mockResolvedValue(undefined),
    startStage: vi.fn().mockResolvedValue(undefined),
    completeStage: vi.fn().mockResolvedValue(undefined),
    updatePostDeduplicationTotals: vi.fn().mockResolvedValue(undefined),
    skipStage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/utils/file-readers", () => ({
  getFileRowCount: mocks.getFileRowCount,
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: mocks.generateUniqueId }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getImportFilePath: vi.fn((filename: string) => `/mock/import-files/${filename}`),
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

describe.sequential("AnalyzeDuplicatesJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    // Reset all mocks (clearAllMocks resets call history/return values;
    // do NOT use restoreAllMocks as it undoes vi.mock module-level mocks)
    vi.clearAllMocks();

    // Mock payload
    mockPayload = { findByID: vi.fn(), update: vi.fn(), find: vi.fn(), jobs: { queue: vi.fn().mockResolvedValue({}) } };

    // Mock context
    mockContext = {
      req: { payload: mockPayload },
      job: { id: "test-job-1", taskStatus: "running" } as any,
      input: { importJobId: "import-123" } as any,
    };
  });

  describe("Success Cases", () => {
    it("should skip analysis when deduplication is disabled", async () => {
      // Mock import job
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication disabled
      const mockDataset = { id: "dataset-456", deduplicationConfig: { enabled: false } };

      // Mock import file
      const mockImportFile = createMockImportFile();

      // Setup payload mock responses
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob) // First call returns import job
        .mockResolvedValueOnce(mockDataset) // Second call returns dataset
        .mockResolvedValueOnce(mockImportFile) // Third call returns import file
        .mockResolvedValueOnce(mockImportJob); // Fourth call refetches import job after progress init

      // Mock getFileRowCount for total rows
      mocks.getFileRowCount.mockReturnValueOnce(100);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({ output: { skipped: true } });

      // Verify payload calls - includes refetch after progress initialization
      expect(mockPayload.findByID).toHaveBeenCalledTimes(4);
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(1, { collection: "import-jobs", id: "import-123" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(2, { collection: "datasets", id: "dataset-456" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(3, { collection: "import-files", id: "file-789" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(4, { collection: "import-jobs", id: "import-123" });

      // Verify update call
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "detect-schema",
          duplicates: {
            strategy: "disabled",
            internal: [],
            external: [],
            summary: { totalRows: 100, uniqueRows: 100, internalDuplicates: 0, externalDuplicates: 0 },
          },
        },
      });
    });

    it("should process file with no duplicates", async () => {
      // Mock import job
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456", // Reference to dataset
        importFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled - note the nested structure
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: {
          enabled: true, // This must be true for analysis to run
        },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockImportFile = createMockImportFile();

      // Mock file data - no duplicates
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
      ];

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock getFileRowCount
      mocks.getFileRowCount.mockReturnValueOnce(3);

      // Mock streaming - yields one batch then ends
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:3");

      // Mock no existing events (no external duplicates)
      mockPayload.find.mockResolvedValueOnce({ docs: [] });

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({ output: { totalRows: 3, uniqueRows: 3, internalDuplicates: 0, externalDuplicates: 0 } });

      // Verify streaming was called
      expect(mocks.streamBatchesFromFile).toHaveBeenCalledWith(
        expect.stringContaining("test.csv"),
        expect.objectContaining({ batchSize: expect.any(Number) })
      );

      // Verify unique ID generation
      expect(mocks.generateUniqueId).toHaveBeenCalledTimes(3);
      expect(mocks.generateUniqueId).toHaveBeenCalledWith(
        { id: "1", title: "Event 1" },
        { type: "external", externalIdPath: "id" }
      );

      // Verify external duplicate check
      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "events",
        where: {
          dataset: { equals: "dataset-456" },
          uniqueId: { in: ["dataset-456:ext:1", "dataset-456:ext:2", "dataset-456:ext:3"] },
        },
        limit: 3,
      });
    });

    it("should identify internal duplicates", async () => {
      // Mock import job
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: {
          enabled: true, // This must be true for analysis to run
        },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockImportFile = createMockImportFile();

      // Mock file data with internal duplicate
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "1", title: "Event 1 Again" }, // Duplicate of first row
      ];

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.getFileRowCount.mockReturnValueOnce(3);
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:1"); // Same as first

      mockPayload.find.mockResolvedValueOnce({ docs: [] });
      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          totalRows: 3,
          uniqueRows: 2, // uniqueIdMap.size = 2 (distinct unique IDs: id:1, id:2)
          internalDuplicates: 1,
          externalDuplicates: 0,
        },
      });
    });

    it("should identify external duplicates", async () => {
      // Mock import job
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: {
          enabled: true, // This must be true for analysis to run
        },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockImportFile = createMockImportFile();

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];

      // Mock existing event (external duplicate)
      const mockExistingEvent = { id: "existing-event-123", uniqueId: "dataset-456:ext:1" };

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.getFileRowCount.mockReturnValueOnce(2);
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      // Mock existing event found
      mockPayload.find.mockResolvedValueOnce({ docs: [mockExistingEvent] });
      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          totalRows: 2,
          uniqueRows: 1, // 2 unique IDs minus 1 external duplicate
          internalDuplicates: 0,
          externalDuplicates: 1,
        },
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw error when import job not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Import job not found: import-123");

      expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "import-jobs", id: "import-123" });
    });

    it("should throw error when dataset not found", async () => {
      const mockImportJob = { id: "import-123", dataset: "dataset-456", importFile: "file-789" };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = { id: "import-123", dataset: "dataset-456", importFile: "file-789" };

      const mockDataset = { id: "dataset-456", deduplicationConfig: { enabled: true } };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Import file not found

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });

    it("should clean up sidecar files on error", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 1,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      const mockImportFile = createMockImportFile();

      // Use mockImplementation to handle all findByID calls (initial + progress refetch + error-path reload)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.getFileRowCount.mockReturnValueOnce(3);

      // Mock streaming that throws
      mocks.streamBatchesFromFile.mockReturnValueOnce({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await Promise.resolve();
            throw new Error("Corrupt Excel file");
          },
        }),
      });

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Corrupt Excel file");

      // Verify sidecar cleanup was called
      expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith(
        expect.stringContaining("test.csv"),
        1 // sheetIndex from mockImportJob
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty file", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      const mockImportFile = createMockImportFile();

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock empty file
      mocks.getFileRowCount.mockReturnValueOnce(0);
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result for empty file
      expect(result).toEqual({ output: { totalRows: 0, uniqueRows: 0, internalDuplicates: 0, externalDuplicates: 0 } });

      // Verify no external duplicate check was made
      expect(mockPayload.find).not.toHaveBeenCalled();
    });
  });
});
