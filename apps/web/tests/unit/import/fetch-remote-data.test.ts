/**
 * Unit tests for the unified remote data fetching service.
 *
 * Tests fetchRemoteData for CSV pass-through, JSON auto-detection and
 * conversion, explicit responseFormat handling, unsupported file types,
 * cache option forwarding, paginated JSON fetching, and hash computation.
 *
 * @module
 * @category Tests
 */

// 1. Centralized logger mock (before source code)
import "@/tests/mocks/services/logger";

// 2. vi.hoisted for mock values needed in vi.mock factories
const mocks = vi.hoisted(() => ({
  fetchWithRetry: vi.fn(),
  calculateDataHash: vi.fn().mockReturnValue("test-hash"),
  buildAuthHeaders: vi.fn().mockReturnValue({}),
  fetchPaginated: vi.fn(),
}));

// 3. vi.mock calls
vi.mock("@/lib/jobs/handlers/url-fetch-job/auth", () => ({ buildAuthHeaders: mocks.buildAuthHeaders }));

vi.mock("@/lib/jobs/handlers/url-fetch-job/fetch-utils", () => ({
  fetchWithRetry: mocks.fetchWithRetry,
  calculateDataHash: mocks.calculateDataHash,
}));

vi.mock("@/lib/jobs/handlers/url-fetch-job/paginated-fetch", () => ({ fetchPaginated: mocks.fetchPaginated }));

// 4. Vitest imports and source code
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRemoteData, type FetchRemoteDataOptions } from "@/lib/import/fetch-remote-data";

/** Helper to create a mock fetchWithRetry result for CSV content. */
const mockCsvFetchResult = (csvContent: string) => {
  const data = Buffer.from(csvContent, "utf-8");
  return { data, contentType: "text/csv", contentLength: data.length, fileExtension: ".csv", attempts: 1 };
};

/** Helper to create a mock fetchWithRetry result for JSON content. */
const mockJsonFetchResult = (jsonValue: unknown) => {
  const data = Buffer.from(JSON.stringify(jsonValue), "utf-8");
  return { data, contentType: "application/json", contentLength: data.length, fileExtension: ".json", attempts: 1 };
};

const SOURCE_URL = "https://api.example.com/data";

