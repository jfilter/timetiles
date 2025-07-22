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
import { NextRequest } from "next/server";
import {
  POST as uploadHandler,
  GET as uploadHealthCheck,
} from "../../../app/api/import/upload/route";
import { GET as progressHandler } from "../../../app/api/import/[importId]/progress/route";
import { createIsolatedTestEnvironment } from "../../test-helpers";
import fs from "fs";

// Store the payload instance globally for test API routes to use
declare global {
  var __TEST_PAYLOAD__: any;
}

describe.sequential("Import API Endpoints", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDatasetId: string;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;

    // Store payload globally for API routes to use in test mode
    global.__TEST_PAYLOAD__ = payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear collections before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();

    // Create test catalog with unique slug for each test
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `API Test Catalog ${timestamp}`,
        slug: `api-test-catalog-${timestamp}-${randomSuffix}`,
        description: "Catalog for API testing",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset with unique slug for each test
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: `API Test Dataset ${timestamp}`,
        slug: `api-test-dataset-${timestamp}-${randomSuffix}`,
        description: "Dataset for API testing",
        catalog: testCatalogId,
        language: "eng",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            date: { type: "string", format: "date" },
            location: { type: "string" },
          },
          required: ["title", "date"],
        },
      },
    });
    testDatasetId = dataset.id;

    // Use real services - no mocking needed
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe.sequential("Upload Endpoint", () => {
    it("should pass health check", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/import/upload",
      );
      const response = await uploadHealthCheck(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.hasGlobalPayload).toBe(true);
    });

    const createMockFile = (
      name: string,
      type: string,
      size: number,
      content: string = "",
    ) => {
      const buffer = Buffer.from(content);
      return new File([buffer], name, { type });
    };

    const createFormData = (
      file: File,
      catalogId: string,
      datasetId?: string,
      sessionId?: string,
    ) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("catalogId", catalogId.toString());
      if (datasetId) formData.append("datasetId", datasetId.toString());
      if (sessionId) formData.append("sessionId", sessionId);
      return formData;
    };

    const createMockRequest = async (
      formData: FormData,
      fileContent: string,
      headers: Record<string, string> = {},
    ) => {
      // Create proper boundary for multipart form data
      const boundary = `----formdata-${Math.random().toString(36).substring(2)}`;

      // Build multipart body
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

      const request = new NextRequest(
        "http://localhost:3000/api/import/upload",
        {
          method: "POST",
          body: body,
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            ...headers,
          },
        },
      );

      // Override the formData method to use our mock
      (request as any).formData = mockFormData;

      return request;
    };

    it("should successfully upload CSV file", async () => {
      const csvContent =
        "title,date,location\nTest Event,2024-03-15,Test Location";
      const file = createMockFile("test.csv", "text/csv", 1024, csvContent);
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(formData, csvContent);

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.importId).toBeDefined();
      expect(result.message).toContain("uploaded successfully");

      // Verify import record was created
      const importRecord = await payload.findByID({
        collection: "imports",
        id: result.importId,
        depth: 0, // Don't populate relationships
      });

      expect(importRecord.fileName).toMatch(/^[a-f0-9-]+\.csv$/); // Real UUID format
      expect(importRecord.originalName).toBe("test.csv");
      expect(importRecord.catalog).toBe(testCatalogId);
      expect(importRecord.status).toBe("pending");

      // Job queue expectation removed - using real job queue
    });

    it("should successfully upload Excel file", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        2048,
      );
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(formData, ""); // Empty content for Excel (mocked)

      // Mock XLSX parsing
      const XLSX = require("xlsx");
      XLSX.read = vi.fn().mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { Sheet1: {} },
      });
      XLSX.utils = {
        sheet_to_json: vi
          .fn()
          .mockReturnValue([{ title: "Test Event", date: "2024-03-15" }]),
      };

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      const importRecord = await payload.findByID({
        collection: "imports",
        id: result.importId,
        depth: 0,
      });

      expect(importRecord.fileName).toMatch(/^[a-f0-9-]+\.xlsx$/); // Real UUID format
      expect(importRecord.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    });

    it("should include dataset in import record when provided", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(file, testCatalogId, testDatasetId);
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(200);

      const importRecord = await payload.findByID({
        collection: "imports",
        id: result.importId,
        depth: 0,
      });

      expect(importRecord.metadata.datasetId).toBe(testDatasetId);
    });

    it("should handle session ID for unauthenticated users", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(
        file,
        testCatalogId,
        undefined,
        "session-123",
      );
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(200);

      const importRecord = await payload.findByID({
        collection: "imports",
        id: result.importId,
        depth: 0,
      });

      expect(importRecord.sessionId).toBe("session-123");
      expect(importRecord.user).toBeNull();
    });

    it("should reject missing file", async () => {
      const formData = new FormData();
      formData.append("catalogId", testCatalogId);
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe("No file provided");
    });

    it("should reject missing catalog ID", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = new FormData();
      formData.append("file", file);
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Valid catalog ID is required");
    });

    it("should reject unsupported file types", async () => {
      const file = createMockFile("test.txt", "text/plain", 1024);
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Unsupported file type");
    });

    it("should reject files that are too large for unauthenticated users", async () => {
      const largeContent = "x".repeat(11 * 1024 * 1024); // 11MB
      const file = createMockFile(
        "large.csv",
        "text/csv",
        11 * 1024 * 1024,
        largeContent,
      );
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(formData, largeContent);

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toContain("File too large");
      expect(result.message).toContain("10MB");
    });

    it("should reject non-existent catalog", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(file, "99999"); // Use a valid numeric ID that doesn't exist
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Catalog not found");
    });

    it("should reject non-existent dataset", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(
        file,
        testCatalogId,
        "99999", // Use a valid numeric ID that doesn't exist
      );
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Dataset not found");
    });

    it("should enforce rate limits for unauthenticated users", async () => {
      // Test rate limiting behavior by directly testing the service
      const { RateLimitService, RATE_LIMITS } = await import(
        "../../../lib/services/RateLimitService"
      );
      const rateLimitService = new RateLimitService(payload);

      const clientId = "192.168.1.100";
      const limit = RATE_LIMITS.FILE_UPLOAD.limit; // 5
      const windowMs = RATE_LIMITS.FILE_UPLOAD.windowMs;

      // Test that first 5 requests are allowed
      for (let i = 0; i < limit; i++) {
        const result = await rateLimitService.checkRateLimit(
          clientId,
          limit,
          windowMs,
        );
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - (i + 1));
      }

      // 6th request should be blocked
      const blockedResult = await rateLimitService.checkRateLimit(
        clientId,
        limit,
        windowMs,
      );
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
      expect(blockedResult.blocked).toBe(true);

      // Test that subsequent requests are also blocked
      const stillBlockedResult = await rateLimitService.checkRateLimit(
        clientId,
        limit,
        windowMs,
      );
      expect(stillBlockedResult.allowed).toBe(false);
      expect(stillBlockedResult.blocked).toBe(true);

      // Test rate limit headers
      const headers = rateLimitService.getRateLimitHeaders(clientId, limit);
      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("0");
      expect(headers["X-RateLimit-Blocked"]).toBe("true");

      rateLimitService.destroy();
    });

    it("should include rate limit headers in response", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);

      expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("4");
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("should handle file parsing errors during row count calculation", async () => {
      const invalidContent = "invalid,csv,content";
      const file = createMockFile("test.csv", "text/csv", 1024, invalidContent);
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(formData, invalidContent);

      // Should still succeed even if row count calculation fails
      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      const importRecord = await payload.findByID({
        collection: "imports",
        id: result.importId,
      });

      expect(importRecord.rowCount).toBe(0); // Default when parsing fails
    });

    it("should handle internal server errors", async () => {
      // Mock payload.create to throw error
      const originalCreate = payload.create;
      payload.create = vi.fn().mockRejectedValue(new Error("Database error"));

      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(file, testCatalogId);
      const request = await createMockRequest(
        formData,
        "title,date,location\nTest Event,2024-03-15,Test Location",
      );

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to create import record");

      // Restore original method
      payload.create = originalCreate;
    });
  });

  describe.sequential("Progress Endpoint", () => {
    let testImportId: string;

    beforeEach(async () => {
      // Create test import record
      const importRecord = await payload.create({
        collection: "imports",
        data: {
          fileName: "test-file.csv",
          originalName: "test-file.csv",
          catalog: testCatalogId,
          fileSize: 1024,
          mimeType: "text/csv",
          status: "processing",
          processingStage: "geocoding",
          importedAt: new Date().toISOString(),
          rowCount: 100,
          errorCount: 0,
          progress: {
            totalRows: 100,
            processedRows: 75,
            geocodedRows: 50,
            createdEvents: 75,
            percentage: 75,
          },
          batchInfo: {
            batchSize: 25,
            currentBatch: 3,
            totalBatches: 4,
          },
          geocodingStats: {
            totalAddresses: 60,
            successfulGeocodes: 45,
            failedGeocodes: 5,
            cachedResults: 10,
            googleApiCalls: 35,
            nominatimApiCalls: 10,
          },
          jobHistory: [],
          metadata: {},
        },
        depth: 0,
      });
      testImportId = importRecord.id;
    });

    it("should return progress information", async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: testImportId },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toMatchObject({
        importId: testImportId,
        status: "processing",
        stage: "geocoding",
        progress: {
          current: 75,
          total: 100,
          percentage: 75,
        },
        stageProgress: {
          stage: expect.stringContaining("Geocoding"),
          percentage: expect.any(Number),
        },
        batchInfo: {
          currentBatch: 3,
          totalBatches: 4,
          batchSize: 25,
        },
        geocodingStats: {
          totalAddresses: 60,
          successfulGeocodes: 45,
          failedGeocodes: 5,
          cachedResults: 10,
          googleApiCalls: 35,
          nominatimApiCalls: 10,
        },
      });
    });

    it("should calculate stage progress correctly for different stages", async () => {
      // Test file-parsing stage
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          processingStage: "file-parsing",
        },
      });

      let request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      let response = await progressHandler(request, {
        params: { importId: testImportId },
      } as any);
      let result = await response.json();

      expect(result.stageProgress.stage).toBe("Parsing file...");
      expect(result.stageProgress.percentage).toBe(10);

      // Test completed stage
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          processingStage: "completed",
          status: "completed",
        },
      });

      request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      response = await progressHandler(request, {
        params: { importId: testImportId },
      } as any);
      result = await response.json();

      expect(result.stageProgress.stage).toBe("Completed");
      expect(result.stageProgress.percentage).toBe(100);
    });

    it("should calculate estimated time remaining", async () => {
      // Update import with start time 30 seconds ago
      const startTime = new Date(Date.now() - 30000);
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          importedAt: startTime.toISOString(),
          "progress.processedRows": 25, // 25% complete
        },
      });

      const request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: testImportId },
      } as any);
      const result = await response.json();

      expect(result.estimatedTimeRemaining).toBeGreaterThan(0);
      expect(result.estimatedTimeRemaining).toBeLessThan(200); // Should be reasonable
    });

    it("should return 404 for non-existent import", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/import/99999/progress",
      );
      const response = await progressHandler(request, {
        params: { importId: "99999" }, // Use a valid numeric ID that doesn't exist
      } as any);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.error).toBe("Import not found");
    });

    it("should handle database errors", async () => {
      // Mock payload.findByID to throw error
      const originalFindByID = payload.findByID;
      payload.findByID = vi.fn().mockRejectedValue(new Error("Database error"));

      const request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: testImportId },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe("Failed to fetch progress");

      // Restore original method
      payload.findByID = originalFindByID;
    });

    it("should handle missing progress data gracefully", async () => {
      // Create import with minimal data
      const minimalImport = await payload.create({
        collection: "imports",
        data: {
          fileName: "minimal.csv",
          originalName: "minimal.csv",
          catalog: testCatalogId,
          fileSize: 1024,
          mimeType: "text/csv",
          status: "pending",
          importedAt: new Date().toISOString(),
          rowCount: 0,
          errorCount: 0,
        },
        depth: 0,
      });

      const request = new NextRequest(
        `http://localhost:3000/api/import/${minimalImport.id}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: minimalImport.id },
      } as any);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.progress.total).toBe(0);
      expect(result.progress.current).toBe(0);
      expect(result.progress.percentage).toBe(0);
      expect(result.batchInfo.currentBatch).toBe(0);
      expect(result.batchInfo.totalBatches).toBe(0);
    });

    it("should include current job status when available", async () => {
      // Update import with current job ID
      await payload.update({
        collection: "imports",
        id: testImportId,
        data: {
          currentJobId: "job-123",
        },
      });

      const request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: testImportId },
      } as any);
      const result = await response.json();

      expect(result.currentJob).toMatchObject({
        id: "job-123",
        status: "running",
        progress: expect.any(Number),
      });
    });
  });
});
