import { createSeedManager } from "../lib/seed/index";
import { NextRequest } from "next/server";
import { POST as uploadHandler } from "../app/api/import/upload/route";
import { GET as progressHandler } from "../app/api/import/[importId]/progress/route";
import {
  fileParsingJob,
  batchProcessingJob,
  eventCreationJob,
  geocodingBatchJob,
} from "../lib/jobs/import-jobs";
import { GeocodingService } from "../lib/services/geocoding/GeocodingService";
import fs from "fs";
import path from "path";
import { jest } from "@jest/globals";

// Mock external dependencies
jest.mock("fs");
jest.mock("fs/promises");
jest.mock("papaparse");
jest.mock("xlsx");
jest.mock("uuid", () => ({ v4: jest.fn(() => "test-uuid-123") }));

// Mock rate limiting
jest.mock("../lib/services/RateLimitService", () => ({
  getRateLimitService: jest.fn(() => ({
    checkRateLimit: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetTime: Date.now() + 3600000,
      blocked: false,
    }),
    getRateLimitHeaders: jest.fn(() => ({})),
  })),
  getClientIdentifier: jest.fn(() => "127.0.0.1"),
  RATE_LIMITS: {
    FILE_UPLOAD: { limit: 5, windowMs: 3600000 },
    PROGRESS_CHECK: { limit: 100, windowMs: 3600000 },
  },
}));

// Mock geocoding service
jest.mock("../lib/services/geocoding/GeocodingService");

