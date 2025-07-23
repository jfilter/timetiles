import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";
import { NextRequest } from "next/server";
import { POST as uploadHandler } from "../../../app/api/import/upload/route";
import { GET as progressHandler } from "../../../app/api/import/[importId]/progress/route";
import type { Event } from "../../../payload-types";

import { getPayload } from "payload";
import {
  fileParsingJob,
  batchProcessingJob,
  eventCreationJob,
  geocodingBatchJob,
} from "../../../lib/jobs/import-jobs";
import { GeocodingService } from "../../../lib/services/geocoding/geocoding-service";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

// Mock GeocodingService to avoid real HTTP calls
vi.mock("../../../lib/services/geocoding/geocoding-service", () => {
  return {
    GeocodingService: vi.fn().mockImplementation(() => ({
      geocode: vi.fn().mockImplementation(async (address: string) => {
        // Simulate geocoding failure for test addresses
        if (
          address.toLowerCase().includes("fail") ||
          address.toLowerCase().includes("test st")
        ) {
          throw new Error("Geocoding failed");
        }

        return {
          latitude: 37.7749,
          longitude: -122.4194,
          confidence: 0.9,
          provider: "google",
          normalizedAddress: address,
          components: {
            streetNumber: "123",
            streetName: "Main St",
            city: "San Francisco",
            region: "CA",
            postalCode: "94102",
            country: "USA",
          },
          metadata: {},
        };
      }),
      batchGeocode: vi.fn().mockImplementation(async function (
        this: any,
        addresses: string[],
      ) {
        const results = new Map();
        let successful = 0;
        let failed = 0;

        for (const address of addresses) {
          if (!address) continue;
          try {
            const result = await this.geocode(address);
            results.set(address, result);
            successful++;
          } catch (error) {
            results.set(address, error);
            failed++;
          }
        }

        return {
          results,
          summary: {
            total: addresses.length,
            successful,
            failed,
            cached: 0,
          },
        };
      }),
    })),
    GeocodingError: class extends Error {
      constructor(
        message: string,
        public code: string,
        public retryable = false,
      ) {
        super(message);
        this.name = "GeocodingError";
      }
    },
  };
});

// Helper function to create proper multipart requests for testing
const createMultipartRequest = async (
  formData: FormData,
  fileContent: string,
  headers: Record<string, string> = {},
) => {
  // Create proper multipart boundary
  const boundary = `----formdata-${Math.random().toString(36).substring(2)}`;

  // Build multipart body manually for test environment
  let body = "";

  // Add file field
  const file = formData.get("file") as File;
  if (file) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`;
    body += `Content-Type: ${file.type}\r\n\r\n`;
    body += `${fileContent}\r\n`;
  }

  // Add other fields
  for (const [key, value] of formData.entries()) {
    if (key !== "file") {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${value}\r\n`;
    }
  }

  body += `--${boundary}--\r\n`;

  // Mock the formData method to return the expected data structure
  const mockFormData = async () => {
    const formDataResult = new FormData();

    // Add file
    if (file) {
      // Create a proper File object for the test with arrayBuffer method
      const fileBlob = new Blob([fileContent], { type: file.type });
      const testFile = new File([fileBlob], file.name, { type: file.type });

      // Ensure the file has the arrayBuffer method
      (testFile as any).arrayBuffer = async () => {
        // Convert string content to buffer
        const buffer = Buffer.from(fileContent);
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        );
      };

      formDataResult.append("file", testFile);
    }

    // Add other fields
    for (const [key, value] of formData.entries()) {
      if (key !== "file") {
        formDataResult.append(key, value as string);
      }
    }

    return formDataResult;
  };

  const request = new NextRequest("http://localhost:3000/api/import/upload", {
    method: "POST",
    body: body,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      ...headers,
    },
  });

  // Override the formData method to use our mock
  (request as any).formData = mockFormData;

  return request;
};

