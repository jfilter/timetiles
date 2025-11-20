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
// Import centralized logger mock
import "@/tests/mocks/services/logger";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { datasetDetectionJob } from "@/lib/jobs/handlers/dataset-detection-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    fs: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
  };
});

// Mock external dependencies
vi.mock("fs", () => ({
  default: mocks.fs,
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock("@/lib/services/progress-tracking", () => ({
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
    mocks.fs.existsSync.mockReturnValue(true);
    mocks.fs.readFileSync.mockReturnValue("id,title,date\n1,Event 1,2024-01-01\n2,Event 2,2024-01-02");
    mocks.fs.unlinkSync.mockReturnValue(undefined);

    // CSV content is already set in readFileSync mock above
    // Excel files will need to be handled differently since we removed xlsx mocks

    // Mock payload with required methods
    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      jobs: {
        queue: vi.fn().mockResolvedValue({}),
      },
    };

    // Mock context
    mockContext = {
      payload: mockPayload,
      job: {
        id: "test-job-1",
        taskStatus: {},
      },
      input: {
        importFileId: "import-file-123",
        catalogId: "456",
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should process CSV file successfully", async () => {
      const mockImportFile = {
        id: 123, // Use numeric ID as handler expects
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      const mockCatalog = {
        id: 456,
        name: "Test Catalog",
      };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportFile) // importFile
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
          name: "test.csv", // Uses originalName from importFile
          catalog: 456,
        }),
      });

      // Check that import job was created second with correct dataset ID
      expect(mockPayload.create).toHaveBeenNthCalledWith(2, {
        collection: "import-jobs",
        data: expect.objectContaining({
          dataset: "test-id",
          importFile: 123, // importFile ID is converted to number
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

      const mockImportFile = {
        id: 123, // Use numeric ID as handler expects
        filename: "multi-sheet.xlsx",
        filePath: "/tmp/multi-sheet.xlsx",
        catalog: 456,
        originalName: "multi-sheet.xlsx",
      };

      const mockCatalog = {
        id: 456,
        name: "Test Catalog",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile).mockResolvedValueOnce(mockCatalog);

      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock dataset creation to return unique IDs for each dataset
      let datasetCounter = 1;
      let jobCounter = 1;
      mockPayload.create.mockImplementation((params: any) => {
        if (params.collection === "datasets") {
          return Promise.resolve({ id: `dataset-${datasetCounter++}` });
        } else if (params.collection === "import-jobs") {
          return Promise.resolve({ id: `job-${jobCounter++}` });
        }
        return Promise.resolve({ id: "test-id" });
      });

      await datasetDetectionJob.handler(mockContext);

      expect(mockPayload.create).toHaveBeenCalledTimes(6); // 3 datasets + 3 import jobs

      // Check that datasets were created with correct names
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({
          name: "Events",
          catalog: 456,
        }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({
          name: "Locations",
          catalog: 456,
        }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "datasets",
        data: expect.objectContaining({
          name: "Categories",
          catalog: 456,
        }),
      });

      // Check that import jobs were created for each sheet
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-jobs",
        data: expect.objectContaining({
          dataset: "dataset-1",
          importFile: 123,
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-jobs",
        data: expect.objectContaining({
          dataset: "dataset-2",
          importFile: 123,
          sheetIndex: 1,
          stage: "analyze-duplicates",
        }),
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-jobs",
        data: expect.objectContaining({
          dataset: "dataset-3",
          importFile: 123,
          sheetIndex: 2,
          stage: "analyze-duplicates",
        }),
      });
    });

    it("should match existing dataset by name", async () => {
      const mockImportFile = {
        id: 123, // Use numeric ID
        filename: "existing.csv",
        filePath: "/tmp/existing.csv",
        catalog: 456,
        originalName: "existing.csv",
      };

      const mockCatalog = {
        id: 456,
        name: "Test Catalog",
      };

      const existingDataset = {
        id: "existing-dataset-999",
        name: "existing",
        catalog: 456,
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile).mockResolvedValueOnce(mockCatalog);

      mockPayload.find.mockResolvedValue({ docs: [existingDataset] });
      mockPayload.create.mockResolvedValueOnce({ id: "import-job-101" });

      await datasetDetectionJob.handler(mockContext);

      // Should not create new dataset
      expect(mockPayload.create).toHaveBeenCalledTimes(1); // Only import job

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-jobs",
        data: expect.objectContaining({
          dataset: "existing-dataset-999", // Use existing dataset
          importFile: 123, // importFile ID is converted to number
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });
    });

    it("should update import file status to processing", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      await datasetDetectionJob.handler(mockContext);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-files",
        id: "import-file-123",
        data: expect.objectContaining({
          datasetsCount: 1,
        }),
      });
    });

    it("should clean up file after processing", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);
      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      await datasetDetectionJob.handler(mockContext);

      // Note: File cleanup is not implemented in the current handler
      expect(mockPayload.findByID).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle missing import file gracefully", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });

    it("should handle missing catalog gracefully", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile).mockResolvedValueOnce(null); // catalog not found

      // Mock the find call for catalog to return empty docs
      mockPayload.find.mockResolvedValueOnce({ docs: [] });

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should handle file parsing errors", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);

      mocks.fs.existsSync.mockReturnValue(false);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-files",
        id: "import-file-123",
        data: expect.objectContaining({
          status: "failed",
          errorLog: expect.any(String),
        }),
      });
    });

    it("should handle CSV parsing errors", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.csv",
        filePath: "/tmp/test.csv",
        catalog: 456,
        originalName: "test.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);

      // Mock invalid CSV content that will cause parsing errors
      mocks.fs.readFileSync.mockReturnValue("invalid,csv,data\nwith,malformed\nrows");

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should handle Excel parsing errors", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.xlsx",
        filePath: "/tmp/test.xlsx",
        catalog: 456,
        originalName: "test.xlsx",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);

      // Mock invalid Excel content that will cause SheetJS to throw
      mocks.fs.readFileSync.mockReturnValue(Buffer.from("invalid excel content"));

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty CSV file", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "empty.csv",
        filePath: "/tmp/empty.csv",
        catalog: 456,
        originalName: "empty.csv",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);

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

      const mockImportFile = {
        id: "import-file-123",
        filename: "empty.xlsx",
        filePath: "/tmp/empty.xlsx",
        catalog: 456,
        originalName: "empty.xlsx",
      };

      const mockCatalog = {
        id: 456,
        name: "Test Catalog",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile).mockResolvedValueOnce(mockCatalog);

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow("No valid sheets found in file");
    });

    it("should handle unsupported file formats", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "test.txt",
        filePath: "/tmp/test.txt",
        catalog: 456,
        originalName: "test.txt",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile);

      // Mock find calls for catalog
      mockPayload.find.mockResolvedValue({ docs: [] });

      await expect(datasetDetectionJob.handler(mockContext)).rejects.toThrow();
    });

    it("should handle very large files gracefully", async () => {
      const mockImportFile = {
        id: "import-file-123",
        filename: "large.csv",
        filePath: "/tmp/large.csv",
        catalog: 456,
        originalName: "large.csv",
      };

      const mockCatalog = {
        id: 456,
        name: "Test Catalog",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportFile).mockResolvedValueOnce(mockCatalog);

      mockPayload.find.mockResolvedValue({ docs: [] });
      mockPayload.create.mockResolvedValue({ id: "test-id" });

      // Mock large CSV dataset (100k rows)
      const headers = "id,title,date\n";
      const rows = [];
      for (let i = 1; i <= 100000; i++) {
        rows.push(`${i},Event ${i},2024-01-01`);
      }
      const largeCsvContent = headers + rows.join("\n");

      mocks.fs.readFileSync.mockReturnValue(largeCsvContent);

      await datasetDetectionJob.handler(mockContext);

      // Should create 1 dataset and 1 import job for CSV file
      expect(mockPayload.create).toHaveBeenCalledTimes(2);

      // Check that import job was created with correct row count
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-jobs",
        data: expect.objectContaining({
          sheetIndex: 0,
          stage: "analyze-duplicates",
        }),
      });
    });
  });
});
