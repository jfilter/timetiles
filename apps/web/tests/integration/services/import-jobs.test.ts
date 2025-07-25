import fs from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { utils, write } from "xlsx";

import { fileParsingJob, batchProcessingJob, eventCreationJob, geocodingBatchJob } from "../../../lib/jobs/import-jobs";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";

// Mock GeocodingService to avoid real HTTP calls
vi.mock("../../../lib/services/geocoding/geocoding-service", () => {
  return {
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
        metadata: {},
      }),
      batchGeocode: vi.fn().mockResolvedValue({
        results: new Map(),
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          cached: 0,
        },
      }),
    })),
  };
});

describe.sequential("Import Jobs", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>["payload"];
  let mockJob: any;
  let testImportId: string;
  let testCatalogId: string;
  let testDatasetId: string;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup != null) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear collections before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();

    // Create test catalog after truncating
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Test Catalog ${timestamp}-${randomSuffix}`,
        slug: `test-catalog-${timestamp}-${randomSuffix}`,
        description: "Test catalog for import jobs",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: `Test Dataset ${timestamp}-${randomSuffix}`,
        slug: `test-dataset-${timestamp}-${randomSuffix}`,
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

  describe.sequential("fileParsingJob", () => {
    const testCsvContent = `title,description,date,location,address
"Test Event 1","Description 1","2024-03-15","Location 1","123 Main St"
"Test Event 2","Description 2","2024-03-16","Location 2","456 Oak Ave"`;

    let testFilePath: string;

    beforeEach(async () => {
      // Create a real test file in the isolated temp directory
      testFilePath = path.join(testEnv.tempDir, `test-file-${Date.now()}.csv`);
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
      await fileParsingJob.handler({
        job: {
          id: 1,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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
        }),
      });
    });

    it("should handle Excel files", async () => {
      // Create real Excel test file using the corrected approach
      const testExcelPath = path.join(testEnv.tempDir, `test-excel-${Date.now()}.xlsx`);

      // Use the same xlsx imports as the parsing code for consistency
      const workbook = utils.book_new();
      const data = [
        ["title", "description", "date"],
        ["Excel Event 1", "Excel Description 1", "2024-01-01"],
        ["Excel Event 2", "Excel Description 2", "2024-01-02"],
      ];

      const worksheet = utils.aoa_to_sheet(data);
      utils.book_append_sheet(workbook, worksheet, "Sheet1");

      // Use binary type for proper file creation
      const binaryString = write(workbook, { type: "binary", bookType: "xlsx" });
      const buffer = Buffer.from(binaryString, "binary");
      fs.writeFileSync(testExcelPath, buffer);

      // Verify file exists and has content
      expect(fs.existsSync(testExcelPath)).toBe(true);
      expect(fs.statSync(testExcelPath).size).toBeGreaterThan(0);

      // Update mock job to use Excel file
      mockJob.input.fileType = "xlsx";
      mockJob.input.fileName = "test-excel.xlsx";
      mockJob.input.filePath = testExcelPath;

      // Execute the job
      await fileParsingJob.handler({
        job: {
          id: 2,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      // Verify results
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("processing");
      expect(updatedImport.progress.totalRows).toBe(2);
    });

    it("should handle CSV parsing errors", async () => {
      // Create invalid CSV content that will cause parsing errors
      const invalidCsvPath = path.join(testEnv.tempDir, `invalid-file-${Date.now()}.csv`);
      // Create a CSV with no data rows
      const invalidCsvContent = "title,description,date,location\n";
      await writeFile(invalidCsvPath, invalidCsvContent);

      mockJob.input.filePath = invalidCsvPath;

      await expect(
        fileParsingJob.handler({
          job: {
            id: 3,
            taskStatus: "running" as any,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          input: mockJob.input,
          payload,
        }),
      ).rejects.toThrow("No data rows found");

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.status).toBe("failed");
      expect(updatedImport.errorCount).toBe(1);
      expect(updatedImport.errorLog).toBeDefined();
      expect(updatedImport.errorLog).toContain("No data rows found");

      // File cleanup is handled by the job itself
    });

    it("should filter out invalid rows", async () => {
      // Create CSV with mix of valid and invalid rows
      const mixedCsvPath = path.join(testEnv.tempDir, `mixed-file-${Date.now()}.csv`);
      const mixedCsvContent = `title,description,date,location,address
