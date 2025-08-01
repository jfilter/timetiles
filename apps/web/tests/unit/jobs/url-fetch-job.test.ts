/**
 * Unit tests for URL Fetch Job Handler
 */

import { promises as fs } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";

// Mock dependencies
vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
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
        }),
      );

      // Verify file operations
      expect(fs.mkdir).toHaveBeenCalledWith(path.resolve(process.cwd(), "/tmp/uploads"), { recursive: true });

      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("url-"), expect.any(Buffer));

      // Verify import file was created
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          filename: expect.stringContaining("url-"),
          mimeType: "text/csv",
          filesize: mockCsvData.length,
          originalName: "data.csv",
          status: "pending",
          catalog: "catalog-123",
          user: "user-123",
        }),
      });

      // Note: The url-fetch-job doesn't update status or queue dataset-detection
      // That happens automatically via the afterChange hook in import-files collection

      // Verify result
      expect(result).toEqual({
        output: {
          success: true,
          importFileId: "import-123",
          filename: expect.stringContaining(".csv"),
          filesize: mockCsvData.length,
          mimeType: "text/csv",
          isDuplicate: false,
          attempts: 1,
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
        }),
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
        }),
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
            basicUsername: "testuser",
            basicPassword: "testpass",
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
        }),
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

      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(".xlsx"), expect.any(Buffer));

      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          originalName: "Spreadsheet Data.xlsx",
        }),
      });

      expect(result.output.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });

    it("should handle HTTP errors", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        urlFetchJob.handler({
          input: {
            sourceUrl: "https://example.com/nonexistent",
            catalogId: "catalog-123",
            originalName: "Test Import",
          },
          job: mockJob,
          req: mockReq,
        }),
      ).rejects.toThrow("HTTP 404: Not Found");
    });

    it("should handle file size limits", async () => {
      const largeSize = 101 * 1024 * 1024; // 101MB
      const mockResponse = {
        ok: true,
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": largeSize.toString(),
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new Uint8Array(1024), // Small chunk
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        urlFetchJob.handler({
          input: {
            sourceUrl: "https://example.com/large-file.csv",
            catalogId: "catalog-123",
            originalName: "Large File",
          },
          job: mockJob,
          req: mockReq,
        }),
      ).rejects.toThrow(/file.*too large/i);
    });

    it("should handle timeouts", async () => {
      // Mock a hanging fetch that times out
      const controller = new AbortController();
      (global.fetch as any).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("The operation was aborted due to timeout"));
          }, 100);
        });
      });

      await expect(
        urlFetchJob.handler({
          input: {
            sourceUrl: "https://slow-server.com/data",
            catalogId: "catalog-123",
            originalName: "Slow Import",
          },
          job: mockJob,
          req: mockReq,
        }),
      ).rejects.toThrow(/timeout/i);
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
        }),
      ).rejects.toThrow(/source.*URL/i);
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
      });
    });

    it("should update scheduled import on failure", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
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

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledImportId: "scheduled-123",
            sourceUrl: "https://example.com/error",
            catalogId: "catalog-123",
            originalName: "Failed Import",
          },
          job: mockJob,
          req: mockReq,
        }),
      ).rejects.toThrow();

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
        advancedConfig: {
          skipDuplicateCheck: false,
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
            id: "prev-import",
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

      // Should create with completed status due to duplicate
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          status: "completed",
          metadata: expect.objectContaining({
            urlFetch: expect.objectContaining({
              isDuplicate: true,
              contentHash: expect.any(String),
            }),
          }),
        }),
      });

      expect(result.output.isDuplicate).toBe(true);
    });

    it("should skip duplicate checking when configured", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        name: "Test Schedule",
        advancedConfig: {
          skipDuplicateCheck: true,
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
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          status: "pending",
          metadata: expect.objectContaining({
            urlFetch: expect.objectContaining({
              isDuplicate: false,
            }),
          }),
        }),
      });
    });

    it("should handle expected content type override", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        advancedConfig: {
          expectedContentType: "csv",
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
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "import-files",
        data: expect.objectContaining({
          mimeType: "text/csv",
          originalName: "Content Type Override.csv",
          filename: expect.stringContaining(".csv"),
        }),
      });
    });

    it("should enforce max file size limit", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        advancedConfig: {
          maxFileSize: 1, // 1MB limit
        },
      });

      const largeData = new Uint8Array(2 * 1024 * 1024); // 2MB
      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: largeData,
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledImportId: "scheduled-123",
            sourceUrl: "https://example.com/large.csv",
            catalogId: "catalog-123",
            originalName: "Large File",
          },
          job: mockJob,
          req: mockReq,
        }),
      ).rejects.toThrow(/file.*too large/i);
    });

    it("should handle retry logic", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        maxRetries: 3,
        retryDelayMinutes: 0.001, // Very short for testing
      });
      mockPayload.find.mockResolvedValue({ docs: [] }); // No previous imports

      // Fail twice, then succeed
      (global.fetch as any)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce({
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

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: "scheduled-123",
          sourceUrl: "https://example.com/retry.csv",
          catalogId: "catalog-123",
          originalName: "Retry Test",
        },
        job: mockJob,
        req: mockReq,
      });

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.output.attempts).toBe(3);
    });

    it("should respect timeout configuration", async () => {
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
        timeoutSeconds: 1, // 1 second timeout
      });

      // Mock a slow response
      let abortSignal: AbortSignal | undefined;
      (global.fetch as any).mockImplementation((url: string, options: any) => {
        abortSignal = options.signal;
        return new Promise((resolve, reject) => {
          // Simulate abort after timeout
          if (abortSignal) {
            abortSignal.addEventListener("abort", () => {
              const error = new Error("The operation was aborted due to timeout");
              error.name = "AbortError";
              reject(error);
            });
          }
          // Never resolve, wait for abort
        });
      });

      await expect(
        urlFetchJob.handler({
          input: {
            scheduledImportId: "scheduled-123",
            sourceUrl: "https://slow-server.com/data",
            catalogId: "catalog-123",
            originalName: "Timeout Test",
          },
          job: mockJob,
          req: mockReq,
        }),
      ).rejects.toThrow(/timeout/i);
    });

    it("should apply custom headers", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
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
        advancedConfig: {},
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
        }),
      );
    });

    it("should update average duration statistic", async () => {
      mockPayload.create.mockResolvedValue({ id: "import-123" });
      mockPayload.findByID.mockResolvedValue({
        id: "scheduled-123",
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

      const datasetMapping = {
        mappingType: "multiple",
        sheetMappings: [
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
        datasetMapping,
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
              mappingType: "multiple",
              sheetMappings: expect.arrayContaining([
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
      });
    });
  });
});
