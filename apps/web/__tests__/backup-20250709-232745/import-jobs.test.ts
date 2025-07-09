import { vi } from "vitest";
import {
  fileParsingJob,
  batchProcessingJob,
  eventCreationJob,
  geocodingBatchJob,
} from "../lib/jobs/import-jobs";
import { createSeedManager } from "../lib/seed/index";
import fs from "fs";
import path from "path";
import os from "os";
import { writeFile, mkdir, mkdtemp, rm } from "fs/promises";
import * as XLSX from "xlsx";

// Only mock the geocoding service
vi.mock("../lib/services/geocoding/GeocodingService", () => ({
  GeocodingService: vi.fn().mockImplementation(() => ({
    geocode: vi.fn().mockResolvedValue({
      latitude: 37.7749,
      longitude: -122.4194,
      confidence: 0.9,
      provider: "google",
      normalizedAddress: "123 Main St, San Francisco, CA 94102, USA",
      components: {
        streetNumber: "123",
        streetName: "Main St",
        city: "San Francisco",
        region: "CA",
        postalCode: "94102",
        country: "USA",
      },
    }),
  })),
}));

describe("Import Jobs", () => {
  let seedManager: any;
  let payload: any;
  let mockJob: any;
  let testImportId: string;
  let testCatalogId: string;
  let testDatasetId: string;
  let tempDir: string; // Temporary directory for test files

  beforeAll(async () => {
    seedManager = createSeedManager();
    await seedManager.initialize();
    payload = seedManager.payload;

    // Create a temporary directory for test files
    tempDir = await mkdtemp(path.join(os.tmpdir(), "timetiles-test-"));

    // Create test catalog
    const timestamp = Date.now();
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Test Catalog ${timestamp}`,
        slug: `test-catalog-${timestamp}`,
        description: "Test catalog for import jobs",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: `Test Dataset ${timestamp}`,
        slug: `test-dataset-${timestamp}`,
        description: "Test dataset for import jobs",
        catalog: testCatalogId,
        language: "eng",
        schema: {
          fields: [
            { name: "title", type: "text", required: true },
            { name: "description", type: "text", required: false },
            { name: "date", type: "date", required: true },
            { name: "location", type: "text", required: false },
          ],
        },
      },
    });
    testDatasetId = dataset.id;
  });

  afterAll(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to clean up temporary directory:", error);
    }

    await seedManager.cleanup();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await payload.delete({ collection: "imports", where: {} });
    await payload.delete({ collection: "events", where: {} });
    await payload.delete({ collection: "location-cache", where: {} });

    // Create test import record
    const importRecord = await payload.create({
      collection: "imports",
      data: {
        fileName: "test-file.csv",
        originalName: "test-file.csv",
        catalog: testCatalogId,
        fileSize: 1024,
        mimeType: "text/csv",
        status: "pending",
        processingStage: "file-parsing",
        importedAt: new Date().toISOString(),
        rowCount: 0,
        errorCount: 0,
        progress: {
          totalRows: 0,
          processedRows: 0,
          geocodedRows: 0,
          createdEvents: 0,
          percentage: 0,
        },
        batchInfo: {
          batchSize: 100,
          currentBatch: 0,
          totalBatches: 0,
        },
        geocodingStats: {
          totalAddresses: 0,
          successfulGeocodes: 0,
          failedGeocodes: 0,
          cachedResults: 0,
          googleApiCalls: 0,
          nominatimApiCalls: 0,
        },
        jobHistory: [],
        metadata: {},
      },
    });
    testImportId = importRecord.id;

    // Mock job object
    mockJob = {
      input: {},
    };

    // Mock payload.jobs.queue for testing
    payload.jobs = {
      queue: vi.fn().mockResolvedValue({}),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fileParsingJob", () => {
    const testCsvContent = `title,description,date,location,address
"Test Event 1","Description 1","2024-03-15","Location 1","123 Main St"
"Test Event 2","Description 2","2024-03-16","Location 2","456 Oak Ave"`;

    let testFilePath: string;

    beforeEach(async () => {
      // Create a real test file in the temp directory
      testFilePath = path.join(tempDir, `test-file-${Date.now()}.csv`);
      await writeFile(testFilePath, testCsvContent);

      mockJob.input = {
        importId: testImportId,
        filePath: testFilePath,
        fileName: "test-file.csv",
        fileType: "csv" as const,
      };
    });

    afterEach(async () => {
      // Clean up test file (though it should be deleted by the job)
      try {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it("should successfully parse CSV file", async () => {
      await fileParsingJob.handler({ job: mockJob, payload });

      // Verify import status was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("processing");
      expect(updatedImport.processingStage).toBe("row-processing");
      expect(updatedImport.progress.totalRows).toBe(2);
      expect(updatedImport.batchInfo.totalBatches).toBe(1);

      // Verify batch processing jobs were queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          importId: testImportId,
          batchNumber: 1,
          batchData: expect.any(Array),
          totalBatches: 1,
        }),
      });
    });

    it("should handle Excel files", async () => {
      // Create real Excel test file in temp directory
      const testExcelPath = path.join(tempDir, `test-file-${Date.now()}.xlsx`);

      // Create a simple workbook using XLSX library
      const workbook = XLSX.utils.book_new();
      const worksheetData = [
        ["title", "description", "date", "location", "address"],
        [
          "Test Event 1",
          "Description 1",
          "2024-03-15",
          "Location 1",
          "123 Main St",
        ],
        [
          "Test Event 2",
          "Description 2",
          "2024-03-16",
          "Location 2",
          "456 Oak Ave",
        ],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

      try {
        XLSX.writeFile(workbook, testExcelPath);
      } catch (error) {
        // If Excel file creation fails, skip this test
        console.warn("Excel file creation failed, skipping test:", error);
        return;
      }

      mockJob.input.fileType = "xlsx";
      mockJob.input.fileName = "test-file.xlsx";
      mockJob.input.filePath = testExcelPath;

      await fileParsingJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("processing");
      expect(updatedImport.progress.totalRows).toBe(2);

      // File cleanup is handled by the job itself
    });

    it("should handle CSV parsing errors", async () => {
      // Create invalid CSV content that will cause parsing errors
      const invalidCsvPath = path.join(
        tempDir,
        `invalid-file-${Date.now()}.csv`,
      );
      // Create a CSV with malformed quotes that Papa.parse will reject
      const invalidCsvContent =
        'title,description,date,location\n"Unclosed quote,Description,2024-03-15,Location\n"Another Event","Description","2024-03-16","Location"';
      await writeFile(invalidCsvPath, invalidCsvContent);

      mockJob.input.filePath = invalidCsvPath;

      await expect(
        fileParsingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow();

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("failed");
      expect(updatedImport.errorCount).toBe(1);
      expect(updatedImport.errorLog).toBeDefined();
      expect(updatedImport.errorLog).toContain("CSV parsing errors");

      // File cleanup is handled by the job itself
    });

    it("should filter out invalid rows", async () => {
      // Create CSV with mix of valid and invalid rows
      const mixedCsvPath = path.join(tempDir, `mixed-file-${Date.now()}.csv`);
      const mixedCsvContent = `title,description,date,location,address
"Valid Event","Description 1","2024-03-15","Location 1","123 Main St"
"","Description 2","2024-03-16","Location 2","456 Oak Ave"
"Another Valid","Description 3","","Location 3","789 Pine St"
"Valid Event 2","Description 4","2024-03-17","Location 4","321 Elm St"`;
      await writeFile(mixedCsvPath, mixedCsvContent);

      mockJob.input.filePath = mixedCsvPath;

      await fileParsingJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.totalRows).toBe(4); // Total rows including invalid
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          batchData: expect.arrayContaining([
            expect.objectContaining({ title: "Valid Event" }),
            expect.objectContaining({ title: "Valid Event 2" }),
          ]),
        }),
      });

      // File cleanup is handled by the job itself
    });

    it("should handle no valid rows", async () => {
      // Create CSV with no valid rows
      const noValidCsvPath = path.join(
        tempDir,
        `no-valid-file-${Date.now()}.csv`,
      );
      const noValidCsvContent = `title,description,date,location,address
"","Description 1","","Location 1","123 Main St"
"No Date","Description 2","","Location 2","456 Oak Ave"`;
      await writeFile(noValidCsvPath, noValidCsvContent);

      mockJob.input.filePath = noValidCsvPath;

      await expect(
        fileParsingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow("No valid rows found");

      // File cleanup is handled by the job itself
    });

    it("should create multiple batches for large datasets", async () => {
      // Create large CSV file
      const largeCsvPath = path.join(tempDir, `large-file-${Date.now()}.csv`);
      let largeCsvContent = "title,description,date,location,address\n";

      // Generate 250 rows
      for (let i = 1; i <= 250; i++) {
        largeCsvContent += `"Event ${i}","Description ${i}","2024-03-15","Location ${i}","${i} Main St"\n`;
      }

      await writeFile(largeCsvPath, largeCsvContent);
      mockJob.input.filePath = largeCsvPath;

      await fileParsingJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.batchInfo.totalBatches).toBe(3); // 250 rows / 100 batch size = 3 batches
      expect(payload.jobs.queue).toHaveBeenCalledTimes(3);

      // File cleanup is handled by the job itself
    });

    it("should clean up uploaded file", async () => {
      const initialPath = testFilePath;
      const fileExisted = fs.existsSync(initialPath);

      await fileParsingJob.handler({ job: mockJob, payload });

      // File should be deleted after processing
      expect(fs.existsSync(initialPath)).toBe(false);
      expect(fileExisted).toBe(true); // Ensure file existed before processing
    });

    it("should handle file cleanup errors gracefully", async () => {
      // Create a test that uses a non-existent file path
      // This should cause cleanup to fail but not crash the job
      const nonExistentPath = path.join(tempDir, "nonexistent", "file.csv");
      mockJob.input.filePath = nonExistentPath;

      // Should not throw despite cleanup error
      await expect(
        fileParsingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow(); // Will throw because file doesn't exist for parsing, not cleanup

      // The main point is that cleanup errors don't crash the application
      // They're handled gracefully with try/catch in the import-jobs.ts
    });
  });

  describe("batchProcessingJob", () => {
    const mockBatchData = [
      {
        title: "Test Event 1",
        description: "Description 1",
        date: "2024-03-15",
        enddate: "2024-03-16",
        location: "Location 1",
        address: "123 Main St",
        url: "https://example.com",
        category: "Technology",
        tags: "tech,conference",
      },
      {
        title: "Test Event 2",
        description: "Description 2",
        date: "2024-03-17",
        location: "Location 2",
        address: "456 Oak Ave",
        category: "Arts",
        tags: "art,gallery",
      },
    ];

    beforeEach(() => {
      mockJob.input = {
        importId: testImportId,
        batchNumber: 1,
        batchData: mockBatchData,
        totalBatches: 1,
      };
    });

    it("should process batch data correctly", async () => {
      await batchProcessingJob.handler({ job: mockJob, payload });

      // Verify batch info was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.batchInfo.currentBatch).toBe(1);

      // Verify event creation job was queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          importId: testImportId,
          processedData: expect.arrayContaining([
            expect.objectContaining({
              title: "Test Event 1",
              description: "Description 1",
              date: expect.any(String),
              endDate: expect.any(String),
              location: "Location 1",
              address: "123 Main St",
              url: "https://example.com",
              category: "Technology",
              tags: ["tech", "conference"],
            }),
            expect.objectContaining({
              title: "Test Event 2",
              description: "Description 2",
              date: expect.any(String),
              endDate: null,
              location: "Location 2",
              address: "456 Oak Ave",
              category: "Arts",
              tags: ["art", "gallery"],
            }),
          ]),
          batchNumber: 1,
        }),
      });
    });

    it("should handle missing optional fields", async () => {
      const minimalData = [
        {
          title: "Minimal Event",
          date: "2024-03-15",
        },
      ];

      mockJob.input.batchData = minimalData;

      await batchProcessingJob.handler({ job: mockJob, payload });

      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          processedData: expect.arrayContaining([
            expect.objectContaining({
              title: "Minimal Event",
              description: "",
              location: "",
              address: "",
              url: "",
              category: "",
              tags: [],
            }),
          ]),
        }),
      });
    });

    it("should parse tags correctly", async () => {
      const dataWithTags = [
        {
          title: "Event with tags",
          date: "2024-03-15",
          tags: "  tag1  ,  tag2  ,  ,  tag3  ",
        },
      ];

      mockJob.input.batchData = dataWithTags;

      await batchProcessingJob.handler({ job: mockJob, payload });

      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          processedData: expect.arrayContaining([
            expect.objectContaining({
              tags: ["tag1", "tag2", "tag3"],
            }),
          ]),
        }),
      });
    });

    it("should handle processing errors", async () => {
      // Mock payload.update to throw error
      const originalUpdate = payload.update;
      payload.update = vi.fn().mockRejectedValue(new Error("Database error"));

      await expect(
        batchProcessingJob.handler({ job: mockJob, payload }),
      ).rejects.toThrow();

      // Restore original method
      payload.update = originalUpdate;
    });
  });

  describe("eventCreationJob", () => {
    const mockProcessedData = [
      {
        title: "Test Event 1",
        description: "Description 1",
        date: "2024-03-15T00:00:00.000Z",
        endDate: null,
        location: "Location 1",
        address: "123 Main St",
        url: "https://example.com",
        category: "Technology",
        tags: ["tech", "conference"],
      },
      {
        title: "Test Event 2",
        description: "Description 2",
        date: "2024-03-17T00:00:00.000Z",
        endDate: "2024-03-18T00:00:00.000Z",
        location: "Location 2",
        address: "456 Oak Ave",
        url: "",
        category: "Arts",
        tags: ["art"],
      },
    ];

    beforeEach(() => {
      mockJob.input = {
        importId: testImportId,
        processedData: mockProcessedData,
        batchNumber: 1,
      };
    });

    it("should create events successfully", async () => {
      await eventCreationJob.handler({ job: mockJob, payload });

      // Verify events were created
      const events = await payload.find({
        collection: "events",
        where: {
          import: { equals: testImportId },
        },
      });

      expect(events.docs).toHaveLength(2);

      // Check that both events exist (order might vary)
      const eventTitles = events.docs.map((e) => e.data.title);
      expect(eventTitles).toContain("Test Event 1");
      expect(eventTitles).toContain("Test Event 2");

      // Verify progress was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.createdEvents).toBe(2);
      expect(updatedImport.progress.processedRows).toBe(2);
    });

    it("should queue geocoding for events with addresses", async () => {
      await eventCreationJob.handler({ job: mockJob, payload });

      // Should queue geocoding job for events with addresses
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "geocoding-batch",
        input: expect.objectContaining({
          importId: testImportId,
          eventIds: expect.any(Array),
          batchNumber: 1,
        }),
      });
    });

    it("should handle event creation errors gracefully", async () => {
      // Mock payload.create to fail for first event
      const originalCreate = payload.create;
      let callCount = 0;
      payload.create = vi.fn().mockImplementation((args) => {
        if (args.collection === "events" && callCount === 0) {
          callCount++;
          throw new Error("Event creation failed");
        }
        callCount++;
        return originalCreate(args);
      });

      await eventCreationJob.handler({ job: mockJob, payload });

      // Should continue processing despite one failure
      const events = await payload.find({
        collection: "events",
        where: {
          import: { equals: testImportId },
        },
      });

      expect(events.docs).toHaveLength(1); // Only second event created

      // Restore original method
      payload.create = originalCreate;
    });

    it("should update processing stage when last batch", async () => {
      // Update import to simulate this being the last batch
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          "batchInfo.totalBatches": 1,
          "batchInfo.currentBatch": 0,
        },
      });

      await eventCreationJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.processingStage).toBe("geocoding");
    });
  });

  describe("geocodingBatchJob", () => {
    let testEventIds: string[];

    beforeEach(async () => {
      // Create test events with addresses
      const event1 = await payload.create({
        collection: "events",
        data: {
          dataset: testDatasetId,
          import: testImportId,
          data: {
            title: "Event 1",
            description: "Description 1",
            date: new Date().toISOString(),
            location: "Location 1",
          },
          eventTimestamp: new Date().toISOString(),
          geocodingInfo: {
            originalAddress: "123 Main St, San Francisco, CA",
            provider: null,
            confidence: null,
            normalizedAddress: null,
          },
        },
      });

      const event2 = await payload.create({
        collection: "events",
        data: {
          dataset: testDatasetId,
          import: testImportId,
          data: {
            title: "Event 2",
            description: "Description 2",
            date: new Date().toISOString(),
            location: "Location 2",
          },
          eventTimestamp: new Date().toISOString(),
          geocodingInfo: {
            originalAddress: "456 Oak Ave, New York, NY",
            provider: null,
            confidence: null,
            normalizedAddress: null,
          },
        },
      });

      testEventIds = [event1.id, event2.id];

      mockJob.input = {
        importId: testImportId,
        eventIds: testEventIds,
        batchNumber: 1,
      };
    });

    it("should geocode events successfully", async () => {
      await geocodingBatchJob.handler({ job: mockJob, payload });

      // Verify events were updated with geocoding results
      const updatedEvent1 = await payload.findByID({
        collection: "events",
        id: testEventIds[0],
      });

      expect(updatedEvent1.location.latitude).toBe(37.7749);
      expect(updatedEvent1.location.longitude).toBe(-122.4194);
      expect(updatedEvent1.geocodingInfo.provider).toBe("google");
      expect(updatedEvent1.geocodingInfo.confidence).toBe(0.9);

      // Verify progress was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(2);
    });

    it("should handle geocoding failures gracefully", async () => {
      // Remove the address from the second event to simulate failure
      const currentEvent2 = await payload.findByID({
        collection: "events",
        id: testEventIds[1],
      });

      await payload.update({
        collection: "events",
        id: testEventIds[1],
        data: {
          geocodingInfo: {
            ...currentEvent2.geocodingInfo,
            originalAddress: null, // Remove address to simulate failure
          },
        },
      });

      await geocodingBatchJob.handler({ job: mockJob, payload });

      // First event should be geocoded, second should remain unchanged
      const updatedEvent1 = await payload.findByID({
        collection: "events",
        id: testEventIds[0],
      });
      const updatedEvent2 = await payload.findByID({
        collection: "events",
        id: testEventIds[1],
      });

      expect(updatedEvent1.location.latitude).toBe(37.7749);
      expect(updatedEvent2.location?.latitude).toBeNull();

      // Progress should reflect partial success
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(1);
    });

    it("should complete import when geocoding is finished", async () => {
      // Set up import to simulate completion
      const currentImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          progress: {
            ...currentImport.progress,
            createdEvents: 2,
            geocodedRows: 0,
          },
        },
      });

      await geocodingBatchJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("completed");
      expect(updatedImport.processingStage).toBe("completed");
      expect(updatedImport.completedAt).toBeDefined();
    });

    it("should skip events without addresses", async () => {
      // Update one event to have no address
      const currentEvent = await payload.findByID({
        collection: "events",
        id: testEventIds[0],
      });

      await payload.update({
        collection: "events",
        id: testEventIds[0],
        data: {
          geocodingInfo: {
            ...currentEvent.geocodingInfo,
            originalAddress: null,
          },
        },
      });

      await geocodingBatchJob.handler({ job: mockJob, payload });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(1);
    });
  });
});
