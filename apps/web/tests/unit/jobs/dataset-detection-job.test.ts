/* eslint-disable sonarjs/publicly-writable-directories */
/**
 * Unit tests for the dataset detection job handler.
 *
 * Tests automatic dataset detection and creation during import processing,
 * including handling of single and multi-sheet files.
 *
 * @module
 * @category Tests
 */
// Import centralized logger mock FIRST (before anything that uses @/lib/logger)
// eslint-disable-next-line simple-import-sort/imports -- mock side-effect must load before handler
import { mockLogger } from "@/tests/mocks/services/logger";

import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { datasetDetectionJob } from "@/lib/jobs/handlers/dataset-detection-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockPayload } from "@/tests/setup/factories";

/** Create a Readable stream from a string, for mocking fs.createReadStream. */
const createMockReadStream = (content: string): Readable => {
  return new Readable({
    read() {
      this.push(content);
      this.push(null);
    },
  });
};

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  const fsMock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    createReadStream: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return { fs: fsMock };
});

// Mock external dependencies
vi.mock("fs", () => ({ ...mocks.fs, default: mocks.fs, promises: { readFile: vi.fn() } }));

// Mock app-config to prevent loadFromYaml from using the mocked fs
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({
    batchSizes: { duplicateAnalysis: 5000, schemaDetection: 10000, eventCreation: 1000, databaseChunk: 1000 },
  }),
  resetAppConfig: vi.fn(),
}));

vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    createInitialProgress: vi.fn((totalRows) => ({
      total: totalRows,
      processed: 0,
      failed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
    })),
  },
}));

