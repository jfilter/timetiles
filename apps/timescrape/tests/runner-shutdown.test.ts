import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Separate file: the shutdown flag is process-wide and never resets.
const mockConfig = vi.hoisted(() => ({
  SCRAPER_MAX_CONCURRENT: 2,
  SCRAPER_DEFAULT_TIMEOUT: 300,
  SCRAPER_DEFAULT_MEMORY: 512,
  SCRAPER_DATA_DIR: "",
  SCRAPER_MAX_OUTPUT_SIZE_MB: 1,
  SCRAPER_MAX_OUTPUT_ENTRIES: 1000,
}));
const codePrep = vi.hoisted(() => ({ release: () => {} }));

vi.mock("../src/config.js", () => ({ getConfig: () => mockConfig, loadConfig: () => mockConfig }));
vi.mock("../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));
vi.mock("../src/services/code-prep.js", () => ({
  prepareCode: () =>
    new Promise<void>((resolve) => {
      codePrep.release = resolve;
    }),
}));

const { executeRun, getActiveRunIds, isRunActive, stopRun } = await import("../src/services/runner.js");
const { createShutdownHandler } = await import("../src/lib/shutdown.js");

const STUB_DIR = resolve(import.meta.dirname, "fixtures/podman-stub");
const originalPath = process.env.PATH;

describe("executeRun during shutdown", () => {
  let dataDir: string;
  let stateDir: string;

  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), "timescrape-shutdown-"));
    stateDir = mkdtempSync(join(tmpdir(), "timescrape-shutdown-stub-"));
    mockConfig.SCRAPER_DATA_DIR = dataDir;
    process.env.STUB_STATE_DIR = stateDir;
    process.env.PATH = `${STUB_DIR}:${originalPath}`;
  });

  afterAll(() => {
    process.env.PATH = originalPath;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("fails a run whose code was still being fetched instead of starting its container", async () => {
    const runId = randomUUID();
    const run = executeRun({ run_id: runId, runtime: "python", entrypoint: "main.py", code_url: "https://x/r.git" });
    await vi.waitFor(() => expect(isRunActive(runId)).toBe(true));

    const exit = vi.fn();
    await createShutdownHandler({ closeServer: (done) => done(), getActiveRunIds, stopRun, exit })("SIGTERM");
    codePrep.release();

    await expect(run).rejects.toMatchObject({ code: "RUNNER_SHUTTING_DOWN", statusCode: 503 });
    const calls = existsSync(join(stateDir, "calls.log")) ? readFileSync(join(stateDir, "calls.log"), "utf-8") : "";
    expect(calls).not.toContain("run run-");
    expect(exit).toHaveBeenCalledWith(0);
  });
});
