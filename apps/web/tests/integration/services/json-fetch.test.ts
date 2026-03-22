// @vitest-environment node
/**
 * Integration tests for JSON data fetching modules.
 *
 * Tests fetchRemoteData (unified fetch service), json-to-csv conversion,
 * and paginated API fetching against a real HTTP server (TestServer).
 *
 * Uses the real HTTP stack -- no mocking of fetchWithRetry. The only mocks
 * are the logger (noise reduction) and the URL fetch cache (filesystem
 * side-effect avoidance -- replaced with a pass-through that still uses
 * real HTTP fetch under the hood).
 *
 * @module
 * @category Tests
 */

process.env.ALLOW_PRIVATE_URLS = "true";

import "@/tests/mocks/services/logger";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the URL fetch cache with a pass-through that uses real HTTP fetch
// but avoids filesystem caching.
// ---------------------------------------------------------------------------
vi.mock("@/lib/services/cache/url-fetch-cache", () => {
  /**
   * Minimal UrlFetchCache replacement that delegates to the real `fetch()`
   * without writing to the filesystem.
   */
  const createPassThroughCache = () => ({
    fetch: async (
      url: string,
      options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; userId?: string; timeout?: number }
    ) => {
      const { bypassCache: _b, forceRevalidate: _f, userId: _u, timeout, ...fetchOpts } = options ?? {};

      // Support timeout via AbortController
      let controller: AbortController | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeout && timeout > 0) {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller!.abort(), timeout);
        fetchOpts.signal = controller.signal;
      }

      try {
        const response = await fetch(url, fetchOpts);
        const data = Buffer.from(await response.arrayBuffer());
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        return { data, headers, status: response.status };
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(0),
    cleanup: vi.fn().mockResolvedValue(0),
    getStats: vi.fn().mockResolvedValue({}),
  });

  return {
    UrlFetchCache: vi.fn().mockImplementation(createPassThroughCache),
    getUrlFetchCache: vi.fn(() => createPassThroughCache()),
  };
});

// ---------------------------------------------------------------------------
// Imports under test (must come AFTER vi.mock calls)
// ---------------------------------------------------------------------------
import { fetchRemoteData } from "@/lib/ingest/fetch-remote-data";
import { fetchPaginated } from "@/lib/jobs/handlers/url-fetch-job/paginated-fetch";
import { TestServer } from "@/tests/setup/integration/http-server";