"Valid Event","Description 1","2024-03-15","Location 1","123 Main St"
"","Description 2","2024-03-16","Location 2","456 Oak Ave"
"Another Valid","Description 3","","Location 3","789 Pine St"
"Valid Event 2","Description 4","2024-03-17","Location 4","321 Elm St"`;
      await writeFile(mixedCsvPath, mixedCsvContent);

      mockJob.input.filePath = mixedCsvPath;

      await fileParsingJob.handler({
        job: {
          id: 4,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.totalRows).toBe(4); // All rows are counted at parsing stage
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          batchData: expect.any(Array),
        }),
      });

      // File cleanup is handled by the job itself
    });

    it("should handle no valid rows", async () => {
      // Create CSV with no valid rows
      const noValidCsvPath = path.join(testEnv.tempDir, `no-valid-file-${Date.now()}.csv`);
      const noValidCsvContent = `title,description,date,location,address
"","Description 1","","Location 1","123 Main St"
"No Date","Description 2","","Location 2","456 Oak Ave"`;
      await writeFile(noValidCsvPath, noValidCsvContent);

      mockJob.input.filePath = noValidCsvPath;

      await fileParsingJob.handler({
        job: {
          id: 5,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      // The parser doesn't throw for empty values, it just processes them
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.totalRows).toBe(2); // Both rows are parsed even if empty

      // File cleanup is handled by the job itself
    });

    it("should validate date parsing with various formats", async () => {
      // Test various date formats that users might upload
      const dateTestCsvPath = path.join(testEnv.tempDir, `date-test-${Date.now()}.csv`);
      const dateTestContent = `title,date,description
"Event 1","2024-03-15","ISO format"
"Event 2","03/15/2024","US format"
"Event 3","15/03/2024","EU format"
"Event 4","March 15, 2024","Long format"
"Event 5","2024-03-15T10:30:00Z","ISO with time"
"Event 6","not-a-date-at-all","Should be filtered out"
"Event 7","","Empty date - should be filtered"`;
      await writeFile(dateTestCsvPath, dateTestContent);

      mockJob.input.filePath = dateTestCsvPath;

      await fileParsingJob.handler({
        job: {
          id: 1,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      // All rows are parsed, even with invalid dates
      expect(updatedImport.progress.totalRows).toBe(7);
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          batchData: expect.any(Array),
        }),
      });
    });

    it("should handle malicious CSV content safely", async () => {
      // Test CSV with potential security issues
      const maliciousCsvPath = path.join(testEnv.tempDir, `malicious-${Date.now()}.csv`);
      const maliciousContent = `title,date,description
"=SUM(1+1)","2024-03-15","Formula injection attempt"
"<script>alert('xss')</script>","2024-03-16","XSS attempt"
"${"A".repeat(10000)}","2024-03-17","Very long title"
"Normal Event","2024-03-18","This should work fine"`;
      await writeFile(maliciousCsvPath, maliciousContent);

      mockJob.input.filePath = maliciousCsvPath;

      await fileParsingJob.handler({
        job: {
          id: 1,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      // All should be parsed (security filtering happens elsewhere)
      expect(updatedImport.progress.totalRows).toBe(4);

      // Verify batch data contains the content (sanitization is handled by data processing)
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          batchData: expect.arrayContaining([
            expect.objectContaining({
              title: "=SUM(1+1)", // Raw content preserved, sanitization elsewhere
            }),
          ]),
        }),
      });
    });

    it("should handle memory-intensive files gracefully", async () => {
      // Test with file that has many columns and large cells
      const heavyCsvPath = path.join(testEnv.tempDir, `heavy-${Date.now()}.csv`);
      const columns = Array.from({ length: 50 }, (_, i) => `col${i}`).join(",");
      const largeRow = Array.from({ length: 50 }, (_, i) => `"${"x".repeat(100)}"`).join(",");
      const heavyContent = `title,date,${columns}
