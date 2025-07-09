import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as uploadHandler } from "../app/api/import/upload/route";
import { GET as progressHandler } from "../app/api/import/[importId]/progress/route";
import { createSeedManager } from "../lib/seed/index";

// Mock external dependencies
vi.mock("fs/promises");
vi.mock("xlsx");
vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid-123"),
}));

// Mock the rate limit service
vi.mock("../lib/services/RateLimitService", () => ({
  getRateLimitService: vi.fn(() => ({
    checkRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetTime: Date.now() + 3600000,
      blocked: false,
    }),
    getRateLimitHeaders: vi.fn(() => ({
      "X-RateLimit-Limit": "5",
      "X-RateLimit-Remaining": "4",
      "X-RateLimit-Reset": new Date(Date.now() + 3600000).toISOString(),
    })),
  })),
  getClientIdentifier: vi.fn(() => "127.0.0.1"),
  RATE_LIMITS: {
    FILE_UPLOAD: { limit: 5, windowMs: 3600000 },
    PROGRESS_CHECK: { limit: 100, windowMs: 3600000 },
  },
}));

describe("Import API Endpoints", () => {
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
        name: "Test Catalog",
        description: "Test catalog for API tests",
      },
    });
    testCatalogId = catalog.id;

    // Create test dataset
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Test Dataset",
        description: "Test dataset for API tests",
        catalog: testCatalogId,
      },
    });
    testDatasetId = dataset.id;
  });

  afterAll(async () => {
    await seedManager.cleanup();
  });

  beforeEach(async () => {
    // Clear imports before each test
    await payload.delete({ collection: "imports", where: {} });

    // Mock payload.jobs.queue
    payload.jobs = {
      queue: vi.fn().mockResolvedValue({}),
    };

    // Mock fs/promises
    const fsPromises = require("fs/promises");
    fsPromises.mkdir = vi.fn().mockResolvedValue(undefined);
    fsPromises.writeFile = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Upload Endpoint", () => {
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
      });

      expect(importRecord.fileName).toBe("mock-uuid-123.csv");
      expect(importRecord.originalName).toBe("test.csv");
      expect(importRecord.catalog).toBe(testCatalogId);
      expect(importRecord.status).toBe("pending");

      // Verify job was queued
      expect(payload.jobs.queue).toHaveBeenCalledWith({
        task: "file-parsing",
        input: expect.objectContaining({
          importId: result.importId,
          fileName: "test.csv",
          fileType: "csv",
        }),
      });
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
      });

      expect(importRecord.fileName).toBe("mock-uuid-123.xlsx");
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
      expect(result.message).toBe("Catalog ID is required");
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
      const formData = createFormData(file, "non-existent-catalog-id");
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
        "non-existent-dataset-id",
      );
      const request = createMockRequest(formData);

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Dataset not found");
    });

    it("should enforce rate limits for unauthenticated users", async () => {
      // Mock rate limit service to return blocked
      const {
        getRateLimitService,
      } = require("../lib/services/RateLimitService");
      const mockRateLimitService = getRateLimitService();
      mockRateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 3600000,
        blocked: true,
      });

      const file = createMockFile("test.csv", "text/csv", 1024);
      const formData = createFormData(file, testCatalogId);
      const request = createMockRequest(formData);

      const response = await uploadHandler(request);
      const result = await response.json();

      expect(response.status).toBe(429);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Rate limit exceeded");
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
      expect(result.message).toBe("Internal server error");

      // Restore original method
      payload.create = originalCreate;
    });
  });

  describe("Progress Endpoint", () => {
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
      });
      testImportId = importRecord.id;
    });

    it("should return progress information", async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/import/${testImportId}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: testImportId },
      });
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
      });
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
      });
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
      });
      const result = await response.json();

      expect(result.estimatedTimeRemaining).toBeGreaterThan(0);
      expect(result.estimatedTimeRemaining).toBeLessThan(200); // Should be reasonable
    });

    it("should return 404 for non-existent import", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/import/non-existent-id/progress",
      );
      const response = await progressHandler(request, {
        params: { importId: "non-existent-id" },
      });
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
      });
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
      });

      const request = new NextRequest(
        `http://localhost:3000/api/import/${minimalImport.id}/progress`,
      );
      const response = await progressHandler(request, {
        params: { importId: minimalImport.id },
      });
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
      });
      const result = await response.json();

      expect(result.currentJob).toMatchObject({
        id: "job-123",
        status: "running",
        progress: expect.any(Number),
      });
    });
  });
});