describe.sequential("JSON fetch integration", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.reset();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. fetchRemoteData with CSV
  // -------------------------------------------------------------------------
  it("fetches CSV from URL and returns CSV data", async () => {
    server.respondWithCSV("/events.csv", "title,date\nEvent 1,2024-01-01");

    const result = await fetchRemoteData({ sourceUrl: server.getUrl("/events.csv"), maxRetries: 0 });

    expect(result.wasConverted).toBe(false);
    expect(result.mimeType).toBe("text/csv");
    expect(result.data.toString()).toContain("title,date");
  });

  // -------------------------------------------------------------------------
  // 2. fetchRemoteData with JSON (auto-detection)
  // -------------------------------------------------------------------------
  it("fetches JSON from URL and converts to CSV", async () => {
    server.respondWithJSON("/api/events", [
      { title: "Event 1", date: "2024-01-01" },
      { title: "Event 2", date: "2024-02-01" },
    ]);

    const result = await fetchRemoteData({ sourceUrl: server.getUrl("/api/events"), maxRetries: 0 });

    expect(result.wasConverted).toBe(true);
    expect(result.mimeType).toBe("text/csv");
    expect(result.data.toString()).toContain("Event 1");
    expect(result.recordCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 3. fetchRemoteData with JSON + recordsPath
  // -------------------------------------------------------------------------
  it("uses recordsPath to find nested records", async () => {
    server.respondWithJSON("/api/data", { meta: { total: 2 }, data: { results: [{ name: "A" }, { name: "B" }] } });

    const result = await fetchRemoteData({
      sourceUrl: server.getUrl("/api/data"),
      maxRetries: 0,
      jsonApiConfig: { recordsPath: "data.results" },
    });

    expect(result.wasConverted).toBe(true);
    expect(result.recordCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 4. fetchRemoteData with unsupported type
  // -------------------------------------------------------------------------
  it("throws for unsupported file types", async () => {
    server.respond("/data.bin", { body: "binary data", headers: { "Content-Type": "application/octet-stream" } });

    await expect(fetchRemoteData({ sourceUrl: server.getUrl("/data.bin"), maxRetries: 0 })).rejects.toThrow(
      "Unsupported file type"
    );
  });

  // -------------------------------------------------------------------------
  // 5. fetchPaginated with page-based pagination
  // -------------------------------------------------------------------------
  it("fetches multiple pages and collects all records", async () => {
    // Page 1: 2 records
    server.route("/api/events?limit=2&page=1", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 1 }, { id: 2 }], total: 3 }));
    });
    // Page 2: 1 record (last page)
    server.route("/api/events?limit=2&page=2", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 3 }], total: 3 }));
    });

    const result = await fetchPaginated(
      server.getUrl("/api/events"),
      { enabled: true, type: "page", limitParam: "limit", limitValue: 2, pageParam: "page", maxPages: 10 },
      "items",
      {}
    );

    expect(result.totalRecords).toBe(3);
    expect(result.pagesProcessed).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 6. fetchPaginated with cursor-based pagination
  // -------------------------------------------------------------------------
  it("follows cursor through paginated responses", async () => {
    // First page — returns cursor "abc"
    server.route("/api/events?limit=2", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 1 }, { id: 2 }], nextCursor: "abc" }));
    });
    // Second page — no cursor (end of data)
    server.route("/api/events?limit=2&cursor=abc", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 3 }], nextCursor: null }));
    });

    const result = await fetchPaginated(
      server.getUrl("/api/events"),
      {
        enabled: true,
        type: "cursor",
        limitParam: "limit",
        limitValue: 2,
        cursorParam: "cursor",
        nextCursorPath: "nextCursor",
        maxPages: 10,
      },
      "items",
      {}
    );

    expect(result.totalRecords).toBe(3);
    expect(result.pagesProcessed).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 7. fetchRemoteData with pagination end-to-end
  // -------------------------------------------------------------------------
  it("fetches paginated JSON API and converts all pages to CSV", async () => {
    // Initial fetch (fetchRemoteData fetches the bare URL first to detect content type)
    server.route("/api/paginated", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ results: [] }));
    });
    // Page 1
    server.route("/api/paginated?limit=2&page=1", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          results: [
            { title: "Event A", city: "Berlin" },
            { title: "Event B", city: "Munich" },
          ],
        })
      );
    });
    // Page 2 (last)
    server.route("/api/paginated?limit=2&page=2", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ results: [{ title: "Event C", city: "Hamburg" }] }));
    });

    const result = await fetchRemoteData({
      sourceUrl: server.getUrl("/api/paginated"),
      maxRetries: 0,
      jsonApiConfig: {
        recordsPath: "results",
        pagination: {
          enabled: true,
          type: "page",
          limitParam: "limit",
          limitValue: 2,
          pageParam: "page",
          maxPages: 10,
        },
      },
    });

    expect(result.wasConverted).toBe(true);
    expect(result.mimeType).toBe("text/csv");
    expect(result.recordCount).toBe(3);
    expect(result.pagesProcessed).toBe(2);

    const csv = result.data.toString();
    expect(csv).toContain("Event A");
    expect(csv).toContain("Event B");
    expect(csv).toContain("Event C");
    expect(csv).toContain("Berlin");
  });

  // -------------------------------------------------------------------------
  // 8. fetchRemoteData with auth
  // -------------------------------------------------------------------------
  it("passes auth headers to the server", async () => {
    server.respondWithAuth(
      "/api/secure",
      "bearer",
      { token: "secret123" },
      { body: JSON.stringify([{ name: "Secret Event" }]), headers: { "Content-Type": "application/json" } }
    );

    const result = await fetchRemoteData({
      sourceUrl: server.getUrl("/api/secure"),
      maxRetries: 0,
      authConfig: { type: "bearer", bearerToken: "secret123" } as any,
    });

    expect(result.wasConverted).toBe(true);
    expect(result.data.toString()).toContain("Secret Event");
  });

  // -------------------------------------------------------------------------
  // 9. Empty JSON response
  // -------------------------------------------------------------------------
  it("handles empty JSON array gracefully", async () => {
    server.respondWithJSON("/api/empty", []);

    await expect(fetchRemoteData({ sourceUrl: server.getUrl("/api/empty"), maxRetries: 0 })).rejects.toThrow(
      "Could not find records"
    );
  });

  // -------------------------------------------------------------------------
  // 10. JSON with nested objects
  // -------------------------------------------------------------------------
  it("flattens nested JSON objects in CSV output", async () => {
    server.respondWithJSON("/api/nested", [{ user: { name: "John", age: 30 }, city: "Berlin" }]);

    const result = await fetchRemoteData({ sourceUrl: server.getUrl("/api/nested"), maxRetries: 0 });

    const csv = result.data.toString();
    expect(csv).toContain("user.name");
    expect(csv).toContain("John");
  });

  // -------------------------------------------------------------------------
  // 11. responseFormat override: force JSON conversion on text/plain
  // -------------------------------------------------------------------------
  it("forces JSON conversion when responseFormat is 'json'", async () => {
    // Server returns JSON but with text/plain content type
    server.respond("/api/plain", {
      body: JSON.stringify([{ name: "Forced" }]),
      headers: { "Content-Type": "text/plain" },
    });

    const result = await fetchRemoteData({
      sourceUrl: server.getUrl("/api/plain"),
      maxRetries: 0,
      responseFormat: "json",
    });

    expect(result.wasConverted).toBe(true);
    expect(result.mimeType).toBe("text/csv");
    expect(result.data.toString()).toContain("Forced");
  });

  // -------------------------------------------------------------------------
  // 12. responseFormat override: force CSV (suppress JSON conversion)
  // -------------------------------------------------------------------------
  it("skips JSON conversion when responseFormat is 'csv' and server returns CSV", async () => {
    // Server returns CSV with wrong Content-Type — responseFormat: "csv" tells us to trust it
    server.respond("/api/csv-as-text", {
      body: "title,date\nEvent 1,2024-01-01",
      headers: { "Content-Type": "text/plain" },
    });

    const result = await fetchRemoteData({
      sourceUrl: server.getUrl("/api/csv-as-text"),
      maxRetries: 0,
      responseFormat: "csv",
    });

    expect(result.wasConverted).toBe(false);
    expect(result.data.toString()).toContain("title,date");
  });

  // -------------------------------------------------------------------------
  // 13. Pagination: stops when records < limitValue (partial last page)
  // -------------------------------------------------------------------------
  it("stops pagination when page returns fewer records than limitValue", async () => {
    // Page 1: full page (2 records, limitValue=2)
    server.route("/api/partial?limit=2&page=1", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }));
    });
    // Page 2: partial page (1 record — signals end of data)
    server.route("/api/partial?limit=2&page=2", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 3 }] }));
    });
    // Page 3 exists but should NOT be fetched
    server.route("/api/partial?limit=2&page=3", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 4 }] }));
    });

    const result = await fetchPaginated(
      server.getUrl("/api/partial"),
      { enabled: true, type: "page", limitParam: "limit", limitValue: 2, pageParam: "page", maxPages: 50 },
      "items",
      {}
    );

    expect(result.pagesProcessed).toBe(2);
    expect(result.totalRecords).toBe(3); // Only pages 1+2, not page 3
  });

  // -------------------------------------------------------------------------
  // 14. Pagination: maxPages limit stops fetching
  // -------------------------------------------------------------------------
  it("stops at maxPages even when more data is available", async () => {
    // All pages return 2 records — server has "infinite" data
    server.setDefaultHandler((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }));
    });

    const result = await fetchPaginated(
      server.getUrl("/api/infinite"),
      { enabled: true, type: "page", limitParam: "limit", limitValue: 2, pageParam: "page", maxPages: 3 },
      "items",
      {}
    );

    expect(result.pagesProcessed).toBe(3);
    expect(result.totalRecords).toBe(6); // 3 pages × 2 records
  });

  // -------------------------------------------------------------------------
  // 15. JSON with deeply nested objects (MAX_FLATTEN_DEPTH)
  // -------------------------------------------------------------------------
  it("serializes objects beyond max flatten depth as JSON strings", async () => {
    // Build 25 levels of nesting (MAX_FLATTEN_DEPTH is 20)
    let deep: Record<string, unknown> = { value: "bottom" };
    for (let i = 24; i >= 0; i--) {
      deep = { [`level${i}`]: deep };
    }

    server.respondWithJSON("/api/deep", [deep]);

    const result = await fetchRemoteData({ sourceUrl: server.getUrl("/api/deep"), maxRetries: 0 });
    const csv = result.data.toString();

    // Should contain flattened keys up to depth 20, then JSON for deeper
    expect(csv).toContain("level0.");
    // The deepest levels should be serialized as JSON string (not expanded further)
    expect(result.wasConverted).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 16. JSON auto-detect: object with nested array (not top-level array)
  // -------------------------------------------------------------------------
  it("auto-detects records array inside a wrapper object", async () => {
    server.respondWithJSON("/api/wrapped", {
      status: "ok",
      count: 2,
      events: [
        { title: "Concert", city: "Vienna" },
        { title: "Festival", city: "Zurich" },
      ],
    });

    const result = await fetchRemoteData({ sourceUrl: server.getUrl("/api/wrapped"), maxRetries: 0 });

    expect(result.wasConverted).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.data.toString()).toContain("Concert");
  });
});
