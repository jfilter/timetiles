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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";

vi.mock("@payloadcms/db-postgres", () => ({ sql: { join: vi.fn() } }));

const { mockGetPayload, mockTestConfiguration } = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockTestConfiguration: vi.fn(),
}));

vi.mock("payload", () => ({ getPayload: mockGetPayload }));

// The geocoding check now performs a live probe, so the service has to be
// stubbed here or every health test would try to reach a real provider.
vi.mock("@/lib/services/geocoding", () => ({
  createGeocodingService: vi.fn(() => ({ testConfiguration: mockTestConfiguration })),
}));

vi.mock("../../payload.config", () => ({ default: {} }));

vi.mock("node:fs/promises", () => ({
  default: { access: vi.fn(), readdir: vi.fn(), constants: { W_OK: 2 } },
  access: vi.fn(),
  readdir: vi.fn(),
  constants: { W_OK: 2 },
}));

import fs from "node:fs/promises";

import { resetGeocodingProbeCache, runHealthChecks } from "@/lib/health";

/** A provider that answers the probe, so unrelated tests stay green. */
const PROBE_OK = { nominatim: { success: true, result: { latitude: 37.4, longitude: -122.08 } } };

const createMockPayload = (totalDocs = 1) => ({
  find: vi.fn().mockResolvedValue({ totalDocs, docs: [] }),
  db: { drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) } },
});

/**
 * Set exactly the env this module reads, clearing anything not named, so an
 * ambient EMAIL_SMTP_* from the developer's .env cannot change the verdict.
 */
const stubHealthEnv = (
  overrides: {
    EMAIL_SMTP_HOST?: string;
    EMAIL_SMTP_USER?: string;
    EMAIL_SMTP_PASS?: string;
    NODE_ENV?: string;
    CI?: string;
  } = {}
) => {
  vi.stubEnv("PAYLOAD_SECRET", "test-secret");
  vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
  vi.stubEnv("EMAIL_SMTP_HOST", overrides.EMAIL_SMTP_HOST);
  vi.stubEnv("EMAIL_SMTP_USER", overrides.EMAIL_SMTP_USER);
  vi.stubEnv("EMAIL_SMTP_PASS", overrides.EMAIL_SMTP_PASS);
  if (overrides.NODE_ENV !== undefined) vi.stubEnv("NODE_ENV", overrides.NODE_ENV);
  if (overrides.CI !== undefined) vi.stubEnv("CI", overrides.CI);
  resetEnv();
};