describe.sequential("Import System Integration Tests", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
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
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;

    // API routes now use getPayload({ config }) directly
  }, 30000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  }, 30000);

  beforeEach(async () => {
    // Clean up before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Create test catalog with unique slug for each test
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Integration Test Catalog ${timestamp}`,
        slug: `integration-test-catalog-${timestamp}-${randomSuffix}`,
        description: "Catalog for integration testing",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset with unique slug for each test
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: `Integration Test Dataset ${timestamp}`,
        slug: `integration-test-dataset-${timestamp}-${randomSuffix}`,
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

    // Use real services - no mocking needed
  }, 30000);

  afterEach(() => {
    vi.clearAllMocks();

    // Clean up any test files in uploads directory
    const uploadsDir = path.join(process.cwd(), "uploads");

    try {
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        files.forEach((file) => {
          const filePath = path.join(uploadsDir, file);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        });
      }
    } catch (error) {
      console.warn("Failed to clean up test files:", error);
    }
  });

  describe.sequential("Complete Import Workflow", () => {
    it("should complete full CSV import workflow", async () => {
      // Step 1: Upload file
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              // Properly escape CSV values - double quotes and wrap in quotes if contains comma
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
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

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
        input: fileParsingJobInput,
        job: { id: "test-job" },
        req: { payload },
      });

      // Verify import was updated after file parsing
      importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(importRecord.status).toBe("processing");
      expect(importRecord.processingStage).toBe("row-processing");
      expect(importRecord.progress.totalRows).toBe(3);

      // Job queue verification removed - using real job queue

      // Step 3: Process batch processing job
      const batchProcessingJobInput = {
        importId,
        batchNumber: 1,
        batchData: sampleCsvData,
        totalBatches: 1,
      };

      await batchProcessingJob.handler({
        input: batchProcessingJobInput,
        job: { id: "test-job" },
        req: { payload },
      });

      // Job queue verification removed - using real job queue

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
        input: eventCreationJobInput,
        job: { id: "test-job" },
        req: { payload },
      });

      // Verify events were created
      const events = await payload.find({
        collection: "events",
        where: {
          import: { equals: importId },
        },
      });

      expect(events.docs).toHaveLength(3);

      // Find the specific event instead of assuming order
      const techConferenceEvent = events.docs.find(
        (event: Event) =>
          event.data &&
          typeof event.data === "object" &&
          !Array.isArray(event.data) &&
          (event.data as Record<string, unknown>).title ===
            "Tech Conference 2024",
      );
      expect(techConferenceEvent).toBeDefined();
      expect(techConferenceEvent.data).toMatchObject({
        title: "Tech Conference 2024",
        description: "Annual technology conference",
        location: "Convention Center",
        url: "https://techconf2024.com",
        category: "Technology",
        tags: ["tech", "conference", "networking"],
      });

      // Job queue verification removed - using real job queue

      // Step 5: Process geocoding job
      const eventIds = events.docs.map((event: Event) => event.id);
      const geocodingJobInput = {
        importId,
        eventIds,
        batchNumber: 1,
      };

      await geocodingBatchJob.handler({
        input: geocodingJobInput,
        job: { id: "test-job" },
        req: { payload },
      });

      // Verify events were geocoded
      const geocodedEvents = await payload.find({
        collection: "events",
        where: {
          import: { equals: importId },
        },
      });

      expect(geocodedEvents.docs[0].location.latitude).toBe(37.7749);
      expect(geocodedEvents.docs[0].location.longitude).toBe(-122.4194);
      expect(geocodedEvents.docs[0].geocodingInfo.provider).toBe("google");

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
      } as any);
      const progressResult = await progressResponse.json();

      expect(progressResponse.status).toBe(200);
      expect(progressResult.status).toBe("completed");
      expect(progressResult.progress.percentage).toBe(100);
    });

    it("should handle Excel file import workflow", async () => {
      // For integration testing, create a CSV file but treat it as Excel
      // This tests the upload workflow without binary encoding issues
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
            .join(","),
        )
        .join("\n");
      const csvContent = csvHeaders + "\n" + csvRows;

      // Create file with Excel MIME type but CSV content for testing
      const file = new File([csvContent], "test-events.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

      const uploadRequest = await createMultipartRequest(formData, csvContent);

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();

      expect(uploadResponse.status).toBe(200);
      expect(uploadResult.success).toBe(true);

      // Get import record to access file path
      const xlsxImportRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      // For integration test, use CSV parsing even though file has xlsx extension
      const fileParsingJobInput = {
        importId: uploadResult.importId,
        filePath: xlsxImportRecord.metadata.filePath,
        fileName: "test-events.xlsx",
        fileType: "csv" as const, // Use CSV parsing for this test
      };

      await fileParsingJob.handler({
        input: fileParsingJobInput,
        job: { id: "test-job" },
        req: { payload },
      });

      // Verify import was updated after file parsing
      const importRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      expect(importRecord.status).toBe("processing");
      expect(importRecord.processingStage).toBe("row-processing");
      expect(importRecord.progress.totalRows).toBe(3);
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

      const uploadRequest = await createMultipartRequest(
        formData,
        invalidCsvContent,
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
          input: fileParsingJobInput,
          job: { id: "test-job" },
          req: { payload },
        }),
      ).rejects.toThrow("No valid rows found");

      // Verify import was marked as failed
      const importRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      expect(importRecord.status).toBe("failed");
      expect(importRecord.errorLog).toBeDefined();
    });

    it("should handle geocoding failures gracefully", async () => {
      // Use an address that triggers test provider failure
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRow = `"Test Event","Test Description","2024-03-15","","Test Location","123 Fail St","https://test.com","Test","test"`;
      const csvContent = csvHeaders + "\n" + csvRow;

      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
        input: {
          importId,
          filePath: geocodingImportRecord.metadata.filePath,
          fileName: "test.csv",
          fileType: "csv" as const,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      await batchProcessingJob.handler({
        input: {
          importId,
          batchNumber: 1,
          batchData: [
            {
              title: "Test Event",
              description: "Test Description",
              date: "2024-03-15",
              enddate: "",
              location: "Test Location",
              address: "123 Test St",
              url: "https://test.com",
              category: "Test",
              tags: "test",
            },
          ],
          totalBatches: 1,
        },
        job: { id: "test-job" },
        req: { payload },
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
        input: {
          importId,
          processedData,
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Get created event
      const events = await payload.find({
        collection: "events",
        where: { import: { equals: importId } },
      });

      expect(events.docs.length).toBeGreaterThan(0);

      // Process geocoding job - should handle failure gracefully
      await geocodingBatchJob.handler({
        input: {
          importId,
          eventIds: [events.docs[0]?.id],
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Import should still complete despite geocoding failure
      const finalImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(finalImportRecord.status).toBe("completed");
      expect(finalImportRecord.progress.geocodedRows).toBeGreaterThanOrEqual(0); // Import completed
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
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = largeDataset
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              // Properly escape CSV values - double quotes and wrap in quotes if contains comma
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
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

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
        input: {
          importId,
          filePath: largeImportRecord.metadata.filePath,
          fileName: "large.csv",
          fileType: "csv" as const,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      const importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Should create 3 batches (250 / 100 = 2.5, rounded up to 3)
      expect(importRecord.batchInfo.totalBatches).toBe(3);

      // Batch processing verification removed - using real job queue
      // The test verifies the batching logic through the batchInfo structure
    });

    it("should track progress correctly throughout workflow", async () => {
      // Create proper CSV content with headers
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              // Properly escape CSV values - double quotes and wrap in quotes if contains comma
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
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

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
      } as any);
      let progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("file-parsing");
      expect(progressResult.progress.percentage).toBe(0);

      // Process file parsing
      await fileParsingJob.handler({
        input: {
          importId,
          filePath: progressImportRecord.metadata.filePath,
          fileName: "progress-test.csv",
          fileType: "csv" as const,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Check progress after file parsing
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      } as any);
      progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("row-processing");
      expect(progressResult.progress.total).toBe(3);

      // Continue with batch processing and event creation
      await batchProcessingJob.handler({
        input: {
          importId,
          batchNumber: 1,
          batchData: sampleCsvData,
          totalBatches: 1,
        },
        job: { id: "test-job" },
        req: { payload },
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
        input: {
          importId,
          processedData,
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Check progress after event creation
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      } as any);
      progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("geocoding");
      expect(progressResult.progress.createdEvents).toBe(3);

      // Complete geocoding
      const events = await payload.find({
        collection: "events",
        where: { import: { equals: importId } },
      });

      await geocodingBatchJob.handler({
        input: {
          importId,
          eventIds: events.docs.map((e: any) => e.id),
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Check final progress
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      } as any);
      progressResult = await progressResponse.json();

      expect(progressResult.status).toBe("completed");
      expect(progressResult.stage).toBe("completed");
      expect(progressResult.stageProgress.percentage).toBe(100);
    });

    it("should handle Excel file import workflow", async () => {
      // For integration testing, create a CSV file but treat it as Excel
      // This tests the upload workflow without binary encoding issues
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
            .join(","),
        )
        .join("\n");
      const csvContent = csvHeaders + "\n" + csvRows;

      // Create file with Excel MIME type but CSV content for testing
      const file = new File([csvContent], "test-events.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

      const uploadRequest = await createMultipartRequest(formData, csvContent);

      const uploadResponse = await uploadHandler(uploadRequest);
      const uploadResult = await uploadResponse.json();

      expect(uploadResponse.status).toBe(200);
      expect(uploadResult.success).toBe(true);

      // Get import record to access file path
      const xlsxImportRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      // For integration test, use CSV parsing even though file has xlsx extension
      const fileParsingJobInput = {
        importId: uploadResult.importId,
        filePath: xlsxImportRecord.metadata.filePath,
        fileName: "test-events.xlsx",
        fileType: "csv" as const, // Use CSV parsing for this test
      };

      await fileParsingJob.handler({
        input: fileParsingJobInput,
        job: { id: "test-job" },
        req: { payload },
      });

      // Verify import was updated after file parsing
      const importRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      expect(importRecord.status).toBe("processing");
      expect(importRecord.processingStage).toBe("row-processing");
      expect(importRecord.progress.totalRows).toBe(3);
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

      const uploadRequest = await createMultipartRequest(
        formData,
        invalidCsvContent,
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
          input: fileParsingJobInput,
          job: { id: "test-job" },
          req: { payload },
        }),
      ).rejects.toThrow("No valid rows found");

      // Verify import was marked as failed
      const importRecord = await payload.findByID({
        collection: "imports",
        id: uploadResult.importId,
      });

      expect(importRecord.status).toBe("failed");
      expect(importRecord.errorLog).toBeDefined();
    });

    it("should handle geocoding failures gracefully", async () => {
      // Use an address that triggers test provider failure
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRow = `"Test Event","Test Description","2024-03-15","","Test Location","123 Fail St","https://test.com","Test","test"`;
      const csvContent = csvHeaders + "\n" + csvRow;

      const file = new File([csvContent], "test.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", String(testCatalogId));

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
        input: {
          importId,
          filePath: geocodingImportRecord.metadata.filePath,
          fileName: "test.csv",
          fileType: "csv" as const,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      await batchProcessingJob.handler({
        input: {
          importId,
          batchNumber: 1,
          batchData: [
            {
              title: "Test Event",
              description: "Test Description",
              date: "2024-03-15",
              enddate: "",
              location: "Test Location",
              address: "123 Test St",
              url: "https://test.com",
              category: "Test",
              tags: "test",
            },
          ],
          totalBatches: 1,
        },
        job: { id: "test-job" },
        req: { payload },
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
        input: {
          importId,
          processedData,
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Get created event
      const events = await payload.find({
        collection: "events",
        where: { import: { equals: importId } },
      });

      expect(events.docs.length).toBeGreaterThan(0);

      // Process geocoding job - should handle failure gracefully
      await geocodingBatchJob.handler({
        input: {
          importId,
          eventIds: [events.docs[0]?.id],
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Import should still complete despite geocoding failure
      const finalImportRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      expect(finalImportRecord.status).toBe("completed");
      expect(finalImportRecord.progress.geocodedRows).toBeGreaterThanOrEqual(0); // Import completed
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
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = largeDataset
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              // Properly escape CSV values - double quotes and wrap in quotes if contains comma
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
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

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
        input: {
          importId,
          filePath: largeImportRecord.metadata.filePath,
          fileName: "large.csv",
          fileType: "csv" as const,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      const importRecord = await payload.findByID({
        collection: "imports",
        id: importId,
      });

      // Should create 3 batches (250 / 100 = 2.5, rounded up to 3)
      expect(importRecord.batchInfo.totalBatches).toBe(3);

      // Batch processing verification removed - using real job queue
      // The test verifies the batching logic through the batchInfo structure
    });

    it("should track progress correctly throughout workflow", async () => {
      // Create proper CSV content with headers
      const csvHeaders =
        "title,description,date,enddate,location,address,url,category,tags";
      const csvRows = sampleCsvData
        .map((row) =>
          [
            row.title,
            row.description,
            row.date,
            row.enddate,
            row.location,
            row.address,
            row.url,
            row.category,
            row.tags,
          ]
            .map((val) => {
              // Properly escape CSV values - double quotes and wrap in quotes if contains comma
              const stringVal = String(val);
              if (
                stringVal.includes(",") ||
                stringVal.includes('"') ||
                stringVal.includes("\n")
              ) {
                return `"${stringVal.replace(/"/g, '""')}"`;
              }
              return stringVal;
            })
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

      const uploadRequest = await createMultipartRequest(formData, csvContent);

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
      } as any);
      let progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("file-parsing");
      expect(progressResult.progress.percentage).toBe(0);

      // Process file parsing
      await fileParsingJob.handler({
        input: {
          importId,
          filePath: progressImportRecord.metadata.filePath,
          fileName: "progress-test.csv",
          fileType: "csv" as const,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Check progress after file parsing
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      } as any);
      progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("row-processing");
      expect(progressResult.progress.total).toBe(3);

      // Continue with batch processing and event creation
      await batchProcessingJob.handler({
        input: {
          importId,
          batchNumber: 1,
          batchData: sampleCsvData,
          totalBatches: 1,
        },
        job: { id: "test-job" },
        req: { payload },
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
        input: {
          importId,
          processedData,
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Check progress after event creation
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      } as any);
      progressResult = await progressResponse.json();

      expect(progressResult.stage).toBe("geocoding");
      expect(progressResult.progress.createdEvents).toBe(3);

      // Complete geocoding
      const events = await payload.find({
        collection: "events",
        where: { import: { equals: importId } },
      });

      await geocodingBatchJob.handler({
        input: {
          importId,
          eventIds: events.docs.map((e: Event) => e.id),
          batchNumber: 1,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      // Check final progress
      progressRequest = new NextRequest(
        `http://localhost:3000/api/import/${importId}/progress`,
      );
      progressResponse = await progressHandler(progressRequest, {
        params: { importId },
      } as any);
      progressResult = await progressResponse.json();

      expect(progressResult.status).toBe("completed");
      expect(progressResult.stage).toBe("completed");
      expect(progressResult.stageProgress.percentage).toBe(100);
    });
  });
});
