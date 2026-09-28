import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache so loadConfig() re-parses process.env each time
    vi.resetModules();
    // Create a clean copy of env to avoid leaking between tests
    process.env = { ...originalEnv, SCRAPER_DATA_DIR: "/var/lib/timescrape" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws on missing SCRAPER_API_KEY", async () => {
    delete process.env.SCRAPER_API_KEY;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow();
  });

  it("throws on API key shorter than 16 chars", async () => {
    process.env.SCRAPER_API_KEY = "short";

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("at least 16 characters");
  });

  it("uses defaults for optional fields", async () => {
    process.env.SCRAPER_API_KEY = "a-valid-api-key-long-enough";
    delete process.env.SCRAPER_PORT;
    delete process.env.SCRAPER_MAX_CONCURRENT;
    delete process.env.SCRAPER_DEFAULT_TIMEOUT;
    delete process.env.SCRAPER_DEFAULT_MEMORY;
    delete process.env.SCRAPER_MAX_REPO_SIZE_MB;
    delete process.env.SCRAPER_MAX_OUTPUT_SIZE_MB;
    delete process.env.SCRAPER_MAX_OUTPUT_ENTRIES;
    delete process.env.SCRAPER_OUTPUT_TTL_HOURS;
    delete process.env.NODE_ENV;

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.SCRAPER_OUTPUT_TTL_HOURS).toBe(24);
    expect(config.SCRAPER_PORT).toBe(4000);
    expect(config.SCRAPER_MAX_CONCURRENT).toBe(3);
    expect(config.SCRAPER_DEFAULT_TIMEOUT).toBe(300);
    expect(config.SCRAPER_DEFAULT_MEMORY).toBe(512);
    expect(config.SCRAPER_MAX_REPO_SIZE_MB).toBe(50);
    expect(config.SCRAPER_MAX_OUTPUT_SIZE_MB).toBe(50);
    expect(config.SCRAPER_MAX_OUTPUT_ENTRIES).toBe(10_000);
    expect(config.SCRAPER_DATA_DIR).toBe("/var/lib/timescrape");
    expect(config.NODE_ENV).toBe("development");
  });

  it("requires SCRAPER_DATA_DIR instead of assuming a directory", async () => {
    process.env.SCRAPER_API_KEY = "a-valid-api-key-long-enough";
    delete process.env.SCRAPER_DATA_DIR;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("SCRAPER_DATA_DIR");
  });

  it.each(["0", "-1", "abc"])("rejects output TTL %s instead of silently using the default", async (value) => {
    process.env.SCRAPER_API_KEY = "a-valid-api-key-long-enough";
    process.env.SCRAPER_OUTPUT_TTL_HOURS = value;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow();
  });

  it.each([
    ["SCRAPER_PORT", ""],
    ["SCRAPER_PORT", "1.5"],
    ["SCRAPER_PORT", "70000"],
    ["SCRAPER_MAX_CONCURRENT", ""],
    ["SCRAPER_MAX_CONCURRENT", "0"],
    ["SCRAPER_DEFAULT_TIMEOUT", "-5"],
    ["SCRAPER_DEFAULT_TIMEOUT", "99999"],
    ["SCRAPER_DEFAULT_MEMORY", "1"],
    ["SCRAPER_MAX_REPO_SIZE_MB", "-1"],
    ["SCRAPER_GIT_CLONE_TIMEOUT", "0"],
    ["SCRAPER_MAX_OUTPUT_SIZE_MB", ""],
    ["SCRAPER_DATA_DIR", ""],
    ["SCRAPER_DATA_DIR", "relative/dir"],
  ])("rejects %s=%j instead of running with an unusable value", async (key, value) => {
    process.env.SCRAPER_API_KEY = "a-valid-api-key-long-enough";
    process.env[key] = value;

    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow(key);
  });
});
