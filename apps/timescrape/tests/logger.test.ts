/**
 * Tests for LOG_FILE handling.
 *
 * `LOG_FILE` is one deployment-level contract shared with apps/web: set it, and the process
 * writes to stdout AND the file. This app used to silently skip the file in development.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string;

const readLoggerWithEnv = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return (await import("../src/lib/logger.js")).logger;
};

describe.sequential("timescrape logger", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timescrape-logger-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each(["production", "development"])("writes to LOG_FILE in %s", async (nodeEnv) => {
    const logFile = path.join(tempDir, `${nodeEnv}.log`);

    const logger = await readLoggerWithEnv({ NODE_ENV: nodeEnv, LOG_FILE: logFile, LOG_LEVEL: "info" });
    logger.info({ marker: "written" }, "log file check");
    logger.flush();

    await vi.waitFor(() => {
      expect(fs.existsSync(logFile)).toBe(true);
      expect(fs.readFileSync(logFile, "utf8")).toContain("log file check");
    });
  });

  it("logs without a file when LOG_FILE is unset", async () => {
    const logger = await readLoggerWithEnv({ NODE_ENV: "production", LOG_LEVEL: "info" });

    expect(() => logger.info("no file configured")).not.toThrow();
    expect(fs.readdirSync(tempDir)).toHaveLength(0);
  });
});