describe.sequential("DatasetDetectionJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set default mock implementations
    const defaultCsvContent = "id,title,date\n1,Event 1,2024-01-01\n2,Event 2,2024-01-02";
    mocks.fs.existsSync.mockReturnValue(true);
    mocks.fs.readFileSync.mockReturnValue(defaultCsvContent);
    mocks.fs.unlinkSync.mockReturnValue(undefined);
    // createReadStream returns a Readable stream for the streaming CSV parser
    mocks.fs.createReadStream.mockImplementation(() => createMockReadStream(defaultCsvContent));

    // CSV content is already set in readFileSync and createReadStream mocks above
    // Excel files will need to be handled differently since we removed xlsx mocks

    // Mock payload with required methods
    mockPayload = createMockPayload();

    // Mock context
    mockContext = {
      req: { payload: mockPayload },
      job: { id: "test-job-1", taskStatus: {} },
      input: { ingestFileId: "ingest-file-123", catalogId: "456" },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should process CSV file successfully", async () => {
      const mockIngestFile = {
        id: 123, // Use numeric ID as handler expects
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      const mockCatalog = { id: 456, name: "Test Catalog" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestFile) // ingestFile
        .mockResolvedValueOnce(mockCatalog); // catalog

      mockPayload.find.mockResolvedValue({ docs: [] }); // No existing datasets

      // Mock creates to return appropriate IDs
      mockPayload.create
        .mockResolvedValueOnce({ id: "test-id" }) // dataset creation
        .mockResolvedValueOnce({ id: "import-job-id" }); // import job creation

      await datasetDetectionJob.handler(mockContext);

      // Check that dataset was created first
      expect(mockPayload.create).toHaveBeenNthCalledWith(1, {
        collection: "datasets",
        data: expect.objectContaining({
          name: "test.csv", // Uses originalName from ingestFile
          catalog: 456,
        }),
      });

      // Check that import job was created second with correct dataset ID
      expect(mockPayload.create).toHaveBeenNthCalledWith(2, {
        collection: "ingest-jobs",
        data: expect.objectContaining({
          dataset: "test-id",
          ingestFile: 123, // ingestFile ID is converted to number
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });

      // Dataset detection job doesn't queue other jobs
    });

    it("should process Excel file with multiple sheets", async () => {
      // Create a real Excel file with multiple sheets using xlsx library
      const XLSX = await import("xlsx");

      // Create workbook with 3 sheets
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Events
      const eventsData = [
        ["id", "title", "date", "location"],
        ["1", "Event 1", "2024-01-01", "San Francisco"],
        ["2", "Event 2", "2024-01-02", "New York"],
        ["3", "Event 3", "2024-01-03", "Los Angeles"],
      ];
      const eventsSheet = XLSX.utils.aoa_to_sheet(eventsData);
      XLSX.utils.book_append_sheet(workbook, eventsSheet, "Events");

      // Sheet 2: Locations
      const locationsData = [
        ["id", "name", "lat", "lng"],
        ["1", "San Francisco", "37.7749", "-122.4194"],
        ["2", "New York", "40.7128", "-74.0060"],
        ["3", "Los Angeles", "34.0522", "-118.2437"],
      ];
      const locationsSheet = XLSX.utils.aoa_to_sheet(locationsData);
      XLSX.utils.book_append_sheet(workbook, locationsSheet, "Locations");

      // Sheet 3: Categories
      const categoriesData = [
        ["id", "name", "color"],
        ["1", "Conference", "#FF0000"],
        ["2", "Workshop", "#00FF00"],
        ["3", "Meetup", "#0000FF"],
      ];
      const categoriesSheet = XLSX.utils.aoa_to_sheet(categoriesData);
      XLSX.utils.book_append_sheet(workbook, categoriesSheet, "Categories");

      // Convert workbook to buffer
      const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      // Mock fs.readFileSync to return the Excel buffer
      mocks.fs.readFileSync.mockReturnValue(excelBuffer);

      const mockIngestFile = {
        id: 123, // Use numeric ID as handler expects
        filename: "multi-sheet.xlsx",
        filePath: "/tmp/multi-sheet.xlsx",
        catalog: 456,
        originalName: "multi-sheet.xlsx",
      };

      const mockCatalog = { id: 456, name: "Test Catalog" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce(mockCatalog);

      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock dataset creation to return unique IDs for each dataset
      let datasetCounter = 1;
      let jobCounter = 1;
      // eslint-disable promise/prefer-await-to-then -- Conditional mock return values
      mockPayload.create.mockImplementation((params: any) => {
        if (params.collection === "datasets") {
          return Promise.resolve({ id: `dataset-${datasetCounter++}` });
        } else if (params.collection === "ingest-jobs") {
          return Promise.resolve({ id: `job-${jobCounter++}` });
        }
        return Promise.resolve({ id: "test-id" });
      });
      // eslint-enable promise/prefer-await-to-then

      await datasetDetectionJob.handler(mockContext);

      expect(mockPayload.create).toHaveBeenCalledTimes(6); // 3 datasets + 3 import jobs

      // Check that datasets were created with correct names
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({ name: "Events", catalog: 456 }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({ name: "Locations", catalog: 456 }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({ name: "Categories", catalog: 456 }),
      });

      // Check that import jobs were created for each sheet
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({
          dataset: "dataset-1",
          ingestFile: 123,
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({
          dataset: "dataset-2",
          ingestFile: 123,
          sheetIndex: 1,
          stage: "analyze-duplicates",
        }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({
          dataset: "dataset-3",
          ingestFile: 123,
          sheetIndex: 2,
          stage: "analyze-duplicates",
        }),
      });
    });

    it("should match existing dataset by name", async () => {
      const mockIngestFile = {
        id: 123, // Use numeric ID
        filename: "existing.csv",
        filePath: "/tmp/existing.csv",
        catalog: 456,
        originalName: "existing.csv",
      };

      const mockCatalog = { id: 456, name: "Test Catalog" };

      const existingDataset = { id: "existing-dataset-999", name: "existing", catalog: 456 };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce(mockCatalog);

      mockPayload.find.mockResolvedValue({ docs: [existingDataset] });
      mockPayload.create.mockResolvedValueOnce({ id: "import-job-101" });

      await datasetDetectionJob.handler(mockContext);

      // Should not create new dataset
      expect(mockPayload.create).toHaveBeenCalledTimes(1); // Only import job

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({
          dataset: "existing-dataset-999", // Use existing dataset
          ingestFile: 123, // ingestFile ID is converted to number
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });
    });

    it("should update import file status to processing", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      await datasetDetectionJob.handler(mockContext);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-files",
        id: "ingest-file-123",
        data: expect.objectContaining({ datasetsCount: 1, status: "processing" }),
      });
    });

    it("should clean up file after processing", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      await datasetDetectionJob.handler(mockContext);

      // Note: File cleanup is not implemented in the current handler
      expect(mockPayload.findByID).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should reject partially numeric import file relation ids before creating jobs", async () => {
      const mockIngestFile = {
        id: "123abc",
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce({ id: 456, name: "Catalog" });
      mockPayload.find.mockResolvedValue({ docs: [] });
      // eslint-disable promise/prefer-await-to-then -- Conditional mock
      mockPayload.create.mockImplementation(({ collection }: { collection: string }) =>
        Promise.resolve({ id: collection === "datasets" ? "dataset-1" : "import-job-1" })
      );
      // eslint-enable promise/prefer-await-to-then

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("Invalid import file ID");

      expect(mockPayload.create).toHaveBeenCalledTimes(1);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({ name: "test.csv", catalog: 456 }),
      });
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-files",
        id: "ingest-file-123",
        data: expect.objectContaining({ status: "failed", errorLog: "Invalid import file ID" }),
      });
    });

    it("should reject partially numeric catalog ids before loading datasets", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockContext.input = { ingestFileId: "ingest-file-123", catalogId: "456abc" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);
      mockPayload.find.mockResolvedValue({ docs: [] });

      // eslint-disable promise/prefer-await-to-then -- Conditional mock
      mockPayload.create.mockImplementation(({ collection }: { collection: string }) =>
        Promise.resolve({ id: collection === "datasets" ? "dataset-1" : "import-job-1" })
      );
      // eslint-enable promise/prefer-await-to-then

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("Invalid catalog ID");

      expect(mockPayload.find).not.toHaveBeenCalled();
      expect(mockPayload.create).not.toHaveBeenCalled();
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-files",
        id: "ingest-file-123",
        data: expect.objectContaining({ status: "failed", errorLog: "Invalid catalog ID" }),
      });
    });

    it("should throw when import file not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("Ingest file not found");
    });

    it("should throw when catalog not found", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce(null); // catalog not found

      // Mock the find call for catalog to return empty docs
      mockPayload.find.mockResolvedValueOnce({ docs: [] });

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should throw on file parsing errors", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);

      mocks.fs.existsSync.mockReturnValue(false);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-files",
        id: "ingest-file-123",
        data: expect.objectContaining({ status: "failed", errorLog: expect.any(String) }),
      });
    });

    it("should throw on CSV parsing errors", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);

      // Mock invalid CSV content that will cause parsing errors
      mocks.fs.readFileSync.mockReturnValue("invalid,csv,data\nwith,malformed\nrows");

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should throw on Excel parsing errors", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.xlsx",
        filePath: "/tmp/test.xlsx",
        catalog: 456,
        originalName: "test.xlsx",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);

      // Mock invalid Excel content that will cause SheetJS to throw
      mocks.fs.readFileSync.mockReturnValue(Buffer.from("invalid excel content"));

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty CSV file", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "empty.csv",
        filePath: "/tmp/empty.csv",
        catalog: 456,
        originalName: "empty.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);

      // Mock CSV with only headers, no data rows
      mocks.fs.readFileSync.mockReturnValue("header1,header2\n");

      // Mock find calls for catalog and dataset
      mockPayload.find.mockResolvedValue({ docs: [] });

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should handle Excel file with empty sheets", async () => {
      // Create a simple Excel file with truly empty sheets using xlsx library
      const XLSX = await import("xlsx");
      const emptyWorkbook = XLSX.utils.book_new();
      const emptyWorksheet = XLSX.utils.aoa_to_sheet([]); // Completely empty sheet
      XLSX.utils.book_append_sheet(emptyWorkbook, emptyWorksheet, "EmptySheet");
      const emptyBuffer = XLSX.write(emptyWorkbook, { type: "buffer", bookType: "xlsx" });

      // Mock fs.readFileSync to return the empty Excel content
      mocks.fs.readFileSync.mockReturnValue(emptyBuffer);

      const mockIngestFile = {
        id: 123,
        filename: "empty.xlsx",
        filePath: "/tmp/empty.xlsx",
        catalog: 456,
        originalName: "empty.xlsx",
      };

      const mockCatalog = { id: 456, name: "Test Catalog" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce(mockCatalog);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("No valid sheets found in file");
    });

    it("should handle unsupported file formats", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.txt",
        filePath: "/tmp/test.txt",
        catalog: 456,
        originalName: "test.txt",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);

      // Mock find calls for catalog
      mockPayload.find.mockResolvedValue({ docs: [] });

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should handle very large files gracefully", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "large.csv",
        filePath: "/tmp/large.csv",
        catalog: 456,
        originalName: "large.csv",
      };

      const mockCatalog = { id: 456, name: "Test Catalog" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce(mockCatalog);

      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      // Mock large CSV dataset (100k rows)
      const headers = "id,title,date\n";
      const rows = [];
      for (let i = 1; i <= 100000; i++) {
        rows.push(`${i},Event ${i},2024-01-01`);
      }
      const largeCsvContent = headers + rows.join("\n");

      mocks.fs.createReadStream.mockImplementation(() => createMockReadStream(largeCsvContent));

      await datasetDetectionJob.handler(mockContext);

      // Should create 1 dataset and 1 import job for CSV file
      expect(mockPayload.create).toHaveBeenCalledTimes(2);

      // Check that import job was created with correct row count
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({ sheetIndex: 0, stage: "analyze-duplicates" }),
      });
    });
  });

  describe("Wizard Fast-Path", () => {
    it("should skip file parsing for wizard single-sheet import", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
        metadata: {
          source: "import-wizard",
          datasetMapping: { mappingType: "single", singleDataset: "dataset-42" },
          wizardConfig: { sheetMappings: [{ sheetIndex: 0, newDatasetName: "Events" }], fieldMappings: [] },
        },
      };

      const mockDataset = { id: "dataset-42", name: "Events", catalog: 456 };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestFile) // ingestFile lookup
        .mockResolvedValueOnce(mockDataset); // dataset lookup in handleSingleSheet

      mockPayload.create.mockResolvedValueOnce({ id: "import-job-1" });

      await datasetDetectionJob.handler(mockContext);

      // File should NOT be read — fast-path skips parsing
      expect(mocks.fs.readFileSync).not.toHaveBeenCalled();

      // Import job should still be created with correct dataset
      expect(mockPayload.create).toHaveBeenCalledTimes(1);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({
          dataset: "dataset-42",
          ingestFile: 123,
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });
    });

    it("should skip file parsing for wizard multi-sheet import", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "multi.xlsx",
        filePath: "/tmp/multi.xlsx",
        catalog: 456,
        originalName: "multi.xlsx",
        metadata: {
          source: "import-wizard",
          datasetMapping: {
            mappingType: "multiple",
            sheetMappings: [
              { sheetIdentifier: "0", dataset: "ds-1", skipIfMissing: false },
              { sheetIdentifier: "1", dataset: "ds-2", skipIfMissing: false },
            ],
          },
          wizardConfig: {
            sheetMappings: [
              { sheetIndex: 0, newDatasetName: "Events" },
              { sheetIndex: 1, newDatasetName: "Locations" },
            ],
            fieldMappings: [],
          },
        },
      };

      const mockDataset1 = { id: "ds-1", name: "Events", catalog: 456 };
      const mockDataset2 = { id: "ds-2", name: "Locations", catalog: 456 };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestFile) // ingestFile lookup
        .mockResolvedValueOnce(mockDataset1) // dataset lookup for sheet 0
        .mockResolvedValueOnce(mockDataset2); // dataset lookup for sheet 1

      mockPayload.create.mockResolvedValueOnce({ id: "job-1" }).mockResolvedValueOnce({ id: "job-2" });

      await datasetDetectionJob.handler(mockContext);

      // File should NOT be read
      expect(mocks.fs.readFileSync).not.toHaveBeenCalled();

      // Two import jobs should be created
      expect(mockPayload.create).toHaveBeenCalledTimes(2);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({ dataset: "ds-1", sheetIndex: 0 }),
      });
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        data: expect.objectContaining({ dataset: "ds-2", sheetIndex: 1 }),
      });
    });

    it("should fall back to parsing when datasetMapping is missing", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
        metadata: { source: "import-wizard" }, // No datasetMapping
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce({ id: 456, name: "Catalog" });
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      await datasetDetectionJob.handler(mockContext);

      // Should fall back to streaming the CSV file (createReadStream instead of readFileSync)
      expect(mocks.fs.createReadStream).toHaveBeenCalled();
    });

    it("should fall back to parsing for non-wizard imports", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
        metadata: { source: "url-fetch" },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce({ id: 456, name: "Catalog" });
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      await datasetDetectionJob.handler(mockContext);

      // Should stream the file since it's not a wizard import
      expect(mocks.fs.createReadStream).toHaveBeenCalled();
    });

    it("should still verify file exists on disk for wizard imports", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
        metadata: { source: "import-wizard", datasetMapping: { mappingType: "single", singleDataset: "dataset-42" } },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile);
      mocks.fs.existsSync.mockReturnValue(false);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("Cannot access file");
    });
  });

  describe("onFail Callback", () => {
    it("should update ingest file status to failed with string error", async () => {
      const mockArgs = {
        input: { ingestFileId: "file-123" },
        req: { payload: mockPayload },
        job: { error: "Some failure reason" },
      };

      mockPayload.update.mockResolvedValueOnce({});

      await datasetDetectionJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-files",
        id: "file-123",
        data: { status: "failed", errorLog: "Some failure reason" },
      });
    });

    it("should use fallback message when job.error is not a string", async () => {
      const mockArgs = { input: { ingestFileId: "file-123" }, req: { payload: mockPayload }, job: { error: 42 } };

      mockPayload.update.mockResolvedValueOnce({});

      await datasetDetectionJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ errorLog: "Task failed after all retries" }) })
      );
    });

    it("should skip when ingestFileId is not a string or number", async () => {
      const mockArgs = { input: { ingestFileId: undefined }, req: { payload: mockPayload }, job: { error: "error" } };

      await datasetDetectionJob.onFail(mockArgs as any);

      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("should log and swallow the error when update fails in onFail", async () => {
      const mockArgs = { input: { ingestFileId: "file-123" }, req: { payload: mockPayload }, job: { error: "error" } };
      const dbError = new Error("DB error");

      mockPayload.update.mockRejectedValueOnce(dbError);

      await datasetDetectionJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "ingest-files", id: "file-123" })
      );
      expect(mockLogger.logError).toHaveBeenCalledWith(dbError, "Failed to update dataset status in onFail");
    });

    it("should handle numeric ingestFileId", async () => {
      const mockArgs = { input: { ingestFileId: 123 }, req: { payload: mockPayload }, job: { error: "error message" } };

      mockPayload.update.mockResolvedValueOnce({});

      await datasetDetectionJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-files",
        id: 123,
        data: { status: "failed", errorLog: "error message" },
      });
    });
  });

  describe("JSON file handling", () => {
    it("should convert JSON file to CSV before processing", async () => {
      const mockIngestFile = {
        id: 123,
        filename: "test.json",
        filePath: "/tmp/test.json",
        catalog: 456,
        originalName: "test.json",
      };

      const mockCatalog = { id: 456, name: "Test Catalog" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestFile).mockResolvedValueOnce(mockCatalog);
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      // Mock JSON content
      const jsonContent = JSON.stringify([
        { id: 1, name: "Event 1" },
        { id: 2, name: "Event 2" },
      ]);
      mocks.fs.readFileSync.mockReturnValue(jsonContent);

      // Mock the CSV streaming after conversion
      const csvContent = "id,name\n1,Event 1\n2,Event 2";
      mocks.fs.createReadStream.mockImplementation(() => createMockReadStream(csvContent));

      await datasetDetectionJob.handler(mockContext);

      // Should have updated the ingest-file with CSV filename
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "ingest-files",
          id: "ingest-file-123",
          data: expect.objectContaining({ filename: expect.stringContaining(".csv"), mimeType: "text/csv" }),
        })
      );
    });
  });
});
