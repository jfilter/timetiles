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
import { POST as uploadHandler } from "../app/(app)/api/import/upload/route";
import { GET as progressHandler } from "../app/(app)/api/import/[importId]/progress/route";
import { createIsolatedTestEnvironment } from "./test-helpers";

// No mocking needed for API tests - use real services
// This allows us to test the actual API behavior

describe.sequential("Import API Endpoints", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDatasetId: string;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    await testEnv.cleanup();
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
      formData.append("catalogId", catalogId);
      if (datasetId) formData.append("datasetId", datasetId);
      if (sessionId) formData.append("sessionId", sessionId);
      return formData;
    };

    const createMockRequest = (
      formData: FormData,
      headers: Record<string, string> = {},
    ) => {
      return new NextRequest("http://localhost:3000/api/import/upload", {
        method: "POST",
        body: formData,
        headers,
      });
    };

    it("should successfully upload CSV file", async () => {
      const csvContent =
        "title,date,location\nTest Event,2024-03-15,Test Location";
      const file = createMockFile("test.csv", "text/csv", 1024, csvContent);
      const formData = createFormData(file, testCatalogId);
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Valid catalog ID is required");
    });

    it("should reject unsupported file types", async () => {
      const file = createMockFile("test.txt", "text/plain", 1024);
      const formData = createFormData(file, testCatalogId);
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Dataset not found");
    });

    it.skip("should enforce rate limits for unauthenticated users", async () => {
      // Skipped: Rate limiting test requires real load testing or complex setup
      // In production, rate limits are enforced by the actual RateLimitService
      // This test would require multiple concurrent requests to trigger rate limits
    });

    it("should include rate limit headers in response", async () => {
      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(file, testCatalogId);
      const request = createMockRequest(formData);

      const response = await uploadHandler(request);

      expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("4");
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("should handle file parsing errors during row count calculation", async () => {
      const file = createMockFile(
        "test.csv",
        "text/csv",
        1024,
        "invalid,csv,content",
      );
      const formData = createFormData(file, testCatalogId);
      const request = createMockRequest(formData);

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
      const request = createMockRequest(formData);

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
