/**
 * Unit tests for health check pure utility functions.
 *
 * Tests the non-DB-dependent parts of the health module.
 * DB-dependent checks are covered by integration tests.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@payloadcms/db-postgres", () => ({
  sql: {
    join: vi.fn(),
  },
}));

const { mockGetPayload } = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
}));

vi.mock("payload", () => ({
  getPayload: mockGetPayload,
}));

vi.mock("../../payload.config", () => ({
  default: {},
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
    constants: { W_OK: 2 },
  },
  access: vi.fn(),
  readdir: vi.fn(),
  constants: { W_OK: 2 },
}));

import fs from "node:fs/promises";

import { runHealthChecks } from "@/lib/health";

describe("health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("runHealthChecks", () => {
    it("should return results for all check categories", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: {
            execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }),
          },
        },
      };
      mockGetPayload.mockResolvedValue(mockPayload);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      const origSecret = process.env.PAYLOAD_SECRET;
      const origDbUrl = process.env.DATABASE_URL;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";

      try {
        const results = await runHealthChecks();

        expect(results).toHaveProperty("env");
        expect(results).toHaveProperty("uploads");
        expect(results).toHaveProperty("geocoding");
        expect(results).toHaveProperty("email");
        expect(results).toHaveProperty("cms");
        expect(results).toHaveProperty("migrations");
        expect(results).toHaveProperty("postgis");
        expect(results).toHaveProperty("dbFunctions");
        expect(results).toHaveProperty("dbSize");

        for (const key of Object.keys(results)) {
          const result = results[key as keyof typeof results];
          expect(result).toHaveProperty("status");
          expect(result).toHaveProperty("message");
          expect(["healthy", "error", "degraded"]).toContain(result.status);
        }
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
      }
    });

    it("should handle check failures gracefully via wrapHealthCheck", async () => {
      mockGetPayload.mockRejectedValue(new Error("DB unavailable"));
      vi.mocked(fs.access).mockRejectedValue(new Error("No access"));
      vi.mocked(fs.readdir).mockRejectedValue(new Error("No dir"));

      const origSecret = process.env.PAYLOAD_SECRET;
      const origDbUrl = process.env.DATABASE_URL;
      process.env.PAYLOAD_SECRET = "test";
      process.env.DATABASE_URL = "test";

      try {
        const results = await runHealthChecks();

        expect(results.env.status).toBe("healthy");
        expect(results.cms.status).toBe("error");
        expect(results.postgis.status).toBe("error");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
      }
    });
  });
});
