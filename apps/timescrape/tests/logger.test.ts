/**
 * Tests for LOG_FILE handling.
 *
 * `LOG_FILE` is one deployment-level contract shared with apps/web: set it, and the process
 * writes to stdout AND the file. This app used to silently skip the file in development.
 */
import { execFileSync } from "node:child_process";
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

  it("logs to stdout when LOG_FILE is unset", () => {
    // A child process, because pino writes to file descriptor 1 directly rather than through process.stdout.
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", LOG_LEVEL: "info" };
    delete env.LOG_FILE;
    const loggerUrl = new URL("../src/lib/logger.ts", import.meta.url).href;

    const stdout = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `const { logger } = await import(${JSON.stringify(loggerUrl)}); logger.info("stdout check");`,
      ],
      { env, encoding: "utf-8" }
    );

    expect(JSON.parse(stdout.trim())).toMatchObject({ name: "timescrape", msg: "stdout check" });
  });
});
