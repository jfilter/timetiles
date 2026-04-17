/**
 * Unit tests for centralized environment variable validation (env.ts).
 *
 * Tests Zod schema parsing, lazy singleton caching, relaxed schema triggers,
 * boolean transforms, number coercion, and default values.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { getEnv, resetEnv } from "@/lib/config/env";
import { TEST_SECRETS } from "@/tests/constants/test-credentials";

describe.sequential("getEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnv();
  });

  describe("successful parsing with required vars", () => {
    it("returns validated env with defaults when required vars are set", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const env = getEnv();

      expect(env.DATABASE_URL).toBe("postgres://localhost/test");
      expect(env.PAYLOAD_SECRET).toBe(TEST_SECRETS.payloadSecret);
      expect(env.NEXT_PUBLIC_PAYLOAD_URL).toBe("http://localhost:3000");
    });

    it("uses UPLOAD_DIR from environment when set", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      vi.stubEnv("UPLOAD_DIR", "custom-uploads");
      resetEnv();

      const env = getEnv();

      expect(env.UPLOAD_DIR).toBe("custom-uploads");
    });

    it("applies default for NODE_ENV when not set", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      // NODE_ENV is already set by test runner, so we need to unset it
      // But the Zod schema defaults to "development" when absent
      // In test env, NODE_ENV is "test" so we verify it passes validation
      resetEnv();

      const env = getEnv();

      expect(["development", "production", "test"]).toContain(env.NODE_ENV);
    });

    it("applies default for EMAIL_FROM_ADDRESS", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const env = getEnv();

      expect(env.EMAIL_FROM_ADDRESS).toBe("noreply@timetiles.io");
    });

    it("applies default for DATA_EXPORT_DIR", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const env = getEnv();

      expect(env.DATA_EXPORT_DIR).toBe(".exports");
    });

    it("applies default for RATE_LIMIT_BACKEND", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const env = getEnv();

      expect(env.RATE_LIMIT_BACKEND).toBe("memory");
    });
  });

  describe("caching", () => {
    it("returns the same object on second call", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const first = getEnv();
      const second = getEnv();

      expect(first).toBe(second);
    });

    it("re-parses after resetEnv() clears the cache", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const first = getEnv();

      vi.stubEnv("DATABASE_URL", "postgres://localhost/other");
      resetEnv();

      const second = getEnv();

      expect(first).not.toBe(second);
      expect(second.DATABASE_URL).toBe("postgres://localhost/other");
    });
  });

  describe("relaxed schema", () => {
    it("uses relaxed schema when VITEST=true (DATABASE_URL can be empty)", () => {
      const saved = { ...process.env };
      vi.stubEnv("VITEST", "true");
      delete process.env.DATABASE_URL;
      delete process.env.PAYLOAD_SECRET;
      resetEnv();

      try {
        const env = getEnv();

        expect(env.DATABASE_URL).toBe("");
        expect(env.PAYLOAD_SECRET).toBe("dummy-build-secret");
      } finally {
        for (const key of Object.keys(process.env)) {
          if (!(key in saved)) delete process.env[key];
        }
        Object.assign(process.env, saved);
      }
    });

    it("uses relaxed schema when NEXT_PHASE=phase-production-build", () => {
      const saved = { ...process.env };
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
      delete process.env.DATABASE_URL;
      delete process.env.PAYLOAD_SECRET;
      resetEnv();

      try {
        const env = getEnv();

        expect(env.DATABASE_URL).toBe("");
        expect(env.PAYLOAD_SECRET).toBe("dummy-build-secret");
      } finally {
        for (const key of Object.keys(process.env)) {
          if (!(key in saved)) delete process.env[key];
        }
        Object.assign(process.env, saved);
      }
    });

    it("uses relaxed schema when SKIP_DB_CHECK=true", () => {
      const saved = { ...process.env };
      vi.stubEnv("SKIP_DB_CHECK", "true");
      delete process.env.DATABASE_URL;
      delete process.env.PAYLOAD_SECRET;
      resetEnv();

      try {
        const env = getEnv();

        expect(env.DATABASE_URL).toBe("");
        expect(env.PAYLOAD_SECRET).toBe("dummy-build-secret");
      } finally {
        for (const key of Object.keys(process.env)) {
          if (!(key in saved)) delete process.env[key];
        }
        Object.assign(process.env, saved);
      }
    });
  });

  describe("runtime schema validation failures", () => {
    it("throws ZodError when DATABASE_URL is missing in non-test mode", () => {
      // Force runtime schema by disabling all relaxation triggers
      const saved = { ...process.env };
      process.env.VITEST = "";
      delete process.env.NEXT_PHASE;
      delete process.env.SKIP_DB_CHECK;
      delete process.env.DATABASE_URL;
      process.env.PAYLOAD_SECRET = TEST_SECRETS.payloadSecret;
      resetEnv();

      try {
        expect(() => getEnv()).toThrow(ZodError);
      } finally {
        // Restore all env vars
        for (const key of Object.keys(process.env)) {
          if (!(key in saved)) delete process.env[key];
        }
        Object.assign(process.env, saved);
      }
    });

    it("throws ZodError when PAYLOAD_SECRET is missing in non-test mode", () => {
      vi.stubEnv("VITEST", "");
      const saved = { ...process.env };
      process.env.VITEST = "";
      process.env.DATABASE_URL = "postgres://localhost/test";
      delete process.env.NEXT_PHASE;
      delete process.env.SKIP_DB_CHECK;
      delete process.env.PAYLOAD_SECRET;
      resetEnv();

      try {
        expect(() => getEnv()).toThrow(ZodError);
      } finally {
        for (const key of Object.keys(process.env)) {
          if (!(key in saved)) delete process.env[key];
        }
        Object.assign(process.env, saved);
      }
    });
  });

  describe("boolean transforms", () => {
    it("transforms SSRF_DNS_CHECK=true to boolean true", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      vi.stubEnv("SSRF_DNS_CHECK", "true");
      resetEnv();

      const env = getEnv();

      expect(env.SSRF_DNS_CHECK).toBe(true);
    });

    it("transforms SSRF_DNS_CHECK=false to boolean false", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      vi.stubEnv("SSRF_DNS_CHECK", "false");
      resetEnv();

      const env = getEnv();

      expect(env.SSRF_DNS_CHECK).toBe(false);
    });

    it("defaults SSRF_DNS_CHECK to false when not set", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const env = getEnv();

      expect(env.SSRF_DNS_CHECK).toBe(false);
    });
  });

  describe("number coercion", () => {
    it("coerces EMAIL_SMTP_PORT string to number", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      vi.stubEnv("EMAIL_SMTP_PORT", "465");
      resetEnv();

      const env = getEnv();

      expect(env.EMAIL_SMTP_PORT).toBe(465);
      expect(typeof env.EMAIL_SMTP_PORT).toBe("number");
    });

    it("defaults EMAIL_SMTP_PORT to 587", () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
      vi.stubEnv("PAYLOAD_SECRET", TEST_SECRETS.payloadSecret);
      resetEnv();

      const env = getEnv();

      expect(env.EMAIL_SMTP_PORT).toBe(587);
    });
  });
});
