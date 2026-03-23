/**
 * Unit tests for YAML-based application configuration (app-config.ts).
 *
 * Tests default values, caching, deep merge behavior, env var overrides
 * for batch sizes, and YAML validation with strict mode.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAppConfig, resetAppConfig } from "@/lib/config/app-config";
import { resetEnv } from "@/lib/config/env";

describe.sequential("getAppConfig", () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetEnv();
    resetAppConfig();
    // Default: no YAML file exists — spy on fs to intercept file reads
    existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    readFileSyncSpy = vi.spyOn(fs, "readFileSync");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
    resetEnv();
    resetAppConfig();
  });

  describe("defaults (no YAML file)", () => {
    it("returns full config with all defaults when no YAML file exists", () => {
      const config = getAppConfig();

      expect(config).toHaveProperty("rateLimits");
      expect(config).toHaveProperty("quotas");
      expect(config).toHaveProperty("trustLevelRateLimits");
      expect(config).toHaveProperty("batchSizes");
      expect(config).toHaveProperty("cache");
      expect(config).toHaveProperty("account");
    });

    it("has expected rate limit endpoints", () => {
      const config = getAppConfig();

      expect(config.rateLimits).toHaveProperty("FILE_UPLOAD");
      expect(config.rateLimits).toHaveProperty("API_GENERAL");
      expect(config.rateLimits).toHaveProperty("WEBHOOK_TRIGGER");
      expect(config.rateLimits).toHaveProperty("REGISTRATION");
    });

    it("FILE_UPLOAD rate limit has burst, hourly, and daily windows", () => {
      const config = getAppConfig();
      const windows = config.rateLimits.FILE_UPLOAD.windows;

      expect(windows).toHaveLength(3);
      expect(windows[0]).toEqual({ limit: 1, windowMs: 5_000, name: "burst" });
      expect(windows[1]).toEqual({ limit: 5, windowMs: 3_600_000, name: "hourly" });
      expect(windows[2]).toEqual({ limit: 20, windowMs: 86_400_000, name: "daily" });
    });

    it("PROGRESS_CHECK rate limit has expected burst limit", () => {
      const config = getAppConfig();
      const burstWindow = config.rateLimits.PROGRESS_CHECK.windows.find((w) => w.name === "burst");

      expect(burstWindow).toBeDefined();
      expect(burstWindow!.limit).toBe(10);
      expect(burstWindow!.windowMs).toBe(1000);
    });
  });

  describe("quota defaults", () => {
    it("UNTRUSTED (level 0) quotas match expected values", () => {
      const config = getAppConfig();
      const untrusted = config.quotas[0]!;

      expect(untrusted.maxActiveSchedules).toBe(0);
      expect(untrusted.maxFileUploadsPerDay).toBe(1);
      expect(untrusted.maxEventsPerImport).toBe(100);
      expect(untrusted.maxTotalEvents).toBe(100);
      expect(untrusted.maxFileSizeMB).toBe(1);
    });

    it("BASIC (level 1) quotas allow more than UNTRUSTED", () => {
      const config = getAppConfig();
      const basic = config.quotas[1]!;

      expect(basic.maxActiveSchedules).toBe(1);
      expect(basic.maxEventsPerImport).toBe(1000);
      expect(basic.maxTotalEvents).toBe(5000);
      expect(basic.maxFileSizeMB).toBe(10);
    });

    it("UNLIMITED (level 5) quotas use -1 for unlimited fields", () => {
      const config = getAppConfig();
      const unlimited = config.quotas[5]!;

      expect(unlimited.maxActiveSchedules).toBe(-1);
      expect(unlimited.maxTotalEvents).toBe(-1);
      expect(unlimited.maxIngestJobsPerDay).toBe(-1);
      // fileSizeMB has a cap even for unlimited
      expect(unlimited.maxFileSizeMB).toBe(1000);
    });

    it("has all 6 trust levels defined (0-5)", () => {
      const config = getAppConfig();

      for (let level = 0; level <= 5; level++) {
        const quota = config.quotas[level];
        expect(quota).toBeDefined();
        expect(quota).toHaveProperty("maxActiveSchedules");
        expect(quota).toHaveProperty("maxTotalEvents");
      }
    });
  });

  describe("batch size defaults", () => {
    it("eventCreation defaults to 1000", () => {
      const config = getAppConfig();

      expect(config.batchSizes.eventCreation).toBe(1000);
    });

    it("schemaDetection defaults to 10000", () => {
      const config = getAppConfig();

      expect(config.batchSizes.schemaDetection).toBe(10_000);
    });

    it("duplicateAnalysis defaults to 5000", () => {
      const config = getAppConfig();

      expect(config.batchSizes.duplicateAnalysis).toBe(5000);
    });

    it("databaseChunk defaults to 1000", () => {
      const config = getAppConfig();

      expect(config.batchSizes.databaseChunk).toBe(1000);
    });
  });

  describe("batch size env var overrides", () => {
    it("BATCH_SIZE_EVENT_CREATION env var takes precedence over default", () => {
      vi.stubEnv("BATCH_SIZE_EVENT_CREATION", "500");
      resetEnv();
      resetAppConfig();

      const config = getAppConfig();

      expect(config.batchSizes.eventCreation).toBe(500);
    });

    it("BATCH_SIZE_SCHEMA_DETECTION env var takes precedence over default", () => {
      vi.stubEnv("BATCH_SIZE_SCHEMA_DETECTION", "20000");
      resetEnv();
      resetAppConfig();

      const config = getAppConfig();

      expect(config.batchSizes.schemaDetection).toBe(20_000);
    });

    it("BATCH_SIZE_DUPLICATE_ANALYSIS env var takes precedence over default", () => {
      vi.stubEnv("BATCH_SIZE_DUPLICATE_ANALYSIS", "3000");
      resetEnv();
      resetAppConfig();

      const config = getAppConfig();

      expect(config.batchSizes.duplicateAnalysis).toBe(3000);
    });

    it("BATCH_SIZE_DATABASE_CHUNK env var takes precedence over default", () => {
      vi.stubEnv("BATCH_SIZE_DATABASE_CHUNK", "2000");
      resetEnv();
      resetAppConfig();

      const config = getAppConfig();

      expect(config.batchSizes.databaseChunk).toBe(2000);
    });
  });

  describe("account defaults", () => {
    it("deletionGracePeriodDays defaults to 30", () => {
      const config = getAppConfig();

      expect(config.account.deletionGracePeriodDays).toBe(30);
    });
  });

  describe("cache defaults", () => {
    it("urlFetch.defaultTtlSeconds defaults to 3600", () => {
      const config = getAppConfig();

      expect(config.cache.urlFetch.defaultTtlSeconds).toBe(3600);
    });

    it("urlFetch.maxSizeBytes defaults to 100MB", () => {
      const config = getAppConfig();

      expect(config.cache.urlFetch.maxSizeBytes).toBe(104_857_600);
    });

    it("urlFetch.respectCacheControl defaults to true", () => {
      const config = getAppConfig();

      expect(config.cache.urlFetch.respectCacheControl).toBe(true);
    });

    it("urlFetch.maxTtlSeconds defaults to 30 days", () => {
      const config = getAppConfig();

      expect(config.cache.urlFetch.maxTtlSeconds).toBe(2_592_000);
    });
  });

  describe("caching", () => {
    it("returns the same object on second call", () => {
      const first = getAppConfig();
      const second = getAppConfig();

      expect(first).toBe(second);
    });

    it("re-parses after resetAppConfig() clears the cache", () => {
      const first = getAppConfig();
      resetAppConfig();
      const second = getAppConfig();

      expect(first).not.toBe(second);
      // But values should be equal since no YAML changed
      expect(first).toEqual(second);
    });
  });

  describe("YAML loading and deep merge", () => {
    it("deep merges YAML partial quota override with defaults", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
quotas:
  "1":
    maxTotalEvents: 99999
`);
      resetAppConfig();

      const config = getAppConfig();

      const basic = config.quotas[1]!;
      // The overridden value
      expect(basic.maxTotalEvents).toBe(99999);
      // Other fields from defaults are preserved
      expect(basic.maxActiveSchedules).toBe(1);
      expect(basic.maxEventsPerImport).toBe(1000);
      expect(basic.maxFileSizeMB).toBe(10);
    });

    it("deep merges YAML cache override, preserving other fields", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
cache:
  urlFetch:
    defaultTtlSeconds: 7200
`);
      resetAppConfig();

      const config = getAppConfig();

      // Overridden
      expect(config.cache.urlFetch.defaultTtlSeconds).toBe(7200);
      // Defaults preserved
      expect(config.cache.urlFetch.maxSizeBytes).toBe(104_857_600);
      expect(config.cache.urlFetch.respectCacheControl).toBe(true);
    });

    it("YAML rate limit override replaces entire endpoint config", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
rateLimits:
  FILE_UPLOAD:
    windows:
      - limit: 10
        windowMs: 1000
        name: "custom"
`);
      resetAppConfig();

      const config = getAppConfig();

      // Entirely replaced, not merged
      expect(config.rateLimits.FILE_UPLOAD.windows).toHaveLength(1);
      expect(config.rateLimits.FILE_UPLOAD.windows[0]).toEqual({ limit: 10, windowMs: 1000, name: "custom" });
      // Other rate limits still have defaults
      expect(config.rateLimits.API_GENERAL.windows.length).toBeGreaterThan(0);
    });

    it("YAML account override merges with defaults", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
account:
  deletionGracePeriodDays: 7
`);
      resetAppConfig();

      const config = getAppConfig();

      expect(config.account.deletionGracePeriodDays).toBe(7);
    });

    it("YAML batch sizes can be partially overridden", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
batchSizes:
  eventCreation: 2000
`);
      resetAppConfig();

      const config = getAppConfig();

      expect(config.batchSizes.eventCreation).toBe(2000);
      // Other batch sizes keep defaults
      expect(config.batchSizes.schemaDetection).toBe(10_000);
      expect(config.batchSizes.duplicateAnalysis).toBe(5000);
    });

    it("env var overrides YAML batch size value", () => {
      vi.stubEnv("BATCH_SIZE_EVENT_CREATION", "300");
      resetEnv();

      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
batchSizes:
  eventCreation: 2000
`);
      resetAppConfig();

      const config = getAppConfig();

      // Env var wins over YAML
      expect(config.batchSizes.eventCreation).toBe(300);
    });
  });

  describe("YAML validation (strict mode)", () => {
    it("rejects YAML with unknown top-level key", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue(`
rateLimits: {}
unknownKey: true
`);
      resetAppConfig();

      expect(() => getAppConfig()).toThrow();
    });

    it("accepts valid empty YAML file", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue("");
      resetAppConfig();

      // Empty YAML parses to null, which is handled as empty config
      expect(() => getAppConfig()).not.toThrow();

      const config = getAppConfig();
      expect(config.batchSizes.eventCreation).toBe(1000);
    });

    it("handles YAML file with only comments gracefully", () => {
      existsSyncSpy.mockReturnValue(true);
      readFileSyncSpy.mockReturnValue("# This is just a comment\n");
      resetAppConfig();

      expect(() => getAppConfig()).not.toThrow();
    });
  });

  describe("trust level rate limits", () => {
    it("has all 6 trust levels for trust-level rate limits", () => {
      const config = getAppConfig();

      for (let level = 0; level <= 5; level++) {
        const tlrl = config.trustLevelRateLimits[level];
        expect(tlrl).toBeDefined();
        expect(tlrl).toHaveProperty("FILE_UPLOAD");
        expect(tlrl).toHaveProperty("API_GENERAL");
      }
    });

    it("UNLIMITED trust level has highest rate limits", () => {
      const config = getAppConfig();
      const unlimited = config.trustLevelRateLimits[5]!;
      const untrusted = config.trustLevelRateLimits[0]!;

      const unlimitedBurst = unlimited.API_GENERAL.windows.find((w) => w.name === "burst");
      const untrustedBurst = untrusted.API_GENERAL.windows.find((w) => w.name === "burst");

      expect(unlimitedBurst!.limit).toBeGreaterThan(untrustedBurst!.limit);
    });
  });
});
