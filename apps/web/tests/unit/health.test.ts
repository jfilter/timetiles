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

    it("should report error when required environment variables are missing", async () => {
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
      delete process.env.PAYLOAD_SECRET;
      delete process.env.DATABASE_URL;

      try {
        const results = await runHealthChecks();

        expect(results.env.status).toBe("error");
        expect(results.env.message).toContain("Missing required environment variables");
        expect(results.env.message).toContain("PAYLOAD_SECRET");
        expect(results.env.message).toContain("DATABASE_URL");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
      }
    });

    it("should report error for email in production without SMTP", async () => {
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
      const origSmtpHost = process.env.EMAIL_SMTP_HOST;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.EMAIL_SMTP_HOST;

      try {
        const results = await runHealthChecks();

        expect(results.email.status).toBe("error");
        expect(results.email.message).toContain("SMTP not configured");
        expect(results.email.message).toContain("production");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        vi.unstubAllEnvs();
        if (origSmtpHost !== undefined) {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        } else {
          delete process.env.EMAIL_SMTP_HOST;
        }
      }
    });

    it("should report healthy email with SMTP and authentication configured", async () => {
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
      const origSmtpHost = process.env.EMAIL_SMTP_HOST;
      const origSmtpUser = process.env.EMAIL_SMTP_USER;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      process.env.EMAIL_SMTP_HOST = "smtp.example.com";
      process.env.EMAIL_SMTP_USER = "user@example.com";

      try {
        const results = await runHealthChecks();

        expect(results.email.status).toBe("healthy");
        expect(results.email.message).toContain("smtp.example.com");
        expect(results.email.message).toContain("with authentication");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        if (origSmtpHost !== undefined) {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        } else {
          delete process.env.EMAIL_SMTP_HOST;
        }
        if (origSmtpUser !== undefined) {
          process.env.EMAIL_SMTP_USER = origSmtpUser;
        } else {
          delete process.env.EMAIL_SMTP_USER;
        }
      }
    });

    it("should report healthy email with SMTP but without authentication", async () => {
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
      const origSmtpHost = process.env.EMAIL_SMTP_HOST;
      const origSmtpUser = process.env.EMAIL_SMTP_USER;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      process.env.EMAIL_SMTP_HOST = "smtp.example.com";
      delete process.env.EMAIL_SMTP_USER;

      try {
        const results = await runHealthChecks();

        expect(results.email.status).toBe("healthy");
        expect(results.email.message).toContain("smtp.example.com");
        expect(results.email.message).not.toContain("with authentication");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        if (origSmtpHost !== undefined) {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        } else {
          delete process.env.EMAIL_SMTP_HOST;
        }
        if (origSmtpUser !== undefined) {
          process.env.EMAIL_SMTP_USER = origSmtpUser;
        } else {
          delete process.env.EMAIL_SMTP_USER;
        }
      }
    });

    it("should report degraded email in dev mode without SMTP", async () => {
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
      const origSmtpHost = process.env.EMAIL_SMTP_HOST;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      vi.stubEnv("NODE_ENV", "development");
      delete process.env.EMAIL_SMTP_HOST;

      try {
        const results = await runHealthChecks();

        expect(results.email.status).toBe("degraded");
        expect(results.email.message).toContain("Development mode");
        expect(results.email.message).toContain("ethereal.email");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        vi.unstubAllEnvs();
        if (origSmtpHost !== undefined) {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        } else {
          delete process.env.EMAIL_SMTP_HOST;
        }
      }
    });

    it("should report degraded geocoding when no providers are enabled", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 0, docs: [] }),
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

        expect(results.geocoding.status).toBe("degraded");
        expect(results.geocoding.message).toContain("No enabled geocoding providers");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
      }
    });

    it("should report degraded uploads in CI when directory is not writable", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: {
            execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }),
          },
        },
      };
      mockGetPayload.mockResolvedValue(mockPayload);
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      const origSecret = process.env.PAYLOAD_SECRET;
      const origDbUrl = process.env.DATABASE_URL;
      const origCI = process.env.CI;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      process.env.CI = "true";

      try {
        const results = await runHealthChecks();

        expect(results.uploads.status).toBe("degraded");
        expect(results.uploads.message).toContain("CI environment");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        if (origCI !== undefined) {
          process.env.CI = origCI;
        } else {
          delete process.env.CI;
        }
      }
    });
  });
});
