/**
 * Unit tests for paginated JSON API fetching.
 *
 * Tests offset-based, page-based, and cursor-based pagination strategies
 * along with stop conditions (maxPages, empty response, partial page, totalPath).
 *
 * @module
 * @category Tests
 */

// 1. Centralized logger mock (before source code)
import "@/tests/mocks/services/logger";

// 2. vi.hoisted for mock values needed in vi.mock factories
const mocks = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));

// 3. vi.mock calls
vi.mock("@/lib/jobs/handlers/url-fetch-job/fetch-utils", () => ({ fetchWithRetry: mocks.fetchWithRetry }));

// 4. Vitest imports and source code
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PaginatedFetchOptions, PaginationConfig } from "@/lib/jobs/handlers/url-fetch-job/paginated-fetch";
import { fetchPaginated } from "@/lib/jobs/handlers/url-fetch-job/paginated-fetch";

/** Helper to create a mock fetchWithRetry return value from a JSON object. */
const mockFetchResult = (responseObj: unknown) => {
  const data = Buffer.from(JSON.stringify(responseObj), "utf-8");
  return { data, contentType: "application/json", contentLength: data.length, attempts: 1 };
};

const BASE_URL = "https://api.example.com/events";
const DEFAULT_OPTIONS: PaginatedFetchOptions = {};

