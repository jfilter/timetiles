/* eslint-disable sonarjs/publicly-writable-directories */
// @vitest-environment node
/**
 *
 * Unit tests for URL Fetch Job Handler
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 */

// Import centralized logger mock
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import { mockLogger } from "@/tests/mocks/services/logger";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";

// Type definitions for urlFetchJob output
interface UrlFetchSuccessOutput {
  ingestFileId: string | number;
  filename: string;
  contentType: string;
  fileSize: number | undefined;
}

type _UrlFetchOutput = UrlFetchSuccessOutput;

// Mock dependencies
vi.mock("fs/promises", () => {
  const mock = { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) };
  return { ...mock, default: mock };
});

vi.mock("fs", () => {
  const promises = { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) };
  return { promises, default: { promises, existsSync: vi.fn().mockReturnValue(false) } };
});

// Mock app-config to prevent loadFromYaml from using the mocked fs
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({
    batchSizes: { duplicateAnalysis: 5000, schemaDetection: 10000, eventCreation: 1000, databaseChunk: 1000 },
    cache: {
      urlFetch: {
        dir: "/tmp/url-fetch-cache",
        maxSizeBytes: 104_857_600,
        defaultTtlSeconds: 3600,
        maxTtlSeconds: 2_592_000,
        respectCacheControl: true,
      },
    },
  }),
  resetAppConfig: vi.fn(),
}));

vi.mock("uuid", () => ({ v4: () => "test-uuid-1234" }));

// Mock quota service for unit tests
vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: () => ({
    checkQuota: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, remaining: 100 }),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    checkAndIncrementUsage: vi.fn().mockResolvedValue(true),
  }),
}));

// Mock fetch globally
globalThis.fetch = vi.fn();

// Helper to create a proper fetch mock response
const createMockResponse = (
  data: string | Buffer,
  options: { status?: number; contentType?: string; headers?: Record<string, string> } = {}
) => {
  const dataBuffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const headers = new Headers({
    "content-type": options.contentType ?? "application/octet-stream",
    "content-length": dataBuffer.length.toString(),
    ...options.headers,
  });

  return {
    ok: options.status ? options.status >= 200 && options.status < 300 : true,
    status: options.status ?? 200,
    statusText: "OK",
    headers,
    arrayBuffer: vi.fn().mockResolvedValue(dataBuffer.buffer),
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValueOnce({ done: false, value: dataBuffer }).mockResolvedValueOnce({ done: true }),
      }),
    },
  };
};