describe.sequential("fetchRemoteData", () => {
  beforeEach(() => {
    // mockReset clears call history, implementations, and return values
    mocks.fetchWithRetry.mockReset();
    mocks.fetchPaginated.mockReset();
    mocks.calculateDataHash.mockReset();
    mocks.buildAuthHeaders.mockReset();
    // Re-apply default return values after reset
    mocks.calculateDataHash.mockReturnValue("test-hash");
    mocks.buildAuthHeaders.mockReturnValue({});
  });

  describe("CSV Responses", () => {
    it("should pass through CSV data without conversion", async () => {
      const csvContent = "name,value\nA,1\nB,2";
      mocks.fetchWithRetry.mockResolvedValueOnce(mockCsvFetchResult(csvContent));

      const result = await fetchRemoteData({ sourceUrl: SOURCE_URL });

      expect(result.wasConverted).toBe(false);
      expect(result.fileExtension).toBe(".csv");
      expect(result.mimeType).toBe("text/csv");
      expect(result.data.toString("utf-8")).toBe(csvContent);
      expect(result.contentHash).toBe("test-hash");
      expect(result.recordCount).toBeUndefined();
    });
  });

  describe("JSON Auto-Detection", () => {
    it("should auto-detect JSON and convert to CSV", async () => {
      const jsonData = [
        { name: "A", value: 1 },
        { name: "B", value: 2 },
      ];
      mocks.fetchWithRetry.mockResolvedValueOnce(mockJsonFetchResult(jsonData));

      const result = await fetchRemoteData({ sourceUrl: SOURCE_URL });

      expect(result.wasConverted).toBe(true);
      expect(result.mimeType).toBe("text/csv");
      expect(result.fileExtension).toBe(".csv");
      expect(result.originalContentType).toBe("application/json");
      expect(result.recordCount).toBe(2);
      // Verify the CSV contains expected data
      const csv = result.data.toString("utf-8");
      expect(csv).toContain("name");
      expect(csv).toContain("value");
      expect(csv).toContain("A");
      expect(csv).toContain("B");
    });
  });

  describe("Explicit responseFormat", () => {
    it("should convert when responseFormat is 'json'", async () => {
      const jsonData = { results: [{ id: 1 }] };
      // Server returns text/plain but user says it is JSON
      const data = Buffer.from(JSON.stringify(jsonData), "utf-8");
      mocks.fetchWithRetry.mockResolvedValueOnce({
        data,
        contentType: "text/plain",
        contentLength: data.length,
        fileExtension: ".txt",
        attempts: 1,
      });

      const options: FetchRemoteDataOptions = {
        sourceUrl: SOURCE_URL,
        responseFormat: "json",
        jsonApiConfig: { recordsPath: "results" },
      };

      const result = await fetchRemoteData(options);

      expect(result.wasConverted).toBe(true);
      expect(result.mimeType).toBe("text/csv");
      expect(result.recordCount).toBe(1);
    });
  });

  describe("Unsupported File Types", () => {
    it("should throw for unsupported file types", async () => {
      const data = Buffer.from("binary content", "utf-8");
      mocks.fetchWithRetry.mockResolvedValueOnce({
        data,
        contentType: "application/octet-stream",
        contentLength: data.length,
        fileExtension: ".bin",
        attempts: 1,
      });

      await expect(fetchRemoteData({ sourceUrl: SOURCE_URL })).rejects.toThrow("Unsupported file type");
    });
  });

  describe("Cache Options Forwarding", () => {
    it("should forward respectCacheControl to fetchWithRetry", async () => {
      mocks.fetchWithRetry.mockResolvedValueOnce(mockCsvFetchResult("a,b\n1,2"));

      await fetchRemoteData({
        sourceUrl: SOURCE_URL,
        cacheOptions: { useCache: true, bypassCache: false, respectCacheControl: true },
      });

      expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(1);
      const fetchOptions = mocks.fetchWithRetry.mock.calls[0]![1];
      expect(fetchOptions.cacheOptions).toEqual({ useCache: true, bypassCache: false, respectCacheControl: true });
    });
  });

  describe("JSON Pagination", () => {
    it("should use fetchPaginated when pagination is enabled", async () => {
      // fetchWithRetry is still called first to get the initial response
      mocks.fetchWithRetry.mockResolvedValueOnce(mockJsonFetchResult({ data: [{ id: 1 }] }));

      mocks.fetchPaginated.mockResolvedValueOnce({
        allRecords: [{ id: 1 }, { id: 2 }, { id: 3 }],
        pagesProcessed: 2,
        totalRecords: 3,
      });

      const options: FetchRemoteDataOptions = {
        sourceUrl: SOURCE_URL,
        jsonApiConfig: { recordsPath: "data", pagination: { enabled: true, type: "page", limitValue: 2, maxPages: 5 } },
      };

      const result = await fetchRemoteData(options);

      expect(result.wasConverted).toBe(true);
      expect(result.recordCount).toBe(3);
      expect(result.pagesProcessed).toBe(2);
      expect(mocks.fetchPaginated).toHaveBeenCalledTimes(1);
      // Verify the CSV contains all paginated records
      const csv = result.data.toString("utf-8");
      expect(csv).toContain("id");
    });
  });

  describe("Hash Computation", () => {
    it("should compute hash on the final converted CSV, not original JSON", async () => {
      const jsonData = [{ name: "A" }];
      mocks.fetchWithRetry.mockResolvedValueOnce(mockJsonFetchResult(jsonData));

      const result = await fetchRemoteData({ sourceUrl: SOURCE_URL });

      // calculateDataHash should be called with the converted CSV buffer, not the original JSON
      expect(mocks.calculateDataHash).toHaveBeenCalledTimes(1);
      const hashInput = mocks.calculateDataHash.mock.calls[0]![0] as Buffer;
      // The hash input should be CSV (contains header "name" and value "A")
      const hashInputStr = hashInput.toString("utf-8");
      expect(hashInputStr).toContain("name");
      expect(hashInputStr).toContain("A");
      // It should NOT be the raw JSON
      expect(hashInputStr).not.toContain("[");
      expect(result.contentHash).toBe("test-hash");
    });
  });
});