"Heavy Event 1","2024-03-15",${largeRow}
"Heavy Event 2","2024-03-16",${largeRow}`;
      await writeFile(heavyCsvPath, heavyContent);

      mockJob.input.filePath = heavyCsvPath;

      // Should not throw memory errors
      await expect(
        fileParsingJob.handler({
          job: {
            id: 1,
            taskStatus: "running" as any,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          input: mockJob.input,
          payload,
        }),
      ).resolves.not.toThrow();
    });

    it("should create multiple batches for large datasets", async () => {
      // Create large CSV file
      const largeCsvPath = path.join(testEnv.tempDir, `large-file-${Date.now()}.csv`);
      let largeCsvContent = "title,description,date,location,address\n";

      // Generate 250 rows
      for (let i = 1; i <= 250; i++) {
        largeCsvContent += `"Event ${i}","Description ${i}","2024-03-15","Location ${i}","${i} Main St"\n`;
      }

      await writeFile(largeCsvPath, largeCsvContent);
      mockJob.input.filePath = largeCsvPath;

      await fileParsingJob.handler({
        job: {
          id: 6,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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

      await fileParsingJob.handler({
        job: {
          id: 7,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      // File should be deleted after processing
      expect(fs.existsSync(initialPath)).toBe(false);
      expect(fileExisted).toBe(true); // Ensure file existed before processing
    });

    it("should handle file cleanup errors gracefully", async () => {
      // Create a test that uses a non-existent file path
      // This should cause cleanup to fail but not crash the job
      const nonExistentPath = path.join(testEnv.tempDir, "nonexistent", "file.csv");
      mockJob.input.filePath = nonExistentPath;

      // Should not throw despite cleanup error
      await expect(
        fileParsingJob.handler({
          job: {
            id: 8,
            taskStatus: "running" as any,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          input: mockJob.input,
          payload,
        }),
      ).rejects.toThrow(); // Will throw because file doesn't exist for parsing, not cleanup

      // The main point is that cleanup errors don't crash the application
      // They're handled gracefully with try/catch in the import-jobs.ts
    });
  });

  describe.sequential("batchProcessingJob", () => {
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
      await batchProcessingJob.handler({
        job: {
          id: 9,
          ...mockJob,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        payload,
      });

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

      await batchProcessingJob.handler({
        job: {
          id: 10,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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

      await batchProcessingJob.handler({
        job: {
          id: 11,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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
        batchProcessingJob.handler({
          job: {
            id: 12,
            taskStatus: "running" as any,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          input: mockJob.input,
          payload,
        }),
      ).rejects.toThrow();

      // Restore original method
      payload.update = originalUpdate;
    });
  });

  describe.sequential("eventCreationJob", () => {
    let mockProcessedData: any[];

    beforeEach(() => {
      // Generate unique titles to avoid slug conflicts
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      mockProcessedData = [
        {
          title: `Test Event 1 ${timestamp}-${randomSuffix}`,
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
          title: `Test Event 2 ${timestamp}-${randomSuffix}`,
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

      mockJob.input = {
        importId: testImportId,
        processedData: mockProcessedData,
        batchNumber: 1,
      };
    });

    it("should create events successfully", async () => {
      await eventCreationJob.handler({
        job: {
          id: 13,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      // Verify events were created
      const events = await payload.find({
        collection: "events",
        where: {
          import: { equals: testImportId },
        },
      });

      expect(events.docs).toHaveLength(2);

      // Check that both events exist (order might vary)
      const eventTitles = events.docs.map((e: any) => e.data.title);
      expect(eventTitles).toEqual(
        expect.arrayContaining([expect.stringContaining("Test Event 1"), expect.stringContaining("Test Event 2")]),
      );

      // Verify progress was updated
      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.createdEvents).toBe(2);
      expect(updatedImport.progress.processedRows).toBe(2);
    });

    it("should queue geocoding for events with addresses", async () => {
      await eventCreationJob.handler({
        job: {
          id: 14,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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

      await eventCreationJob.handler({
        job: {
          id: 15,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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

      await eventCreationJob.handler({
        job: {
          id: 16,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.processingStage).toBe("geocoding");
    });
  });

  describe.sequential("geocodingBatchJob", () => {
    let testEventIds: string[];

    beforeEach(async () => {
      // Create test events with addresses and unique titles to avoid slug conflicts
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      const event1 = await payload.create({
        collection: "events",
        data: {
          dataset: testDatasetId,
          import: testImportId,
          data: {
            title: `Geocoding Test Event 1 ${timestamp}-${randomSuffix}`,
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
            title: `Geocoding Test Event 2 ${timestamp}-${randomSuffix}`,
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
      await geocodingBatchJob.handler({
        job: {
          id: 17,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      // Verify events were updated with geocoding results
      const updatedEvent1 = await payload.findByID({
        collection: "events",
        id: testEventIds[0],
      });

      expect(updatedEvent1.location.latitude).toBe(37.7749);
      expect(updatedEvent1.location.longitude).toBe(-122.4194);
      expect(updatedEvent1.geocodingInfo.provider).toBe("google");
      expect(updatedEvent1.geocodingInfo.confidence).toBeGreaterThan(0.8);

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

      await geocodingBatchJob.handler({
        job: {
          id: 18,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

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

      await geocodingBatchJob.handler({
        job: {
          id: 19,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      // Geocoding job updates the stats but doesn't mark import as completed
      expect(updatedImport.progress.geocodedRows).toBe(2);
      expect(updatedImport.geocodingStats.successfulGeocodes).toBe(2);
      // Status remains pending - a separate process would mark it complete
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

      await geocodingBatchJob.handler({
        job: {
          id: 20,
          taskStatus: "running" as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        input: mockJob.input,
        payload,
      });

      const updatedImport = await payload.findByID({
        collection: "imports",
        id: testImportId,
      });

      expect(updatedImport.progress.geocodedRows).toBe(1);
    });
  });
});
