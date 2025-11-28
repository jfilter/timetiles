/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockContext, createMockImportFile } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    readBatchFromFile: vi.fn(),
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
  readBatchFromFile: mocks.readBatchFromFile,
}));

vi.mock("@/lib/services/id-generation", () => ({
  generateUniqueId: mocks.generateUniqueId,
}));

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
      count: vi.fn().mockResolvedValue({ totalDocs: 2 }),
      jobs: {
        queue: vi.fn().mockResolvedValue({}),
      },
    };

    // Mock context
    mockContext = createMockContext(mockPayload, {
      importJobId: "import-123",
      batchNumber: 0,
    });
  });

  describe("Success Cases", () => {
    it("should create events successfully from batch data", async () => {
      // Mock import job - needs to be mutable to track updates (using const with Object.assign)
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [],
          external: [],
          summary: { uniqueRows: 2 },
        },
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      // Mock dataset
      const mockDataset = {
        id: "dataset-456",
        idStrategy: {
          type: "external",
          externalIdPath: "id",
        },
      };

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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Execute job
      const result = await createEventsBatchJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          eventsCreated: 2,
          eventsSkipped: 0,
          errors: 0,
          hasMore: false,
        },
      });

      // Verify file reading
      expect(mocks.readBatchFromFile).toHaveBeenCalledWith("/mock/import-files/test.csv", {
        sheetIndex: 0,
        startRow: 0,
        limit: expect.any(Number),
      });

      // Verify events were created
      expect(mockPayload.create).toHaveBeenCalledTimes(2);
      expect(mockPayload.create).toHaveBeenNthCalledWith(1, {
        collection: "events",
        data: expect.objectContaining({
          dataset: "dataset-456",
          uniqueId: "dataset-456:ext:1",
          data: expect.objectContaining({
            id: "1",
            title: "Event 1",
            address: "123 Main St",
          }),
        }),
      });

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();
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
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
      };

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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
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
          batchNumber: 0,
          eventsCreated: 1, // Only first row created
          eventsSkipped: 2, // Second and third rows skipped
          errors: 0,
          hasMore: false,
        },
      });

      // Should only create one event (for the non-duplicate row)
      expect(mockPayload.create).toHaveBeenCalledTimes(1);

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();
    });

    it("should queue next batch when more data exists", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1000 } },
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Mock a full batch (1000 rows) to trigger hasMore = true
      const fullBatch = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Event ${i + 1}`,
      }));
      mocks.readBatchFromFile.mockReturnValueOnce(fullBatch);

      // Mock unique ID generation for all 1000 rows
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Should indicate more data available
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          eventsCreated: 1000,
          eventsSkipped: 0,
          errors: 0,
          hasMore: true,
        },
      });

      // Should create 1000 events
      expect(mockPayload.create).toHaveBeenCalledTimes(1000);

      // Should queue next batch
      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "create-events",
        input: {
          importJobId: "import-123",
          batchNumber: 1,
        },
      });
    });

    it("should mark import as completed when processing last batch", async () => {
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
          stages: {
            "create-events": {
              status: "in_progress",
              rowsProcessed: 10,
              rowsTotal: 10,
            },
          },
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

      // Mock empty batch (no more data)
      mocks.readBatchFromFile.mockReturnValueOnce([]);

      // Set up geocoding results properly - the job handler uses getGeocodingResults(job)
      // which looks at job.geocodingResults and returns a GeocodingResultsMap (object)
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
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = { id: "dataset-456" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Import file not found

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty batch gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 0 } },
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = { id: "dataset-456" };
      const mockImportFile = { id: "file-789", filename: "empty.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Mock empty file
      mocks.readBatchFromFile.mockReturnValueOnce([]);
      mocks.getGeocodingResults.mockReturnValue(new Map());

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({ output: { completed: true } });

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
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: false },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify age is still string (not transformed)
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
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
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
          transformations: expect.arrayContaining([
            expect.objectContaining({
              path: "age",
              oldValue: "25",
              newValue: 25,
            }),
          ]),
        }),
      });
    });

    it("should handle empty transformations array", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        typeTransformations: [],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
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
        data: expect.objectContaining({
          validationStatus: "pending",
          transformations: null,
        }),
      });
    });

    it("should apply multiple transformations to different fields", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
          },
          {
            fieldPath: "active",
            fromType: "string",
            toType: "boolean",
            transformStrategy: "parse",
            enabled: true,
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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
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
          data: expect.objectContaining({
            age: 25,
            active: true,
          }),
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
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: false, // Disabled
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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
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
        progress: {
          stages: {},
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        typeTransformations: [
          {
            fieldPath: "age",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
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

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.create.mockResolvedValue({ id: "event-1" });
      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Event should still be created with original value
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "events",
        data: expect.objectContaining({
          data: expect.objectContaining({ age: "not-a-number" }), // Original value preserved
          validationStatus: "pending", // Not transformed
          transformations: null,
        }),
      });
    });
  });
});
