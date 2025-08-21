/* eslint-disable sonarjs/publicly-writable-directories */
// @vitest-environment node
/**
 *
 * Unit tests for URL Fetch Job Handler
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";

// Type definitions for urlFetchJob output
interface UrlFetchSuccessOutput {
  success: true;
  importFileId: string | number;
  filename: string;
  contentType: string;
  fileSize: number | undefined;
}

interface UrlFetchFailureOutput {
  success: false;
  error: string;
}

type _UrlFetchOutput = UrlFetchSuccessOutput | UrlFetchFailureOutput;

// Mock dependencies
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
  createRequestLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe.sequential("urlFetchJob", () => {
  let mockPayload: any;
  let mockJob: any;
  let mockReq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // Reset environment
    process.env.UPLOAD_DIR_IMPORT_FILES = "/tmp/uploads";

    // Reset global fetch mock
    (global.fetch as any) = vi.fn();

    // Setup mock payload with fresh mocks
    mockPayload = {
      find: vi.fn(),
      findByID: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      jobs: {
        queue: vi.fn().mockResolvedValue({ id: "dataset-job-123" }),
      },
    };

    // Setup mock job
    mockJob = {
      id: "job-123",
    };

    // Setup mock request
    mockReq = {
      payload: mockPayload,
    };
  });

  describe("handler", () => {
    it("should fetch data from URL and save to file", async () => {
      // Create mock import file record first
      mockPayload.create.mockResolvedValue({ id: "import-123" });

      // Mock fetch response
      const mockCsvData = "id,name,value\n1,test,100\n2,test2,200";
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": mockCsvData.length.toString(),
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockCsvData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

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
      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/data.csv",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "User-Agent": "TimeTiles/1.0 (Data Import Service)",
          }),
        })
      );

      // Verify import file was created with file upload
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          originalName: "data.csv",
          status: "pending",
          catalog: "catalog-123",
          user: "user-123",
          metadata: expect.objectContaining({
            urlFetch: expect.objectContaining({
              sourceUrl: "https://example.com/data.csv",
              contentHash: expect.any(String),
              isDuplicate: false,
            }),
          }),
        }),
        file: expect.objectContaining({
          data: expect.any(Buffer),
          mimetype: "text/csv",
          name: expect.stringContaining(".csv"),
          size: mockCsvData.length,
        }),
      });

      // Verify dataset detection was queued
      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "dataset-detection",
        input: {
          importFileId: "import-123",
        },
      });

      // Verify result
      expect(result).toEqual({
        output: {
          success: true,
          importFileId: "import-123",
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

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("{}"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          sourceUrl: "https://api.example.com/data",
          authConfig: {
            type: "api-key",
            apiKey: "secret-key-123",
            apiKeyHeader: "X-API-Key",
          },
          catalogId: "catalog-123",
          originalName: "api-data.json",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": "secret-key-123",
          }),
        })
      );
    });

    it("should handle Bearer token authentication", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("{}"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          sourceUrl: "https://api.example.com/data",
          authConfig: {
            type: "bearer",
            bearerToken: "token-abc-123",
          },
          catalogId: "catalog-123",
          originalName: "Bearer Import",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token-abc-123",
          }),
        })
      );
    });

    it("should handle Basic authentication", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("test data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          sourceUrl: "https://api.example.com/data",
          authConfig: {
            type: "basic",
            username: "testuser",
            password: "testpass",
          },
          catalogId: "catalog-123",
          originalName: "Basic Import",
          userId: "user-123",
        },
        job: mockJob,
        req: mockReq,
      });

      const expectedAuth = `Basic ${Buffer.from("testuser:testpass").toString("base64")}`;
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expectedAuth,
          }),
        })
      );
    });

    it("should detect file type from Content-Type header", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });

      const mockExcelData = new ArrayBuffer(100);
      const mockResponse = {
        ok: true,
        headers: new Headers({
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new Uint8Array(mockExcelData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/data",
          catalogId: "catalog-123",
          originalName: "Spreadsheet Data",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          originalName: "Spreadsheet Data",
        }),
        file: expect.objectContaining({
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          name: expect.stringContaining(".xlsx"),
        }),
      });

      const successOutput = result.output as UrlFetchSuccessOutput;
      expect(successOutput.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });

    it("should handle HTTP errors", async () => {
      // Mock scheduled import with no retries
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: {
          maxRetries: 0,
          retryDelayMinutes: 0.0001,
        },
        statistics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
        },
      });
      mockPayload.update.mockResolvedValue({});

      (global.fetch as any).mockRejectedValue(new Error("HTTP 404: Not Found"));

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/nonexistent",
          catalogId: "catalog-123",
          originalName: "Test Import",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should return failure output instead of throwing
      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toBe("HTTP 404: Not Found");
    });

    it("should handle file size limits", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: {
          maxRetries: 0,
          retryDelayMinutes: 0.0001,
        },
        statistics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
        },
      });
      mockPayload.update.mockResolvedValue({});

      const largeSize = 101 * 1024 * 1024; // 101MB

      (global.fetch as any).mockRejectedValue(new Error(`File too large: ${largeSize} bytes`));

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/large-file.csv",
          catalogId: "catalog-123",
          originalName: "Large File",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should return failure output instead of throwing
      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toMatch(/too large/i);
    });

    it("should handle timeouts", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: {
          maxRetries: 0,
          retryDelayMinutes: 0.0001,
        },
        statistics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
        },
      });
      mockPayload.update.mockResolvedValue({});

      // Mock a timeout error
      (global.fetch as any).mockRejectedValue(new Error("Request timeout after 30000ms"));

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://slow-server.com/data",
          catalogId: "catalog-123",
          originalName: "Slow Import",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should return failure output instead of throwing
      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toMatch(/timeout/i);
    });

    it("should handle missing source URL", async () => {
      await expect(
        urlFetchJob.handler({
          input: {
            sourceUrl: "",
            catalogId: "catalog-123",
            originalName: "Empty URL",
          },
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow("Source URL is required");
    });

    it("should handle scheduled import metadata", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "My Scheduled Import",
        cronExpression: "0 0 * * *",
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/scheduled-data.csv",
          catalogId: "catalog-123",
          originalName: "Scheduled Import",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            scheduledExecution: expect.objectContaining({
              scheduledImportId: "scheduled-123",
            }),
          }),
        }),
        file: expect.objectContaining({
          data: expect.any(Buffer),
          mimetype: expect.any(String),
          name: expect.any(String),
        }),
      });
    });

    it("should update scheduled import on failure", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
        statistics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
        },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/error",
          catalogId: "catalog-123",
          originalName: "Failed Import",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should return failure output instead of throwing
      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toBe("HTTP 500: Internal Server Error");

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "scheduled-123",
        data: expect.objectContaining({
          lastStatus: "failed",
          lastError: "HTTP 500: Internal Server Error",
          currentRetries: 1,
          statistics: expect.objectContaining({
            totalRuns: 1,
            failedRuns: 1,
            averageDuration: expect.any(Number),
          }),
        }),
      });
    });
  });

  describe("Advanced Features", () => {
    it("should handle duplicate checking", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "Test Schedule",
        enabled: true,
        advancedOptions: {
          skipDuplicateChecking: false,
        },
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
      });

      // Add find method to mockPayload if it doesn't exist
      if (!mockPayload.find) {
        mockPayload.find = vi.fn();
      }

      // Mock previous successful import with same content hash
      // The hash for "data" is:
      const expectedHash = "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7";
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: "existing-import-file-999",
            filename: "existing-file.csv",
            metadata: {
              urlFetch: {
                contentHash: expectedHash,
              },
            },
          },
        ],
      });

      const mockData = "data";
      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
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
      expect(result.output.success).toBe(true);
      if (result.output.success === true) {
        const successOutput = result.output as UrlFetchSuccessOutput;
        expect(successOutput.importFileId).toBe("existing-import-file-999");
      }
    });

    it("should skip duplicate checking when configured", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "Test Schedule",
        enabled: true,
        advancedOptions: {
          skipDuplicateChecking: true,
        },
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
      });

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Skip Duplicate Check",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should not call find to check for duplicates
      expect(mockPayload.find).not.toHaveBeenCalled();

      // Just verify it was called with the import-files collection
      expect(mockPayload.create).toHaveBeenCalled();
      const createCall = mockPayload.create.mock.calls[0][0];
      expect(createCall.collection).toBe("import-files");
      expect(createCall.data.status).toBe("pending");
      expect(createCall.file).toBeDefined();
    });

    it("should handle expected content type override", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        advancedOptions: {
          expectedContentType: "csv",
        },
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      // Server returns generic content type
      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/octet-stream" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("id,name\n1,test"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
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
      expect(createCall.collection).toBe("import-files");
      expect(createCall.data.originalName).toBe("Content Type Override");
      expect(createCall.file.mimetype).toBe("text/csv");
    });

    it("should enforce max file size limit", async () => {
      // File size limit is enforced at 100MB by default in fetchUrlData
      const largeSize = 101 * 1024 * 1024; // 101MB - exceeds 100MB limit

      // Use fake timers from the start to control all async operations
      vi.useFakeTimers();

      // Mock fetch to return a response with large content-length header
      // This will cause fetchUrlData to throw immediately when it checks the header
      const mockResponse = {
        ok: true,
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": largeSize.toString(),
        }),
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true }),
          }),
        },
      };

      // All retry attempts will fail with the same error
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Create the promise and handle it properly
      const handlerPromise = urlFetchJob.handler({
        input: {
          sourceUrl: "https://example.com/large.csv",
          catalogId: "catalog-123",
          originalName: "Large File",
        },
        job: mockJob,
        req: mockReq,
      });

      // Fast-forward through all retry delays
      await vi.runAllTimersAsync();

      // Wait for the result
      const result = await handlerPromise;

      // Should return failure output instead of throwing
      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toMatch(/too large/i);

      // Clean up timers
      vi.useRealTimers();
    });

    it("should handle retry logic", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        retryConfig: {
          maxRetries: 3,
          retryDelayMinutes: 0.00001, // Very short for testing (0.6ms)
        },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      // Use fake timers for this test
      vi.useFakeTimers();

      // Fail twice, then succeed
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error(`Attempt ${callCount} failed`));
        }
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "text/csv" }),
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode("data"),
                })
                .mockResolvedValueOnce({ done: true }),
            }),
          },
        });
      });

      const handlerPromise = urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/retry.csv",
          catalogId: "catalog-123",
          originalName: "Retry Test",
        },
        job: mockJob,
        req: mockReq,
      });

      // Fast-forward through retries
      await vi.runAllTimersAsync();

      const result = await handlerPromise;

      expect(callCount).toBe(3);
      expect(result.output.success).toBe(true);

      vi.useRealTimers();
    });

    it("should respect timeout configuration", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        advancedOptions: {
          timeoutMinutes: 0.0001, // Very short timeout
        },
        retryConfig: {
          maxRetries: 0,
          retryDelayMinutes: 0.0001,
        },
      });

      // Mock a timeout error directly
      (global.fetch as any).mockRejectedValue(new Error("Request timeout after 6ms"));

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://slow-server.com/data",
          catalogId: "catalog-123",
          originalName: "Timeout Test",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should return failure output instead of throwing
      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toMatch(/timeout/i);
    });

    it("should apply custom headers", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        authConfig: {
          type: "api-key",
          apiKey: "secret-key",
          apiKeyHeader: "X-API-Key",
          customHeaders: JSON.stringify({
            "X-Custom-Header": "custom-value",
            "Accept-Language": "en-US",
            "X-Request-ID": "12345",
          }),
        },
        advancedOptions: {},
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("{}"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://api.example.com/data",
          catalogId: "catalog-123",
          originalName: "Custom Headers Test",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": "secret-key",
            "X-Custom-Header": "custom-value",
            "Accept-Language": "en-US",
            "X-Request-ID": "12345",
          }),
        })
      );
    });

    it("should update average duration statistic", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        enabled: true,
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
        statistics: {
          totalRuns: 2,
          successfulRuns: 2,
          failedRuns: 0,
          averageDuration: 3.5, // Previous average
        },
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      // Mock timing to get consistent duration
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime) // Start time
        .mockReturnValue(startTime + 2000); // End time (2 seconds later)

      await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Duration Test",
        },
        job: mockJob,
        req: mockReq,
      });

      // Should update with new average: (3.5 * 2 + 2) / 3 = 3
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "scheduled-123",
        data: expect.objectContaining({
          statistics: expect.objectContaining({
            totalRuns: 3,
            successfulRuns: 3,
            averageDuration: 3,
          }),
        }),
      });

      vi.spyOn(Date, "now").mockRestore();
    });

    it("should pass through dataset mapping configuration", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });

      const multiSheetConfig = {
        enabled: true,
        sheets: [
          {
            sheetIdentifier: "Sheet1",
            dataset: "dataset-123",
            skipIfMissing: false,
          },
          {
            sheetIdentifier: "Sheet2",
            dataset: "dataset-456",
            skipIfMissing: true,
          },
        ],
      };

      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "Dataset Mapping Import",
        enabled: true,
        retryConfig: {
          maxRetries: 1,
          retryDelayMinutes: 0.0001,
        },
        multiSheetConfig,
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("test data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/data.csv",
          catalogId: "catalog-123",
          originalName: "Dataset Mapping Test",
        },
        job: mockJob,
        req: mockReq,
      });

      // Verify the import file was created with dataset mapping metadata
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            datasetMapping: expect.objectContaining({
              enabled: true,
              sheets: expect.arrayContaining([
                expect.objectContaining({
                  sheetIdentifier: "Sheet1",
                  dataset: "dataset-123",
                  skipIfMissing: false,
                }),
                expect.objectContaining({
                  sheetIdentifier: "Sheet2",
                  dataset: "dataset-456",
                  skipIfMissing: true,
                }),
              ]),
            }),
          }),
        }),
        file: expect.objectContaining({
          data: expect.any(Buffer),
          mimetype: expect.any(String),
          name: expect.any(String),
        }),
      });
    });
  });
});
