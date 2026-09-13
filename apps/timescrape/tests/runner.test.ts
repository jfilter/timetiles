import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ConcurrencyError } from "../src/lib/errors.js";
import type { RunRequest } from "../src/types.js";

// The runner drives the real filesystem and a real child process: `podman` on
// PATH is tests/fixtures/podman-stub, which plays the container.
const mockConfig = vi.hoisted(() => ({
  SCRAPER_MAX_CONCURRENT: 2,
  SCRAPER_DEFAULT_TIMEOUT: 300,
  SCRAPER_DEFAULT_MEMORY: 512,
  SCRAPER_DATA_DIR: "",
  SCRAPER_MAX_OUTPUT_SIZE_MB: 1,
  SCRAPER_OUTPUT_TTL_HOURS: 1,
  SCRAPER_MAX_REPO_SIZE_MB: 50,
  SCRAPER_GIT_CLONE_TIMEOUT: 60_000,
}));

vi.mock("../src/config.js", () => ({ getConfig: () => mockConfig, loadConfig: () => mockConfig }));
vi.mock("../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));

const { executeRun, getActiveRunCount, getMetrics, isRunActive, sweepStaleOutputs } =
  await import("../src/services/runner.js");

const STUB_DIR = resolve(import.meta.dirname, "fixtures/podman-stub");
const originalPath = process.env.PATH;

let dataDir: string;
let stateDir: string;

const runStub = (stub: Record<string, string>, overrides: Partial<RunRequest> = {}) =>
  executeRun({
    run_id: randomUUID(),
    runtime: "python",
    entrypoint: "scraper.py",
    code: { "scraper.py": "print('hello')" },
    env: stub,
    ...overrides,
  });

const persistedOutput = (runId: string) => join(dataDir, "outputs", runId);

describe("runner", () => {
  beforeAll(() => {
    process.env.PATH = `${STUB_DIR}:${originalPath}`;
  });

  afterAll(() => {
    process.env.PATH = originalPath;
  });

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "timescrape-runner-"));
    stateDir = mkdtempSync(join(tmpdir(), "timescrape-stub-"));
    mockConfig.SCRAPER_DATA_DIR = dataDir;
    process.env.STUB_STATE_DIR = stateDir;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.STUB_UNKILLABLE;
  });

  describe("executeRun", () => {
    it("rejects with ConcurrencyError when max concurrent runs reached", async () => {
      mockConfig.SCRAPER_MAX_CONCURRENT = 0;
      try {
        await expect(runStub({})).rejects.toThrow(ConcurrencyError);
      } finally {
        mockConfig.SCRAPER_MAX_CONCURRENT = 2;
      }
    });

    it("rejects a run id that is already active without disturbing the first run", { timeout: 15_000 }, async () => {
      const runId = randomUUID();
      const first = runStub({ STUB_SLEEP_MS: "1500", STUB_OUTPUT: "id\n1\n" }, { run_id: runId });
      await vi.waitFor(() => expect(isRunActive(runId)).toBe(true));

      await expect(runStub({ STUB_OUTPUT: "id\n2\n" }, { run_id: runId })).rejects.toMatchObject({
        code: "RUN_ALREADY_ACTIVE",
        statusCode: 409,
      });

      expect((await first).status).toBe("success");
      expect(readFileSync(join(persistedOutput(runId), "data.csv"), "utf-8")).toBe("id\n1\n");
    });

    it("returns success with persisted output and removes the work directory", async () => {
      const csv = "id,title\n1,Event A\n2,Event B\n";
      const runId = randomUUID();

      const result = await runStub({ STUB_OUTPUT: csv, STUB_STDOUT: "scraper output" }, { run_id: runId });

      expect(result.status).toBe("success");
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toBe("scraper output");
      expect(result.output).toEqual({ rows: 2, bytes: csv.length, download_url: `/output/${runId}/data.csv` });
      expect(readFileSync(join(persistedOutput(runId), "data.csv"), "utf-8")).toBe(csv);
      expect(existsSync(join(dataDir, "runs", runId))).toBe(false);
    });

    it("counts CSV records, not lines, when a field spans multiple lines", async () => {
      const result = await runStub({ STUB_OUTPUT: 'id,description\n1,"line one\nline two\nline three"\n2,plain\n' });

      expect(result.status).toBe("success");
      expect(result.output!.rows).toBe(2);
    });

    it("treats a zero-byte output as a successful run of zero rows", async () => {
      const result = await runStub({ STUB_OUTPUT: "", STUB_STDOUT: "no entries today" });

      expect(result.status).toBe("success");
      expect(result.output!.rows).toBe(0);
      expect(result.stdout).toContain("no entries today");
    });

    it("treats a header-only output as a successful run of zero rows", async () => {
      const result = await runStub({ STUB_OUTPUT: "id,title\n" });

      expect(result.status).toBe("success");
      expect(result.output!.rows).toBe(0);
    });

    it("records unusable output as a failed run that keeps the scraper logs", async () => {
      const result = await runStub({
        STUB_OUTPUT: "\n1,A\n2,B\n",
        STUB_STDOUT: "scraped 400 pages",
        STUB_STDERR: "warning: selector missed",
      });

      expect(result.status).toBe("failed");
      expect(result.exit_code).toBe(1);
      expect(result.output).toBeUndefined();
      expect(result.stdout).toContain("scraped 400 pages");
      expect(result.stderr).toContain("warning: selector missed");
      expect(result.stderr).toContain("no header row");
    });

    it("records oversized output as a failed run that keeps the scraper logs", async () => {
      const runId = randomUUID();
      const result = await runStub(
        { STUB_OUTPUT_BYTES: String(2 * 1024 * 1024), STUB_STDOUT: "wrote everything" },
        { run_id: runId }
      );

      expect(result.status).toBe("failed");
      expect(result.stdout).toContain("wrote everything");
      expect(result.stderr).toContain("exceeds limit");
      expect(existsSync(persistedOutput(runId))).toBe(false);
    });

    it("fails a run whose scraper exited 0 without writing an output file", async () => {
      const result = await runStub({ STUB_STDOUT: "done" });

      expect(result.status).toBe("failed");
      expect(result.exit_code).toBe(1);
      expect(result.stderr).toContain("No output file produced");
      expect(result.stdout).toContain("done");
    });

    it("keeps a failing exit code and cleans up the work directory", async () => {
      const runId = randomUUID();
      const result = await runStub({ STUB_EXIT: "3", STUB_STDERR: "container error" }, { run_id: runId });

      expect(result.status).toBe("failed");
      expect(result.exit_code).toBe(3);
      expect(result.stderr).toContain("container error");
      expect(existsSync(join(dataDir, "runs", runId))).toBe(false);
    });

    it("refuses an output symlink to a host file instead of persisting its content", async () => {
      const secretFile = join(stateDir, "env.production");
      writeFileSync(secretFile, "id,secret\n1,hunter2\n");
      const runId = randomUUID();

      const result = await runStub({ STUB_SYMLINK: secretFile }, { run_id: runId });

      expect(result.status).toBe("failed");
      expect(result.output).toBeUndefined();
      expect(result.stderr).toContain("not a readable regular file");
      expect(JSON.stringify(result)).not.toContain("hunter2");
      expect(existsSync(persistedOutput(runId))).toBe(false);
    });

    it("refuses an output symlink to an endless device without reading it", async () => {
      const result = await runStub({ STUB_SYMLINK: "/dev/zero" });

      expect(result.status).toBe("failed");
      expect(result.stderr).toContain("not a readable regular file");
    });

    it("refuses a FIFO as output instead of blocking on it", { timeout: 10_000 }, async () => {
      const result = await runStub({ STUB_FIFO: "1" });

      expect(result.status).toBe("failed");
      expect(result.stderr).toContain("not a regular file");
    });

    it("returns timeout status with the logs written before the limit", { timeout: 20_000 }, async () => {
      const result = await runStub(
        { STUB_SLEEP_MS: "15000", STUB_STDOUT: "fetched page 3", STUB_STDERR: "slow response" },
        { limits: { timeout_secs: 1 } }
      );

      expect(result.status).toBe("timeout");
      expect(result.exit_code).toBe(-1);
      expect(result.stdout).toContain("fetched page 3");
      expect(result.stderr).toContain("slow response");
      expect(result.stderr).toContain("exceeded timeout");
    });

    it(
      "kills a container that ignores SIGTERM instead of reporting its late success",
      { timeout: 25_000 },
      async () => {
        const runId = randomUUID();
        const result = await runStub(
          { STUB_IGNORE_TERM: "1", STUB_SLEEP_MS: "12000", STUB_OUTPUT: "id\n1\n" },
          { run_id: runId, limits: { timeout_secs: 1 } }
        );

        expect(result.status).toBe("timeout");
        expect(result.duration_ms).toBeLessThan(10_000);
        expect(readFileSync(join(stateDir, "calls.log"), "utf-8")).toContain(`stop run-${runId}`);
        expect(existsSync(persistedOutput(runId))).toBe(false);
      }
    );

    it("releases the run slot when podman cannot kill the container", { timeout: 25_000 }, async () => {
      process.env.STUB_UNKILLABLE = "1";

      const result = await runStub({ STUB_IGNORE_TERM: "1", STUB_SLEEP_MS: "12000" }, { limits: { timeout_secs: 1 } });

      expect(result.status).toBe("timeout");
      expect(result.duration_ms).toBeLessThan(10_000);
      expect(getActiveRunCount()).toBe(0);
    });
  });

  describe("sweepStaleOutputs", () => {
    it("removes output directories older than the configured TTL", async () => {
      const stale = join(dataDir, "outputs", "stale-run");
      const fresh = join(dataDir, "outputs", "fresh-run");
      mkdirSync(stale, { recursive: true });
      mkdirSync(fresh, { recursive: true });
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      utimesSync(stale, twoHoursAgo, twoHoursAgo);

      await sweepStaleOutputs();

      expect(existsSync(stale)).toBe(false);
      expect(existsSync(fresh)).toBe(true);
    });
  });

  describe("run bookkeeping", () => {
    it("reports no active runs when idle", () => {
      expect(getActiveRunCount()).toBe(0);
      expect(isRunActive("nonexistent-run-id")).toBe(false);
    });

    it("returns metrics with correct structure", () => {
      const metrics = getMetrics();

      expect(metrics).toEqual({
        active_runs: 0,
        total_runs: expect.any(Number),
        total_success: expect.any(Number),
        total_failed: expect.any(Number),
        total_timeout: expect.any(Number),
        uptime_seconds: expect.any(Number),
        queue_capacity: 2,
      });
    });
  });
});