describe("health", () => {
  beforeEach(() => {
    // The probe is memoised on purpose; without this each test would inherit
    // the previous test's verdict instead of exercising its own fixture.
    resetGeocodingProbeCache();
    mockTestConfiguration.mockReset();
    mockTestConfiguration.mockResolvedValue(PROBE_OK);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnv();
  });

  describe("runHealthChecks", () => {
    it("should return results for all check categories", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
        },
      };
      mockGetPayload.mockResolvedValue(mockPayload);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      const origSecret = process.env.PAYLOAD_SECRET;
      const origDbUrl = process.env.DATABASE_URL;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      resetEnv();

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
      resetEnv();

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
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
        },
      };
      mockGetPayload.mockResolvedValue(mockPayload);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      const origSecret = process.env.PAYLOAD_SECRET;
      const origDbUrl = process.env.DATABASE_URL;
      delete process.env.PAYLOAD_SECRET;
      delete process.env.DATABASE_URL;
      resetEnv();

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

    // Downgraded from error to degraded on purpose: running without outgoing
    // mail is now a supported configuration. The example deployment config
    // ships EMAIL_SMTP_HOST unset, because a placeholder host made every send
    // fail -- including the one Payload sends while registering the first
    // admin, which locked operators out of fresh deployments entirely.
    it("should report degraded for email in production without SMTP", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
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
      resetEnv();

      try {
        const results = await runHealthChecks();

        expect(results.email.status).toBe("degraded");
        expect(results.email.message).toContain("SMTP not configured");
        expect(results.email.message).toContain("disabled");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        vi.unstubAllEnvs();
        if (origSmtpHost === undefined) {
          delete process.env.EMAIL_SMTP_HOST;
        } else {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        }
      }
    });

    it("should report error when EMAIL_SMTP_HOST is a placeholder", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
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
      // The exact value the example config used to ship.
      process.env.EMAIL_SMTP_HOST = "smtp.example.com";
      resetEnv();

      try {
        const results = await runHealthChecks();

        // Previously reported "healthy" purely because the variable was set,
        // while every send failed with ENOTFOUND.
        expect(results.email.status).toBe("error");
        expect(results.email.message).toContain("placeholder");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        vi.unstubAllEnvs();
        if (origSmtpHost === undefined) {
          delete process.env.EMAIL_SMTP_HOST;
        } else {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        }
      }
    });

    it("should report healthy email with SMTP and authentication configured", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      stubHealthEnv({
        EMAIL_SMTP_HOST: "smtp.mailhost.internal",
        EMAIL_SMTP_USER: "user@example.com",
        EMAIL_SMTP_PASS: "s3cret",
      });

      const results = await runHealthChecks();

      expect(results.email.status).toBe("healthy");
      expect(results.email.message).toContain("smtp.mailhost.internal");
      expect(results.email.message).toContain("with authentication");
    });

    it("should report healthy email with SMTP but without authentication", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      // Neither credential set: an unauthenticated relay is a valid setup.
      stubHealthEnv({ EMAIL_SMTP_HOST: "smtp.mailhost.internal" });

      const results = await runHealthChecks();

      expect(results.email.status).toBe("healthy");
      expect(results.email.message).toContain("smtp.mailhost.internal");
      expect(results.email.message).not.toContain("with authentication");
    });

    // docker-compose.prod.yml defaults both credential vars to empty, so a user
    // set without a password is a realistic misconfiguration. It used to report
    // "SMTP configured (host) with authentication" while every send failed with
    // EAUTH -- which send-email-job treats as terminal, cancelling the job so
    // nothing is ever retried.
    it("should report error when EMAIL_SMTP_USER is set without EMAIL_SMTP_PASS", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      stubHealthEnv({ EMAIL_SMTP_HOST: "smtp.mailhost.internal", EMAIL_SMTP_USER: "user@example.com" });

      const results = await runHealthChecks();

      expect(results.email.status).toBe("error");
      expect(results.email.message).toContain("EMAIL_SMTP_PASS");
      expect(results.email.message).not.toContain("with authentication");
    });

    it("should report error when EMAIL_SMTP_PASS is set without EMAIL_SMTP_USER", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      stubHealthEnv({ EMAIL_SMTP_HOST: "smtp.mailhost.internal", EMAIL_SMTP_PASS: "s3cret" });

      const results = await runHealthChecks();

      expect(results.email.status).toBe("error");
      expect(results.email.message).toContain("EMAIL_SMTP_USER");
    });

    it("should report degraded email in dev mode without SMTP", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
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
      resetEnv();

      try {
        const results = await runHealthChecks();

        expect(results.email.status).toBe("degraded");
        expect(results.email.message).toContain("Development mode");
        expect(results.email.message).toContain("ethereal.email");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        vi.unstubAllEnvs();
        if (origSmtpHost === undefined) {
          delete process.env.EMAIL_SMTP_HOST;
        } else {
          process.env.EMAIL_SMTP_HOST = origSmtpHost;
        }
      }
    });

    it("should report degraded geocoding when no providers are enabled", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 0, docs: [] }),
        db: {
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
        },
      };
      mockGetPayload.mockResolvedValue(mockPayload);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);

      const origSecret = process.env.PAYLOAD_SECRET;
      const origDbUrl = process.env.DATABASE_URL;
      process.env.PAYLOAD_SECRET = "test-secret";
      process.env.DATABASE_URL = "postgres://localhost/test";
      resetEnv();

      try {
        const results = await runHealthChecks();

        expect(results.geocoding.status).toBe("degraded");
        expect(results.geocoding.message).toContain("No enabled geocoding providers");
        // Nothing to probe, so the provider must not be contacted at all.
        expect(mockTestConfiguration).not.toHaveBeenCalled();
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
      }
    });

    it("should report healthy geocoding only after a provider answers a live probe", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);
      stubHealthEnv();

      const results = await runHealthChecks();

      expect(results.geocoding.status).toBe("healthy");
      expect(results.geocoding.message).toContain("answered a live test geocode");
      expect(mockTestConfiguration).toHaveBeenCalledTimes(1);
    });

    // The bug this check exists for: an expired key or upstream outage fails
    // every geocode-batch job, while the old row-count check reported
    // "1 enabled provider(s) found" and stayed green.
    it("should report error when every enabled provider fails the live probe", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);
      mockTestConfiguration.mockResolvedValue({ nominatim: { success: false, error: "Invalid API key" } });
      stubHealthEnv();

      const results = await runHealthChecks();

      expect(results.geocoding.status).toBe("error");
      expect(results.geocoding.message).toContain("Invalid API key");
      expect(results.geocoding.message).toContain("geocode-batch");
    });

    it("should report degraded geocoding when only some providers fail the live probe", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload(2));
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);
      mockTestConfiguration.mockResolvedValue({
        nominatim: { success: true, result: { latitude: 37.4, longitude: -122.08 } },
        opencage: { success: false, error: "quota exceeded" },
      });
      stubHealthEnv();

      const results = await runHealthChecks();

      expect(results.geocoding.status).toBe("degraded");
      expect(results.geocoding.message).toContain("nominatim");
      expect(results.geocoding.message).toContain("quota exceeded");
    });

    it("should report error when providers are enabled but none can be probed", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);
      mockTestConfiguration.mockResolvedValue({});
      stubHealthEnv();

      const results = await runHealthChecks();

      expect(results.geocoding.status).toBe("error");
      expect(results.geocoding.message).toContain("none could be probed");
    });

    // A health endpoint gets polled; without memoisation every poll would burn
    // provider quota.
    it("should not re-probe the provider within the TTL", async () => {
      mockGetPayload.mockResolvedValue(createMockPayload());
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([] as never);
      stubHealthEnv();

      const first = await runHealthChecks();
      const second = await runHealthChecks();

      expect(mockTestConfiguration).toHaveBeenCalledTimes(1);
      expect(second.geocoding).toEqual(first.geocoding);
    });

    // A stalled provider must not hang /api/admin/health. The verdict is
    // "inconclusive" rather than "error": the per-provider timeout is the same
    // length, so we may have cut in just before a provider was marked failed.
    it("should report degraded when the live probe times out", async () => {
      vi.useFakeTimers();

      try {
        mockGetPayload.mockResolvedValue(createMockPayload());
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readdir).mockResolvedValue([] as never);
        mockTestConfiguration.mockReturnValue(new Promise(() => {}));
        stubHealthEnv();

        const pending = runHealthChecks();
        await vi.advanceTimersByTimeAsync(5000);
        const results = await pending;

        expect(results.geocoding.status).toBe("degraded");
        expect(results.geocoding.message).toContain("inconclusive");
      } finally {
        vi.useRealTimers();
      }
    });

    it("should report degraded uploads in CI when directory is not writable", async () => {
      const mockPayload = {
        find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [] }),
        db: {
          drizzle: { execute: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ exists: true, size: "50 MB" }] }) },
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
      resetEnv();

      try {
        const results = await runHealthChecks();

        expect(results.uploads.status).toBe("degraded");
        expect(results.uploads.message).toContain("CI environment");
      } finally {
        process.env.PAYLOAD_SECRET = origSecret;
        process.env.DATABASE_URL = origDbUrl;
        if (origCI === undefined) {
          delete process.env.CI;
        } else {
          process.env.CI = origCI;
        }
      }
    });
  });
});
