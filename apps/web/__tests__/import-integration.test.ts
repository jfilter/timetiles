import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
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
import * as XLSX from "xlsx";

// Mock UUID for consistent testing
vi.mock("uuid", () => ({ v4: vi.fn(() => "test-uuid-123") }));

// Mock rate limiting
vi.mock("../lib/services/RateLimitService", () => ({
  getRateLimitService: vi.fn(() => ({
    checkRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetTime: Date.now() + 3600000,
      blocked: false,
    }),
    getRateLimitHeaders: vi.fn(() => ({})),
  })),
  getClientIdentifier: vi.fn(() => "127.0.0.1"),
  RATE_LIMITS: {
    FILE_UPLOAD: { limit: 5, windowMs: 3600000 },
    PROGRESS_CHECK: { limit: 100, windowMs: 3600000 },
  },
}));

// Mock geocoding service
vi.mock("../lib/services/geocoding/GeocodingService");

describe("Import System Integration Tests", () => {
  let seedManager: any;
  let payload: any;
  let testCatalogId: string;
  let testDatasetId: string;

  // Sample CSV data for testing
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

  beforeAll(async () => {
    seedManager = createSeedManager();
    await seedManager.initialize();
    payload = seedManager.payload;

    // Create test catalog with unique slug
    const timestamp = Date.now();
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Integration Test Catalog ${timestamp}`,
        slug: `integration-test-catalog-${timestamp}`,
        description: "Catalog for integration testing",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset with unique slug
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: `Integration Test Dataset ${timestamp}`,
        slug: `integration-test-dataset-${timestamp}`,
        description: "Dataset for integration testing",
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
    await seedManager.cleanup();
  });

  beforeEach(async () => {
    // Clear all collections
    await payload.delete({ collection: "imports", where: {} });
    await payload.delete({ collection: "events", where: {} });
    await payload.delete({ collection: "location-cache", where: {} });

    // Mock payload.jobs.queue
    payload.jobs = {
      queue: vi.fn().mockResolvedValue({}),
    };

    // No need to mock fs, papaparse, or xlsx - use real implementations

    // Mock GeocodingService
    (GeocodingService as any).mockImplementation(() => ({
      geocode: vi.fn().mockResolvedValue({
        latitude: 37.7749,
        longitude: -122.4194,
        confidence: 0.9,
        provider: "google",
        normalizedAddress: "123 Main St, San Francisco, CA 94102, USA",
      }),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Complete Import Workflow", () => {

    it("should complete full CSV import workflow", async () => {
      // Step 1: Upload file
      const csvHeaders = "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          Object.values(row)
            .map((val) => `"${val}"`)
            .join(","),
        )
        .join("\n");
      const csvContent = csvHeaders + "\n" + csvRows;

      // Use real Papa.parse - no mocking needed

      const file = new File([csvContent], "test-events.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));
      formData.append("datasetId", String(testDatasetId));

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
        filePath: importRecord.metadata.filePath,
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
      const eventIds = events.docs.map((event: any) => event.id);
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
      // Create a proper Excel file using XLSX
      const workbook = XLSX.utils.book_new();
      const worksheetData = [
        ["title", "description", "date", "enddate", "location", "address", "url", "category", "tags"],
        ...sampleCsvData.map(row => [
          row.title, row.description, row.date, row.enddate, 
          row.location, row.address, row.url, row.category, row.tags
        ])
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Events");
      
      // Write to buffer and create file
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const excelBlob = new Blob([excelBuffer], { 
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
      });

      const file = new File([excelBlob], "test-events.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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

      // Get import record to access file path
      const xlsxImportRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      // Process file parsing job
      const fileParsingJobInput = {
        importId: uploadResult.importId,
        filePath: xlsxImportRecord.metadata.filePath,
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
      // Create a CSV with invalid content (missing required fields)
      const invalidCsvContent = "invalid,csv,content\nno,headers,here";

      const file = new File([invalidCsvContent], "invalid.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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

      // Get import record to access file path
      const errorImportRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      // Process file parsing job - should fail
      const fileParsingJobInput = {
        importId: uploadResult.importId,
        filePath: errorImportRecord.metadata.filePath,
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
      expect(importRecord.errorLog).toBeDefined();
    });

    it("should handle geocoding failures gracefully", async () => {
      // Mock geocoding service to fail
      (GeocodingService as any).mockImplementation(() => ({
        geocode: vi.fn().mockRejectedValue(new Error("Geocoding failed")),
      }));

      // Create a proper CSV with just one event
      const csvHeaders = "title,description,date,enddate,location,address,url,category,tags";
      const csvRow = `"Test Event","Test Description","2024-03-15","","Test Location","123 Test St","https://test.com","Test","test"`;
      const csvContent = csvHeaders + "\n" + csvRow;

      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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

      // Get import record to access file path
      const geocodingImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Process through to geocoding
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: geocodingImportRecord.metadata.filePath,
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
            batchData: [{
              title: "Test Event",
              description: "Test Description", 
              date: "2024-03-15",
              enddate: "",
              location: "Test Location",
              address: "123 Test St",
              url: "https://test.com", 
              category: "Test",
              tags: "test"
            }],
            totalBatches: 1,
          },
        },
        payload,
      });

      const processedData = [
        {
          title: "Test Event",
          description: "Test Description",
          date: new Date("2024-03-15").toISOString(),
          endDate: null,
          location: "Test Location",
          address: "123 Test St",
          url: "https://test.com",
          category: "Test",
          tags: ["test"],
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

      // Create proper CSV content with headers
      const csvHeaders = "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = largeDataset
        .map((row) =>
          Object.values(row)
            .map((val) => `"${val}"`)
            .join(","),
        )
        .join("\n");
      const csvContent = csvHeaders + "\n" + csvRows;

      const file = new File([csvContent], "large.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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

      // Get import record to access file path
      const largeImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Process file parsing
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: largeImportRecord.metadata.filePath,
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
      // Create proper CSV content with headers
      const csvHeaders = "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          Object.values(row)
            .map((val) => `"${val}"`)
            .join(","),
        )
        .join("\n");
      const csvContent = csvHeaders + "\n" + csvRows;

      const file = new File([csvContent], "progress-test.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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

      // Get import record to access file path
      const progressImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

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
            filePath: progressImportRecord.metadata.filePath,
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
            eventIds: events.docs.map((e: any) => e.id),
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
      payload.create = vi
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const csvContent = "title,description,date\n\"Test Event\",\"Test Description\",\"2024-03-15\"";
      const file = new File([csvContent], "db-error.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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
      // Create multiple concurrent uploads with proper CSV content
      const uploads = Array.from({ length: 3 }, (_, i) => {
        const csvContent = `title,description,date\n"Event ${i}","Description ${i}","2024-03-15"`;
        const file = new File([csvContent], `concurrent-${i}.csv`, {
          type: "text/csv",
        });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("catalogId", String(testCatalogId));

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

      // Create CSV content with some valid and some invalid rows
      const csvHeaders = "title,description,date";
      const csvRows = [
        '"Valid Event","Valid Description","2024-03-15"',
        '"","Invalid - no title","2024-03-16"', 
        '"Another Event","Invalid date","invalid-date"',
        '"Valid Event 2","Another valid event","2024-03-17"'
      ].join("\n");
      const csvContent = csvHeaders + "\n" + csvRows;

      const file = new File([csvContent], "malformed.csv", {
        type: "text/csv",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

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

      // Get import record to access file path
      const malformedImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Process the import
      await fileParsingJob.handler({
        job: {
          input: {
            importId,
            filePath: malformedImportRecord.metadata.filePath,
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