describe.sequential("fetchPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset is needed to clear unconsumed mockResolvedValueOnce queues
    // that clearAllMocks does not fully drain
    mocks.fetchWithRetry.mockReset();
  });

  describe("Page-Based Pagination", () => {
    it("should collect records across multiple pages", async () => {
      const config: PaginationConfig = {
        enabled: true,
        type: "page",
        pageParam: "page",
        limitParam: "per_page",
        limitValue: 2,
        maxPages: 10,
      };

      // Page 1: 2 records (full page)
      mocks.fetchWithRetry.mockResolvedValueOnce(mockFetchResult({ results: [{ id: 1 }, { id: 2 }] }));
      // Page 2: 2 records (full page)
      mocks.fetchWithRetry.mockResolvedValueOnce(mockFetchResult({ results: [{ id: 3 }, { id: 4 }] }));
      // Page 3: 1 record (partial page, signals last)
      mocks.fetchWithRetry.mockResolvedValueOnce(mockFetchResult({ results: [{ id: 5 }] }));

      const result = await fetchPaginated(BASE_URL, config, "results", DEFAULT_OPTIONS);

      expect(result.allRecords).toHaveLength(5);
      expect(result.pagesProcessed).toBe(3);
      expect(result.totalRecords).toBe(5);
      expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(3);

      // Verify page param increments: page=1, page=2, page=3
      const urls = mocks.fetchWithRetry.mock.calls.map((call: unknown[]) => new URL(call[0] as string));
      expect(urls[0]!.searchParams.get("page")).toBe("1");
      expect(urls[1]!.searchParams.get("page")).toBe("2");
      expect(urls[2]!.searchParams.get("page")).toBe("3");
    });
  });

  describe("Offset-Based Pagination", () => {
    it("should increment offset by limitValue each page", async () => {
      const config: PaginationConfig = {
        enabled: true,
        type: "offset",
        pageParam: "offset",
        limitParam: "limit",
        limitValue: 10,
        maxPages: 10,
      };

      // Page 1: 10 records at offset=0
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ data: Array.from({ length: 10 }, (_, i) => ({ id: i })) })
      );
      // Page 2: 10 records at offset=10
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ data: Array.from({ length: 10 }, (_, i) => ({ id: 10 + i })) })
      );
      // Page 3: 5 records at offset=20 (partial, last page)
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ data: Array.from({ length: 5 }, (_, i) => ({ id: 20 + i })) })
      );

      const result = await fetchPaginated(BASE_URL, config, "data", DEFAULT_OPTIONS);

      expect(result.allRecords).toHaveLength(25);
      expect(result.pagesProcessed).toBe(3);

      // Verify offset increments: 0, 10, 20
      const urls = mocks.fetchWithRetry.mock.calls.map((call: unknown[]) => new URL(call[0] as string));
      expect(urls[0]!.searchParams.get("offset")).toBe("0");
      expect(urls[1]!.searchParams.get("offset")).toBe("10");
      expect(urls[2]!.searchParams.get("offset")).toBe("20");
    });
  });

  describe("Cursor-Based Pagination", () => {
    it("should forward cursor values from response metadata", async () => {
      const config: PaginationConfig = {
        enabled: true,
        type: "cursor",
        cursorParam: "cursor",
        limitValue: 2,
        nextCursorPath: "meta.nextCursor",
        maxPages: 10,
      };

      // Page 1: has nextCursor
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ items: [{ id: 1 }, { id: 2 }], meta: { nextCursor: "abc123" } })
      );
      // Page 2: has nextCursor
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ items: [{ id: 3 }, { id: 4 }], meta: { nextCursor: "def456" } })
      );
      // Page 3: no nextCursor (signals end)
      mocks.fetchWithRetry.mockResolvedValueOnce(mockFetchResult({ items: [{ id: 5 }], meta: { nextCursor: "" } }));

      const result = await fetchPaginated(BASE_URL, config, "items", DEFAULT_OPTIONS);

      expect(result.allRecords).toHaveLength(5);
      expect(result.pagesProcessed).toBe(3);

      // Verify cursor forwarding
      const urls = mocks.fetchWithRetry.mock.calls.map((call: unknown[]) => new URL(call[0] as string));
      // First request has no cursor param (empty string is not set)
      expect(urls[0]!.searchParams.has("cursor")).toBe(false);
      expect(urls[1]!.searchParams.get("cursor")).toBe("abc123");
      expect(urls[2]!.searchParams.get("cursor")).toBe("def456");
    });
  });

  describe("Stop Conditions", () => {
    it("should stop at maxPages even when more data is available", async () => {
      const config: PaginationConfig = { enabled: true, type: "page", limitValue: 10, maxPages: 2 };

      // Both pages return full results (more pages exist)
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ data: Array.from({ length: 10 }, (_, i) => ({ id: i })) })
      );
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ data: Array.from({ length: 10 }, (_, i) => ({ id: 10 + i })) })
      );

      const result = await fetchPaginated(BASE_URL, config, "data", DEFAULT_OPTIONS);

      expect(result.pagesProcessed).toBe(2);
      expect(result.allRecords).toHaveLength(20);
      // Should not have fetched a 3rd page
      expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(2);
    });

    it("should stop when a page returns 0 records", async () => {
      const config: PaginationConfig = { enabled: true, type: "page", limitValue: 5, maxPages: 10 };

      // Page 1: exactly limitValue records (full page, so pagination continues)
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ data: Array.from({ length: 5 }, (_, i) => ({ id: i })) })
      );
      // Page 2: empty (the data array exists but has 0 items)
      mocks.fetchWithRetry.mockResolvedValueOnce(mockFetchResult({ data: [] }));

      const result = await fetchPaginated(BASE_URL, config, "data", DEFAULT_OPTIONS);

      expect(result.pagesProcessed).toBe(2);
      expect(result.allRecords).toHaveLength(5);
      expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(2);
    });

    it("should stop when records returned are fewer than limitValue", async () => {
      const config: PaginationConfig = { enabled: true, type: "offset", limitValue: 100, maxPages: 10 };

      // Only 50 records returned when limit is 100 -- last page
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ results: Array.from({ length: 50 }, (_, i) => ({ id: i })) })
      );

      const result = await fetchPaginated(BASE_URL, config, "results", DEFAULT_OPTIONS);

      expect(result.pagesProcessed).toBe(1);
      expect(result.allRecords).toHaveLength(50);
      expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(1);
    });

    it("should stop when totalPath indicates all records have been collected", async () => {
      const config: PaginationConfig = {
        enabled: true,
        type: "page",
        limitValue: 15,
        totalPath: "meta.total",
        maxPages: 10,
      };

      // Page 1: 15 records, total=25
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ items: Array.from({ length: 15 }, (_, i) => ({ id: i })), meta: { total: 25 } })
      );
      // Page 2: 10 records, now we have 25 total which matches meta.total
      mocks.fetchWithRetry.mockResolvedValueOnce(
        mockFetchResult({ items: Array.from({ length: 10 }, (_, i) => ({ id: 15 + i })), meta: { total: 25 } })
      );

      const result = await fetchPaginated(BASE_URL, config, "items", DEFAULT_OPTIONS);

      expect(result.pagesProcessed).toBe(2);
      expect(result.totalRecords).toBe(25);
      // Should not fetch a third page since we have all 25 records
      expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(2);
    });
  });
});
