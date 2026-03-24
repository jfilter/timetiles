import { beforeEach, describe, expect, it, vi } from "vitest";

import { Hono } from "hono";

import { AuthError } from "../src/lib/errors.js";

// Mock runner service
vi.mock("../src/services/runner.js", () => ({
  executeRun: vi.fn(),
  isRunActive: vi.fn().mockReturnValue(false),
  stopRun: vi.fn(),
  getActiveRunCount: vi.fn().mockReturnValue(0),
  getMetrics: vi
    .fn()
    .mockReturnValue({
      active_runs: 1,
      total_runs: 42,
      total_success: 35,
      total_failed: 5,
      total_timeout: 2,
      uptime_seconds: 3600,
      queue_capacity: 3,
    }),
}));

// Mock logger to avoid side effects
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() }, logError: vi.fn() }));

// Mock config (needed by output download/delete endpoints)
vi.mock("../src/config.js", () => ({
  getConfig: vi.fn(() => ({ SCRAPER_DATA_DIR: "/tmp/timescrape-test" })),
  loadConfig: vi.fn(() => ({ SCRAPER_DATA_DIR: "/tmp/timescrape-test" })),
}));

// Mock fs for output endpoints
const mockStat = vi.fn();
const mockRm = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => mockStat(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

const mockCreateReadStream = vi.fn();
vi.mock("node:fs", () => ({ createReadStream: (...args: unknown[]) => mockCreateReadStream(...args) }));

import { runRoutes } from "../src/api/run.js";
import { executeRun } from "../src/services/runner.js";

const TEST_API_KEY = "test-api-key-long-enough-for-validation";

/**
 * Build a Hono app that replicates the auth middleware from src/index.ts
 * so we can test routes with authentication in isolation.
 */
function createTestApp(): Hono {
  const app = new Hono();

  // Replicate auth middleware from src/index.ts
  app.use("*", async (c, next) => {
    if (c.req.path === "/health" || c.req.path === "/metrics") {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError();
    }

    const token = authHeader.slice(7);
    if (token !== TEST_API_KEY) {
      throw new AuthError();
    }

    return next();
  });

  // Error handler matching src/index.ts
  app.onError((error, c) => {
    if (error instanceof AuthError) {
      return c.json({ error: error.message }, 401);
    }
    return c.json({ error: "Internal server error" }, 500);
  });

  app.route("/", runRoutes);
  return app;
}

const VALID_RUN_BODY = {
  run_id: "550e8400-e29b-41d4-a716-446655440000",
  runtime: "python",
  entrypoint: "scraper.py",
  code: { "scraper.py": "print('hello')" },
};

describe("POST /run endpoint", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.request("/health");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("active_runs");
      expect(body).toHaveProperty("timestamp");
    });
  });

  describe("GET /metrics", () => {
    it("returns 200 with metrics without auth", async () => {
      const res = await app.request("/metrics");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({
        active_runs: 1,
        total_runs: 42,
        total_success: 35,
        total_failed: 5,
        total_timeout: 2,
        uptime_seconds: 3600,
        queue_capacity: 3,
      });
    });
  });

  describe("Authentication", () => {
    it("returns 401 without Authorization header", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_RUN_BODY),
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("Invalid or missing API key");
    });

    it("returns 401 with wrong API key", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-key-that-is-invalid" },
        body: JSON.stringify(VALID_RUN_BODY),
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("Invalid or missing API key");
    });
  });

  describe("Request Validation", () => {
    it("returns 400 with invalid JSON", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: "not valid json{{{",
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 with validation details when required fields are missing", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid request");
      expect(body.details).toBeDefined();
    });

    it("returns 400 without code_url and code", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: JSON.stringify({
          run_id: "550e8400-e29b-41d4-a716-446655440000",
          runtime: "python",
          entrypoint: "scraper.py",
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Either code_url or code must be provided");
    });

    it("returns 400 when entrypoint contains path traversal", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: JSON.stringify({ ...VALID_RUN_BODY, entrypoint: "../etc/passwd" }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid request");
      expect(body.details).toBeDefined();
    });

    it("returns 400 when output_file contains path traversal", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: JSON.stringify({ ...VALID_RUN_BODY, output_file: "../../etc/output.csv" }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid request");
      expect(body.details).toBeDefined();
    });

    it("returns 400 when code_url is not HTTPS", async () => {
      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: JSON.stringify({
          run_id: "550e8400-e29b-41d4-a716-446655440000",
          runtime: "python",
          entrypoint: "scraper.py",
          code_url: "http://example.com/repo.git",
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid request");
      expect(body.details).toBeDefined();
    });
  });

  describe("Successful Execution", () => {
    it("returns runner result on successful execution", async () => {
      const mockResult = {
        status: "success",
        exit_code: 0,
        duration_ms: 1500,
        stdout: "output",
        stderr: "",
        output: { rows: 10, bytes: 256, download_url: "/output/test-run-id/data.csv" },
      };
      vi.mocked(executeRun).mockResolvedValue(mockResult);

      const res = await app.request("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_API_KEY}` },
        body: JSON.stringify(VALID_RUN_BODY),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("success");
      expect(body.exit_code).toBe(0);
      expect(body.output.rows).toBe(10);

      expect(executeRun).toHaveBeenCalledTimes(1);
      expect(executeRun).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: VALID_RUN_BODY.run_id, runtime: "python", entrypoint: "scraper.py" })
      );
    });
  });

  describe("GET /output/:runId/:filename", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/output/run-123/data.csv");
      expect(res.status).toBe(401);
    });

    it("returns 400 for path traversal in filename", async () => {
      // Hono's router won't match ".." as route segments (404),
      // but "..data.csv" passes routing and hits our validation
      const res = await app.request("/output/run-123/..data.csv", {
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 when file does not exist", async () => {
      mockStat.mockRejectedValue(new Error("ENOENT"));
      const res = await app.request("/output/run-123/data.csv", {
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(res.status).toBe(404);
    });

    it("streams file with correct headers when found", async () => {
      mockStat.mockResolvedValue({ size: 1024 });
      // Mock a readable stream using a real Readable instance (required by Readable.toWeb)
      const { Readable } = await import("node:stream");
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      mockCreateReadStream.mockReturnValue(mockStream);

      const res = await app.request("/output/run-123/data.csv", {
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });

      // Hono may return 200 with the stream response
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/csv");
      expect(res.headers.get("Content-Length")).toBe("1024");
      expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="data.csv"');
    });
  });

  describe("DELETE /output/:runId", () => {
    it("returns 401 without auth", async () => {
      const res = await app.request("/output/run-123", { method: "DELETE" });
      expect(res.status).toBe(401);
    });

    it("returns 400 for path traversal in runId", async () => {
      const res = await app.request("/output/..run-evil", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(res.status).toBe(400);
    });

    it("deletes output directory and returns success", async () => {
      mockRm.mockResolvedValue(undefined);
      const res = await app.request("/output/run-123", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("deleted");
      expect(mockRm).toHaveBeenCalledWith("/tmp/timescrape-test/outputs/run-123", { recursive: true, force: true });
    });
  });
});