describe.sequential("urlFetchJob", () => {
  let mockPayload: any;
  let mockJob: any;
  let mockReq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // Reset environment
    process.env.UPLOAD_DIR = "/tmp/uploads";

    // Reset global fetch mock
    (globalThis.fetch as any) = vi.fn();

    // Setup mock payload with fresh mocks
    mockPayload = {
      find: vi.fn(),
      findByID: vi.fn().mockResolvedValue(null), // Default to no user found
      create: vi.fn(),
      update: vi.fn(),
      jobs: { queue: vi.fn().mockResolvedValue({ id: "dataset-job-123" }) },
    };

    // Setup mock job
    mockJob = { id: "job-123" };

    // Setup mock request
    mockReq = { payload: mockPayload };
  });

  describe("handler", () => {
    it("should fetch data from URL and save to file", async () => {
      // Create mock import file record first
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      // Mock user lookup
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });

      // Mock fetch response
      const mockCsvData = "id,name,value\n1,test,100\n2,test2,200";
      const mockResponse = createMockResponse(mockCsvData, { contentType: "text/csv" });
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Execute job with direct parameters
      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/data.csv",
          authConfig: { type: "none" },
          catalogId: "catalog-123",
          originalName: "data.csv",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      // Verify fetch was called correctly
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://example.com/data.csv",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ "User-Agent": "TimeTiles/1.0 (Data Import Service)" }),
        })
      );

      // Verify import file was created
      expect(mockPayload.create).toHaveBeenCalled();
      const ingestFileCall = mockPayload.create.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).collection === "ingest-files"
      );
      expect(ingestFileCall).toBeDefined();

      // url-fetch no longer queues manual-ingest — the parent workflow
      // (scheduled-ingest or scraper-ingest) handles dataset-detection directly.
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();

      // Verify result
      expect(result).toEqual({
        output: {
          ingestFileId: "import-123",
          filename: expect.stringContaining(".csv"),
          contentHash: expect.any(String),
          isDuplicate: false,
          contentType: "text/csv",
          fileSize: mockCsvData.length,
        },
      });
    });

    it("should handle API key authentication", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });

      const mockResponse = createMockResponse("{}", { contentType: "application/json" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Handler may throw on empty JSON body — we only care that fetch was called with correct headers
      try {
        await urlFetchJob.handler({
          input: {
            sourceUrl: "https://api.example.com/data",
            authConfig: { type: "api-key", apiKey: TEST_CREDENTIALS.apiKey.secretKey, apiKeyHeader: "X-API-Key" },
            catalogId: "catalog-123",
            originalName: "api-data.json",
            userId: "user-123",
          },
          job: mockJob,
          req: mockReq,
        });
      } catch {
        // Expected — empty JSON body can't be parsed as records
      }

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({ "X-API-Key": TEST_CREDENTIALS.apiKey.secretKey }),
        })
      );
    });

    it("should handle Bearer token authentication", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });

      const mockResponse = createMockResponse("{}", { contentType: "application/json" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Handler may throw on empty JSON body — we only care that fetch was called with correct headers
      try {
        await urlFetchJob.handler({
          input: {
            sourceUrl: "https://api.example.com/data",
            authConfig: { type: "bearer", bearerToken: TEST_CREDENTIALS.bearer.tokenAbc },
            catalogId: "catalog-123",
            originalName: "Bearer Import",
            userId: "user-123",
          },
          job: mockJob,
          req: mockReq,
        });
      } catch {
        // Expected — empty JSON body can't be parsed as records
      }

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.tokenAbc}` }),
        })
      );
    });

    it("should handle Basic authentication", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });

      const mockResponse = createMockResponse("test data", { contentType: "text/plain" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          sourceUrl: "https://api.example.com/data",
          authConfig: {
            type: "basic",
            username: TEST_CREDENTIALS.basic.username,
            password: TEST_CREDENTIALS.basic.password,
          },
          catalogId: "catalog-123",
          originalName: "Basic Import",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      const expectedAuth = `Basic ${Buffer.from("testuser:testpass").toString("base64")}`;
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: expectedAuth }) })
      );
    });

    it("should detect file type from Content-Type header", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });

      const mockResponse = createMockResponse("{}", {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/data",
          catalogId: "catalog-123",
          originalName: "Spreadsheet Data",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "ingest-files",
          data: expect.objectContaining({ originalName: "Spreadsheet Data" }),
          file: expect.objectContaining({
            mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          user: expect.objectContaining({ id: "user-123" }),
        })
      );

      const successOutput = result.output as UrlFetchSuccessOutput;
      expect(successOutput.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });

    it("should handle HTTP errors", async () => {
      // Mock scheduled ingest with no retries
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: { maxRetries: 0, retryDelayMinutes: 0.0001 },
        statistics: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 },
      });
      mockPayload.update.mockResolvedValue({});

      (globalThis.fetch as any).mockRejectedValue(new Error("HTTP 404: Not Found"));

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://example.com/nonexistent",
            catalogId: "catalog-123",
            originalName: "Test Import",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow("HTTP 404: Not Found");
    });

    it("should handle file size limits", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: { maxRetries: 0, retryDelayMinutes: 0.0001 },
        statistics: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 },
      });
      mockPayload.update.mockResolvedValue({});

      const largeSize = 101 * 1024 * 1024; // 101MB

      (globalThis.fetch as any).mockRejectedValue(new Error(`File too large: ${largeSize} bytes`));

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://example.com/large-file.csv",
            catalogId: "catalog-123",
            originalName: "Large File",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow();
    });

    it("should handle timeouts", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: { maxRetries: 0, retryDelayMinutes: 0.0001 },
        statistics: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 },
      });
      mockPayload.update.mockResolvedValue({});

      // Mock a timeout error
      (globalThis.fetch as any).mockRejectedValue(new Error("Request timeout after 30000ms"));

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://slow-server.com/data",
            catalogId: "catalog-123",
            originalName: "Slow Import",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow(/timeout/i);
    });

    it("should handle missing source URL", async () => {
      await expect(
        urlFetchJob.handler({
          input: { sourceUrl: "", catalogId: "catalog-123", originalName: "Empty URL" },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow("Source URL is required");
    });

    it("should handle scheduled ingest metadata", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      // Return user for all findByID calls (scheduled ingest lookup returns null, job uses input directly)
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = createMockResponse("data", { contentType: "text/csv" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Use direct input parameters instead of relying on scheduled ingest lookup
      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/scheduled-data.csv",
          catalogId: "catalog-123",
          originalName: "scheduled ingest",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(result.output.ingestFileId).toBeDefined();
      expect(mockPayload.create).toHaveBeenCalled();
      const createCall = mockPayload.create.mock.calls[0][0];
      expect(createCall.collection).toBe("ingest-files");
      expect(createCall.data.originalName).toBe("scheduled ingest");
      expect(createCall.user.id).toBe("user-123");
    });

    it("should update scheduled ingest on failure", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
        statistics: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const errorResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({ "content-type": "text/plain" }),
        arrayBuffer: vi.fn().mockRejectedValue(new Error("HTTP 500")),
      };
      (globalThis.fetch as any).mockResolvedValue(errorResponse);

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://example.com/error",
            catalogId: "catalog-123",
            originalName: "Failed Import",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow("HTTP 500");

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "scheduled-ingests",
          id: "scheduled-123",
          data: expect.objectContaining({
            lastStatus: "failed",
            lastError: "HTTP 500",
            currentRetries: 1,
            statistics: expect.objectContaining({ totalRuns: 1, failedRuns: 1, averageDuration: expect.any(Number) }),
          }),
          req: expect.any(Object),
        })
      );
    });
  });

  describe("Advanced Features", () => {
    it("should handle duplicate checking", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "Test Schedule",
        enabled: true,
        advancedOptions: { skipDuplicateChecking: false },
        retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
      });

      // Add find method to mockPayload if it doesn't exist
      mockPayload.find ??= vi.fn();

      // Mock previous successful import with same content hash
      // The hash for "data" is:
      const expectedHash = "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7";
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "existing-ingest-file-999",
            filename: "existing-file.csv",
            metadata: { urlFetch: { contentHash: expectedHash } },
          },
        ],
      });

      const mockData = "data";
      const mockResponse = createMockResponse(mockData, { contentType: "text/csv" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Duplicate Check",
        },
        job: mockJob,
        req: mockReq,
      });

      // When duplicate is detected, no new file is created
      expect(mockPayload.create).not.toHaveBeenCalled();

      // Result should indicate success with existing file ID
      const successOutput = result.output as UrlFetchSuccessOutput;
      expect(successOutput.ingestFileId).toBe("existing-ingest-file-999");
    });

    it("should skip duplicate checking when configured", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID
        .mockResolvedValueOnce({
          id: "scheduled-123",
          name: "Test Schedule",
          enabled: true,
          advancedOptions: { skipDuplicateChecking: true },
          retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
          createdBy: "user-123",
          catalog: "catalog-123",
        })
        .mockResolvedValue({ id: "user-123", role: "user" }); // Use mockResolvedValue for all subsequent calls

      const mockResponse = createMockResponse("data", { contentType: "text/csv" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Skip Duplicate Check",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should not call find to check for duplicates
      expect(mockPayload.find).not.toHaveBeenCalled();

      // Just verify it was called with the ingest-files collection
      expect(mockPayload.create).toHaveBeenCalled();
      const createCall = mockPayload.create.mock.calls[0][0];
      expect(createCall.collection).toBe("ingest-files");
      expect(createCall.data.status).toBe("pending");
      expect(createCall.file).toBeDefined();
    });

    it("should handle expected content type override", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID
        .mockResolvedValueOnce({
          id: "scheduled-123",
          enabled: true,
          advancedOptions: { expectedContentType: "csv" },
          retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
          createdBy: "user-123",
          catalog: "catalog-123",
        })
        .mockResolvedValue({ id: "user-123", role: "user" }); // Use mockResolvedValue for all subsequent calls
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      // Server returns generic content type
      const mockResponse = createMockResponse("id,name\n1,test", { contentType: "application/octet-stream" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data",
          catalogId: "catalog-123",
          originalName: "Content Type Override",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should use expected content type
      // Just verify it was called correctly
      expect(mockPayload.create).toHaveBeenCalled();
      const createCall = mockPayload.create.mock.calls[0][0];
      expect(createCall.collection).toBe("ingest-files");
      expect(createCall.data.originalName).toBe("Content Type Override");
      expect(createCall.file.mimetype).toBe("text/csv");
    });

    it("should enforce max file size limit", async () => {
      // Setup scheduled ingest with max file size limit
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        advancedOptions: {
          maxFileSizeMB: 100, // 100MB limit
        },
        retryConfig: { maxRetries: 0 },
      });

      // File size limit is enforced at 100MB — the handler checks Content-Length
      // headers and rejects immediately without reading the body.
      // No need for a real 101MB buffer; a small one with a large content-length header suffices.
      const mockResponse = createMockResponse("small body", {
        contentType: "text/csv",
        headers: { "content-length": String(101 * 1024 * 1024) },
      });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://example.com/large.csv",
            catalogId: "catalog-123",
            originalName: "Large File",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow();
    });

    it("should handle retry logic", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      // Return user for all findByID calls
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      // Fail twice, then succeed
      let callCount = 0;
      (globalThis.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error(`Attempt ${callCount} failed`));
        }
        return Promise.resolve(createMockResponse("data", { contentType: "text/csv" }));
      });

      // Use direct input with no scheduledIngestId so retry config is not loaded
      // The default retry behavior will retry on failure
      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/retry.csv",
          catalogId: "catalog-123",
          originalName: "Retry Test",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      // With default retry config, it should retry and eventually succeed
      expect(callCount).toBeGreaterThan(1);
      expect(result.output.ingestFileId).toBeDefined();
    });

    it("should respect timeout configuration", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        advancedOptions: {
          timeoutMinutes: 0.0001, // Very short timeout
        },
        retryConfig: { maxRetries: 0, retryDelayMinutes: 0.0001 },
      });

      // Mock a timeout error directly
      (globalThis.fetch as any).mockRejectedValue(new Error("Request timeout after 6ms"));

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://slow-server.com/data",
            catalogId: "catalog-123",
            originalName: "Timeout Test",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow(/timeout/i);
    });

    it("should apply custom headers", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        authConfig: {
          type: "api-key",
          apiKey: TEST_CREDENTIALS.apiKey.shortSecretKey,
          apiKeyHeader: "X-API-Key",
          customHeaders: JSON.stringify({
            "X-Custom-Header": "custom-value",
            "Accept-Language": "en-US",
            "X-Request-ID": "12345",
          }),
        },
        advancedOptions: {},
        retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = createMockResponse("{}", { contentType: "application/json" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Handler may throw on empty JSON body — we only care that fetch was called with correct headers
      try {
        await urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://api.example.com/data",
            catalogId: "catalog-123",
            originalName: "Custom Headers Test",
          },
          job: mockJob,
          req: mockReq,
        });
      } catch {
        // Expected — empty JSON body can't be parsed as records
      }

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": TEST_CREDENTIALS.apiKey.shortSecretKey,
            "X-Custom-Header": "custom-value",
            "Accept-Language": "en-US",
            "X-Request-ID": "12345",
          }),
        })
      );
    });

    it("should update average duration statistic", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID
        .mockResolvedValueOnce({
          id: "scheduled-123",
          enabled: true,
          retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
          statistics: {
            totalRuns: 2,
            successfulRuns: 2,
            failedRuns: 0,
            averageDuration: 3500, // Previous average in milliseconds
          },
          createdBy: "user-123",
          catalog: "catalog-123",
        })
        .mockResolvedValue({ id: "user-123", role: "user" }); // Use mockResolvedValue for all subsequent calls
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = createMockResponse("data", { contentType: "text/csv" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Mock timing to get consistent duration
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime) // Start time
        .mockReturnValue(startTime + 2000); // End time (2000 ms later)

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Duration Test",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should update with new average: (3500 * 2 + 2000) / 3 = 3000
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-ingests",
        id: "scheduled-123",
        data: expect.objectContaining({
          statistics: expect.objectContaining({ totalRuns: 3, successfulRuns: 3, averageDuration: 3000 }),
        }),
      });

      vi.spyOn(Date, "now").mockRestore();
    });

    it("should not call logError when scheduled ingest is disabled", async () => {
      // Bug: loadScheduledIngestConfig throws "disabled" inside try block,
      // which is caught and logged via logError — treating expected behavior as an error
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: false, // Disabled — this is expected, not an error
        statistics: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 },
      });

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledIngestId: "scheduled-123",
            sourceUrl: "https://example.com/data.csv",
            catalogId: "catalog-123",
            originalName: "Disabled Import",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow(/disabled/i);

      // logError should NOT be called — disabled is expected behavior, not an error
      expect(mockLogger.logError).not.toHaveBeenCalled();
    });

    it("should not dilute averageDuration with zero when duplicate is detected", async () => {
      // Bug: handleDuplicateCheck calls updateScheduledIngestSuccess with duration=0,
      // which progressively dilutes the averageDuration toward 0 with each duplicate
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        advancedOptions: { skipDuplicateChecking: false },
        retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
        statistics: {
          totalRuns: 1,
          successfulRuns: 1,
          failedRuns: 0,
          averageDuration: 10000, // 10000 ms average
        },
        catalog: "catalog-123",
        createdBy: "user-123",
      });

      // Mock existing file with matching hash (hash of "data")
      const expectedHash = "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7";
      mockPayload.find.mockResolvedValue({
        docs: [
          { id: "existing-file-999", filename: "existing.csv", metadata: { urlFetch: { contentHash: expectedHash } } },
        ],
      });

      const mockResponse = createMockResponse("data", { contentType: "text/csv" });
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      // Mock timing: job takes 2 seconds
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime) // Start time in handler
        .mockReturnValue(startTime + 2000); // All subsequent calls: 2 seconds later

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Duplicate Duration Test",
        },
        job: mockJob,
        req: mockReq,
      });

      vi.spyOn(Date, "now").mockRestore();

      // Verify that update was called
      expect(mockPayload.update).toHaveBeenCalled();
      const updateCall = mockPayload.update.mock.calls.find((call: any) => call[0]?.collection === "scheduled-ingests");
      expect(updateCall).toBeDefined();

      // The duration in executionHistory should NOT be 0
      const executionEntry = updateCall[0].data.executionHistory[0];
      expect(executionEntry.duration).toBeGreaterThan(0);

      // The averageDuration should incorporate real time, not be diluted by 0
      // Previous: 10000 ms avg over 1 run. With 2000 ms real duration: (10000 + 2000) / 2 = 6000
      // Bug would give: (10000 + 0) / 2 = 5000
      const stats = updateCall[0].data.statistics;
      expect(stats.averageDuration).toBeGreaterThan(5000);
    });

    it("should defer scheduled-ingest success updates when the parent workflow owns lifecycle state", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockImplementation(({ collection, id }: { collection: string; id: string }) => {
        if (collection === "scheduled-ingests") {
          return {
            id,
            name: "Deferred Lifecycle Schedule",
            enabled: true,
            advancedOptions: { skipDuplicateChecking: true },
            retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
            statistics: { totalRuns: 1, successfulRuns: 1, failedRuns: 0, averageDuration: 1000 },
            createdBy: "user-123",
            catalog: "catalog-123",
          };
        }

        return { id: "user-123", role: "user" };
      });

      const mockResponse = createMockResponse("id,name\n1,test", { contentType: "text/csv" });
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Deferred Lifecycle Import",
          deferLifecycleUpdates: true,
        },
        job: mockJob,
        req: mockReq,
      });

      expect(result.output.ingestFileId).toBe("import-123");
      expect(mockPayload.update.mock.calls.find((call: any) => call[0]?.collection === "scheduled-ingests")).toBeUndefined();
    });

    it("should defer duplicate scheduled-ingest updates when the parent workflow owns lifecycle state", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "Deferred Duplicate Schedule",
        enabled: true,
        advancedOptions: { skipDuplicateChecking: false },
        retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
        statistics: { totalRuns: 1, successfulRuns: 1, failedRuns: 0, averageDuration: 1000 },
        catalog: "catalog-123",
        createdBy: "user-123",
      });

      const expectedHash = "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7";
      mockPayload.find.mockResolvedValue({
        docs: [
          { id: "existing-file-999", filename: "existing.csv", metadata: { urlFetch: { contentHash: expectedHash } } },
        ],
      });

      const mockResponse = createMockResponse("data", { contentType: "text/csv" });
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Deferred Duplicate Import",
          deferLifecycleUpdates: true,
        },
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.create).not.toHaveBeenCalled();
      expect(result.output).toEqual(
        expect.objectContaining({
          ingestFileId: "existing-file-999",
          isDuplicate: true,
        })
      );
      expect(mockPayload.update.mock.calls.find((call: any) => call[0]?.collection === "scheduled-ingests")).toBeUndefined();
    });

    it("should pass through dataset mapping configuration", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });

      const multiSheetConfig = {
        enabled: true,
        sheets: [
          { sheetIdentifier: "Sheet1", dataset: "dataset-123", skipIfMissing: false },
          { sheetIdentifier: "Sheet2", dataset: "dataset-456", skipIfMissing: true },
        ],
      };

      mockPayload.findByID
        .mockResolvedValueOnce({
          id: "scheduled-123",
          name: "Dataset Mapping Import",
          enabled: true,
          retryConfig: { maxRetries: 1, retryDelayMinutes: 0.0001 },
          multiSheetConfig,
          createdBy: "user-123",
          catalog: "catalog-123",
        })
        .mockResolvedValue({ id: "user-123", role: "user" }); // Use mockResolvedValue for all subsequent calls
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = createMockResponse("test data", { contentType: "text/csv" });

      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Dataset Mapping Test",
        },
        job: mockJob,
        req: mockReq,
      });

      // Verify the import file was created with dataset mapping metadata
      expect(mockPayload.create).toHaveBeenCalled();
      const createCall = mockPayload.create.mock.calls[0][0];
      expect(createCall.collection).toBe("ingest-files");
      expect(createCall.data.metadata.datasetMapping.mappingType).toBe("multiple");
      expect(createCall.data.metadata.datasetMapping.sheetMappings).toHaveLength(2);
      expect(createCall.data.metadata.datasetMapping.sheetMappings[0].sheetIdentifier).toBe("Sheet1");
      expect(createCall.data.metadata.datasetMapping.sheetMappings[1].sheetIdentifier).toBe("Sheet2");
      expect(createCall.user.id).toBe("user-123");
    });
  });

  describe("no double dataset-detection", () => {
    it("should not queue manual-ingest workflow (parent workflow handles detection)", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-456" });
      mockPayload.findByID.mockImplementation(({ collection, id }: { collection: string; id: string }) => {
        if (collection === "scheduled-ingests") {
          return {
            id,
            name: "Test Schedule",
            sourceUrl: "https://example.com/data.csv",
            enabled: true,
            createdBy: "user-123",
            dataset: 10,
          };
        }
        return { id: "user-123", role: "user" };
      });

      const mockResponse = createMockResponse("id,name\n1,test", { contentType: "text/csv" });
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: "schedule-1",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-1",
          originalName: "Test Import",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      // url-fetch must NOT queue any workflow — the parent workflow
      // (scheduled-ingest / scraper-ingest) runs dataset-detection itself.
      // Queuing manual-ingest here would cause duplicate ingest jobs.
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("should create ingest file with skipIngestFileHooks to prevent afterChange hook", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-789" });
      mockPayload.findByID.mockResolvedValue({ id: "user-123", role: "user" });

      const mockResponse = createMockResponse("id,name\n1,test", { contentType: "text/csv" });
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-1",
          originalName: "Test Import",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      // The ingest file must be created with skipIngestFileHooks context
      // to prevent the afterChange hook from also queuing manual-ingest.
      const createCall = mockPayload.create.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).collection === "ingest-files"
      );
      expect(createCall).toBeDefined();
      const createArg = createCall![0] as Record<string, unknown>;
      const context = createArg.context as Record<string, unknown>;
      expect(context.skipIngestFileHooks).toBe(true);
    });
  });
});