describe("Import System Integration Tests", () => {
  let seedManager: any;
  let payload: any;
  let testCatalogId: string;
  let testDatasetId: string;

  beforeAll(async () => {
    seedManager = createSeedManager();
    await seedManager.initialize();
    payload = seedManager.payload;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Integration Test Catalog",
        description: "Catalog for integration testing",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Integration Test Dataset",
        description: "Dataset for integration testing",
        catalog: testCatalogId,
      },
    });
    testDatasetId = dataset.id;
  });

  afterAll(async () => {
    await seedManager.cleanup();
  });

  beforeEach(async () => {
    // Clear all collections
    await payload.delete({ collection: "imports", where: {} });
    await payload.delete({ collection: "events", where: {} });
    await payload.delete({ collection: "location-cache", where: {} });

    // Mock payload.jobs.queue
    payload.jobs = {
      queue: jest.fn().mockResolvedValue({}),
    };

    // Mock file system operations
    const fsPromises = require("fs/promises");
    fsPromises.mkdir = jest.fn().mockResolvedValue(undefined);
    fsPromises.writeFile = jest.fn().mockResolvedValue(undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue("");
    (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

    // Mock Papa.parse
    const Papa = require("papaparse");
    Papa.parse = jest.fn().mockReturnValue({
      data: [],
      errors: [],
    });

    // Mock XLSX
    const XLSX = require("xlsx");
    XLSX.readFile = jest.fn().mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    XLSX.utils = {
      sheet_to_json: jest.fn().mockReturnValue([]),
    };
    XLSX.read = jest.fn().mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });

    // Mock GeocodingService
    (GeocodingService as jest.Mock).mockImplementation(() => ({
      geocode: jest.fn().mockResolvedValue({
        latitude: 37.7749,
        longitude: -122.4194,
        confidence: 0.9,
        provider: "google",
        normalizedAddress: "123 Main St, San Francisco, CA 94102, USA",
      }),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Complete Import Workflow", () => {
    const sampleCsvData = [
      {
        title: "Tech Conference 2024",
        description: "Annual technology conference",
        date: "2024-03-15",
        enddate: "2024-03-17",
        location: "Convention Center",
        address: "123 Main St, San Francisco, CA",
        url: "https://techconf2024.com",
        category: "Technology",
        tags: "tech,conference,networking",
      },
      {
        title: "Art Gallery Opening",
        description: "Contemporary art exhibition",
        date: "2024-03-20",
        enddate: "",
        location: "Modern Art Gallery",
        address: "456 Art Ave, New York, NY",
        url: "https://modernart.gallery",
        category: "Arts",
        tags: "art,gallery,exhibition",
      },
      {
        title: "Music Festival",
        description: "Three-day outdoor music festival",
        date: "2024-04-01",
        enddate: "2024-04-03",
        location: "Central Park",
        address: "Central Park, New York, NY",
        url: "https://musicfest.com",
        category: "Music",
        tags: "music,festival,outdoor",
      },
    ];

    it("should complete full CSV import workflow", async () => {
      // Step 1: Upload file
      const csvContent = sampleCsvData
        .map((row) =>
          Object.values(row)
            .map((val) => `"${val}"`)
            .join(","),
        )
        .join("\n");

      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: sampleCsvData,
        errors: [],
      });

      const file = new File([csvContent], "test-events.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);
      formData.append("datasetId", testDatasetId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();

      expect(uploadResponse.status).toBe(200);
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.importId).toBeDefined();

      const importId = uploadResult.importId;

      // Verify import record was created
      let importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(importRecord.status).toBe("pending");
      expect(importRecord.processingStage).toBe("file-parsing");

      // Step 2: Process file parsing job
      const fileParsingJobInput = {
        importId,
        filePath: "/tmp/test-events.csv",
        fileName: "test-events.csv",
        fileType: "csv" as const,
      };

      await fileParsingJob.handler({
        job: { input: fileParsingJobInput },
        payload,
      });

      // Verify import was updated
      importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(importRecord.status).toBe("processing");
      expect(importRecord.processingStage).toBe("batch-processing");
      expect(importRecord.progress.totalRows).toBe(3);

      // Verify batch processing job was queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          importId,
          batchNumber: 1,
          batchData: expect.any(Array),
          totalBatches: 1,
        }),
      });

      // Step 3: Process batch processing job
      const batchProcessingJobInput = {
        importId,
        batchNumber: 1,
        batchData: sampleCsvData,
        totalBatches: 1,
      };

      await batchProcessingJob.handler({
        job: { input: batchProcessingJobInput },
        payload,
      });

      // Verify event creation job was queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "event-creation",
        input: expect.objectContaining({
          importId,
          processedData: expect.any(Array),
          batchNumber: 1,
        }),
      });

      // Step 4: Process event creation job
      const processedData = sampleCsvData.map((row) => ({
        title: row.title,
        description: row.description,
        date: new Date(row.date).toISOString(),
        endDate: row.enddate ? new Date(row.enddate).toISOString() : null,
        location: row.location,
        address: row.address,
        url: row.url,
        category: row.category,
        tags: row.tags.split(",").map((t) => t.trim()),
      }));

      const eventCreationJobInput = {
        importId,
        processedData,
        batchNumber: 1,
      };

      await eventCreationJob.handler({
        job: { input: eventCreationJobInput },
        payload,
      });

      // Verify events were created
      const events = await payload.find({
        collection: "events",
        where: {
          importId: { equals: importId },
        },
      });

      expect(events.docs).toHaveLength(3);
      expect(events.docs[0]).toMatchObject({
        title: "Tech Conference 2024",
        description: "Annual technology conference",
        location: "Convention Center",
        url: "https://techconf2024.com",
        category: "Technology",
        tags: ["tech", "conference", "networking"],
      });

      // Verify geocoding job was queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "geocoding-batch",
        input: expect.objectContaining({
          importId,
          eventIds: expect.any(Array),
          batchNumber: 1,
        }),
      });

      // Step 5: Process geocoding job
      const eventIds = events.docs.map((event) => event.id);
      const geocodingJobInput = {
        importId,
        eventIds,
        batchNumber: 1,
      };

      await geocodingBatchJob.handler({
        job: { input: geocodingJobInput },
        payload,
      });

      // Verify events were geocoded
      const geocodedEvents = await payload.find({
        collection: "events",
        where: {
          importId: { equals: importId },
        },
      });

      expect(geocodedEvents.docs[0].latitude).toBe(37.7749);
      expect(geocodedEvents.docs[0].longitude).toBe(-122.4194);
      expect(geocodedEvents.docs[0].geocoding.provider).toBe("google");

      // Verify import was completed
      const finalImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(finalImportRecord.status).toBe("completed");
      expect(finalImportRecord.processingStage).toBe("completed");
      expect(finalImportRecord.completedAt).toBeDefined();

      // Step 6: Check progress endpoint
      const progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      const progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      });
      const progressResult = await progressResponse.json();

      expect(progressResponse.status).toBe(200);
      expect(progressResult.status).toBe("completed");
      expect(progressResult.progress.percentage).toBe(100);
    });

    it("should handle Excel file import workflow", async () => {
      // Mock Excel parsing
      const XLSX = require("xlsx");
      XLSX.utils.sheet_to_json.mockReturnValue([
        ["title", "description", "date", "location", "address"],
        ...sampleCsvData.map((row) => [
          row.title,
          row.description,
          row.date,
          row.location,
          row.address,
        ]),
      ]);

      const file = new File(["mock excel content"], "test-events.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();

      expect(uploadResponse.status).toBe(200);
      expect(uploadResult.success).toBe(true);

      // Process file parsing job
      const fileParsingJobInput = {
        importId: uploadResult.importId,
        filePath: "/tmp/test-events.xlsx",
        fileName: "test-events.xlsx",
        fileType: "xlsx" as const,
      };

      await fileParsingJob.handler({
        job: { input: fileParsingJobInput },
        payload,
      });

      const importRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      expect(importRecord.status).toBe("processing");
      expect(importRecord.processingStage).toBe("batch-processing");
    });

    it("should handle import errors gracefully", async () => {
      // Mock Papa.parse to return errors
      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: [],
        errors: [{ message: "Parse error", row: 1 }],
      });

      const file = new File(["invalid,csv,content"], "invalid.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();

      expect(uploadResponse.status).toBe(200);

      // Process file parsing job - should fail
      const fileParsingJobInput = {
        importId: uploadResult.importId,
        filePath: "/tmp/invalid.csv",
        fileName: "invalid.csv",
        fileType: "csv" as const,
      };

      await expect(
        fileParsingJob.handler({
          job: { input: fileParsingJobInput },
          payload,
        }),
      ).rejects.toThrow();

      // Verify import was marked as failed
      const importRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      expect(importRecord.status).toBe("failed");
      expect(importRecord.errors).toBeDefined();
    });

    it("should handle geocoding failures gracefully", async () => {
      // Mock geocoding service to fail
      (GeocodingService as jest.Mock).mockImplementation(() => ({
        geocode: jest.fn().mockRejectedValue(new Error("Geocoding failed")),
      }));

      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: [sampleCsvData[0]], // Single event
        errors: [],
      });

      // Complete upload and processing steps
      const file = new File(["test content"], "test.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();
      const importId = uploadResult.importId;

      // Process through to geocoding
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: "/tmp/test.csv",
            fileName: "test.csv",
            fileType: "csv" as const,
          },
        },
        payload,
      });

      await batchProcessingJob.handler({
        job: {
          input: {
            importId,
            batchNumber: 1,
            batchData: [sampleCsvData[0]],
            totalBatches: 1,
          },
        },
        payload,
      });

      const processedData = [
        {
          title: sampleCsvData[0].title,
          description: sampleCsvData[0].description,
          date: new Date(sampleCsvData[0].date).toISOString(),
          endDate: null,
          location: sampleCsvData[0].location,
          address: sampleCsvData[0].address,
          url: sampleCsvData[0].url,
          category: sampleCsvData[0].category,
          tags: sampleCsvData[0].tags.split(",").map((t) => t.trim()),
        },
      ];

      await eventCreationJob.handler({
        job: {
          input: {
            importId,
            processedData,
            batchNumber: 1,
          },
        },
        payload,
      });

      // Get created event
      const events = await payload.find({
        collection: "events",
        where: { importId: { equals: importId } },
      });

      // Process geocoding job - should handle failure gracefully
      await geocodingBatchJob.handler({
        job: {
          input: {
            importId,
            eventIds: [events.docs[0].id],
            batchNumber: 1,
          },
        },
        payload,
      });

      // Import should still complete despite geocoding failure
      const finalImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(finalImportRecord.status).toBe("completed");
      expect(finalImportRecord.progress.geocodedRows).toBe(0); // No successful geocodes
    });

    it("should handle large file processing with multiple batches", async () => {
      // Create large dataset (250 events)
      const largeDataset = Array.from({ length: 250 }, (_, i) => ({
        title: `Event ${i + 1}`,
        description: `Description for event ${i + 1}`,
        date: "2024-03-15",
        enddate: "",
        location: `Location ${i + 1}`,
        address: `${i + 1} Main St, City, State`,
        url: `https://event${i + 1}.com`,
        category: "Test",
        tags: "test,event",
      }));

      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: largeDataset,
        errors: [],
      });

      const file = new File(["large csv content"], "large.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();
      const importId = uploadResult.importId;

      // Process file parsing
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: "/tmp/large.csv",
            fileName: "large.csv",
            fileType: "csv" as const,
          },
        },
        payload,
      });

      const importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Should create 3 batches (250 / 100 = 2.5, rounded up to 3)
      expect(importRecord.batchInfo.totalBatches).toBe(3);
      expect(payload.jobs.queue).toHaveBeenCalledTimes(3); // 3 batch processing jobs
    });

    it("should track progress correctly throughout workflow", async () => {
      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: sampleCsvData,
        errors: [],
      });

      const file = new File(["test content"], "progress-test.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();
      const importId = uploadResult.importId;

      // Check initial progress
      let progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      let progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      });
      let progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("file-parsing");
      expect(progressResult.progress.percentage).toBe(0);

      // Process file parsing
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: "/tmp/progress-test.csv",
            fileName: "progress-test.csv",
            fileType: "csv" as const,
          },
        },
        payload,
      });

      // Check progress after file parsing
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      });
      progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("batch-processing");
      expect(progressResult.progress.total).toBe(3);

      // Continue with batch processing and event creation
      await batchProcessingJob.handler({
        job: {
          input: {
            importId,
            batchNumber: 1,
            batchData: sampleCsvData,
            totalBatches: 1,
          },
        },
        payload,
      });

      const processedData = sampleCsvData.map((row) => ({
        title: row.title,
        description: row.description,
        date: new Date(row.date).toISOString(),
        endDate: row.enddate ? new Date(row.enddate).toISOString() : null,
        location: row.location,
        address: row.address,
        url: row.url,
        category: row.category,
        tags: row.tags.split(",").map((t) => t.trim()),
      }));

      await eventCreationJob.handler({
        job: {
          input: {
            importId,
            processedData,
            batchNumber: 1,
          },
        },
        payload,
      });

      // Check progress after event creation
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      });
      progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("geocoding");
      expect(progressResult.progress.current).toBe(3);
      expect(progressResult.progress.createdEvents).toBe(3);

      // Complete geocoding
      const events = await payload.find({
        collection: "events",
        where: { importId: { equals: importId } },
      });

      await geocodingBatchJob.handler({
        job: {
          input: {
            importId,
            eventIds: events.docs.map((e) => e.id),
            batchNumber: 1,
          },
        },
        payload,
      });

      // Check final progress
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      });
      progressResult = await progressResponse.json();

      expect(progressResult.status).toBe("completed");
      expect(progressResult.stage).toBe("completed");
      expect(progressResult.stageProgress.percentage).toBe(100);
    });
  });

  describe("Error Recovery and Edge Cases", () => {
    it("should handle database connection issues", async () => {
      // Mock payload.create to fail
      const originalCreate = payload.create;
      payload.create = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const file = new File(["test content"], "db-error.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();

      expect(uploadResponse.status).toBe(500);
      expect(uploadResult.success).toBe(false);

      // Restore original method
      payload.create = originalCreate;
    });

    it("should handle concurrent imports", async () => {
      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: [sampleCsvData[0]],
        errors: [],
      });

      // Create multiple concurrent uploads
      const uploads = Array.from({ length: 3 }, (_, i) => {
        const file = new File([`content ${i}`], `concurrent-${i}.csv`, {
          type: "text/csv",
        });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("catalogId", testCatalogId);

        return new NextRequest("http://localhost:3000/api/import/upload", {
          method: "POST",
          body: formData,
        });
      });

      const responses = await Promise.all(
        uploads.map((req) => uploadHandler(req)),
      );
      const results = await Promise.all(responses.map((res) => res.json()));

      // All uploads should succeed
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.importId).toBeDefined();
      });

      // Verify all import records were created
      const imports = await payload.find({
        collection: "imports",
        where: {
          catalog: { equals: testCatalogId },
        },
      });

      expect(imports.docs).toHaveLength(3);
    });

    it("should handle malformed data gracefully", async () => {
      const malformedData = [
        { title: "Valid Event", date: "2024-03-15" },
        { title: "", date: "2024-03-16" }, // Invalid - no title
        { title: "Another Event", date: "invalid-date" }, // Invalid date
        { title: "Valid Event 2", date: "2024-03-17" },
      ];

      const Papa = require("papaparse");
      Papa.parse.mockReturnValue({
        data: malformedData,
        errors: [],
      });

      const file = new File(["malformed content"], "malformed.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", testCatalogId);

      const uploadRequest = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();
      const importId = uploadResult.importId;

      // Process the import
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: "/tmp/malformed.csv",
            fileName: "malformed.csv",
            fileType: "csv" as const,
          },
        },
        payload,
      });

      // Should only process valid rows
      const importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(importRecord.progress.totalRows).toBe(4); // Total rows including invalid
      // Batch processing should only include valid rows (2 out of 4)
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "batch-processing",
        input: expect.objectContaining({
          batchData: expect.arrayContaining([
            expect.objectContaining({ title: "Valid Event" }),
            expect.objectContaining({ title: "Valid Event 2" }),
          ]),
        }),
      });
    });
  });
});
