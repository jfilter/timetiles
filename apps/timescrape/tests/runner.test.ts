import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SCRAPER_RUNNER_OVERHEAD_SECONDS } from "@timetiles/shared";

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
  SCRAPER_MAX_OUTPUT_ENTRIES: 1000,
  SCRAPER_OUTPUT_TTL_HOURS: 1,
  SCRAPER_MAX_REPO_SIZE_MB: 50,
  SCRAPER_GIT_CLONE_TIMEOUT: 60_000,
}));

vi.mock("../src/config.js", () => ({ getConfig: () => mockConfig, loadConfig: () => mockConfig }));
vi.mock("../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));

const {
  executeRun,
  getActiveRunCount,
  getMetrics,
  getRuntimeHealth,
  isRunActive,
  RUNNER_MAX_OVERHEAD_SECS,
  RUNTIME_HEALTH_CACHE_MS,
  startRunDataSweep,
  sweepStaleRunData,
} = await import("../src/services/runner.js");

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
const podmanCalls = () => readFileSync(join(stateDir, "calls.log"), "utf-8").split("\n");

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
    delete process.env.STUB_PS_FAIL;
    delete process.env.STUB_MISSING;
    delete process.env.STUB_HANG_CHECKS;
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
        expect(podmanCalls()).toContain(`stop run-${runId}`);
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

    it("kills a run mid-write once its output exceeds the size cap", { timeout: 20_000 }, async () => {
      const runId = randomUUID();
      const result = await runStub(
        { STUB_OUTPUT_BYTES: String(2 * 1024 * 1024), STUB_SLEEP_MS: "12000" },
        { run_id: runId }
      );

      expect(result.status).toBe("failed");
      expect(result.stderr).toContain("killed mid-run");
      expect(result.duration_ms).toBeLessThan(12_000);
      expect(podmanCalls()).toContain(`stop run-${runId}`);
      expect(existsSync(persistedOutput(runId))).toBe(false);
    });

    it("kills a run mid-write once its output holds too many entries", { timeout: 20_000 }, async () => {
      mockConfig.SCRAPER_MAX_OUTPUT_ENTRIES = 5;
      try {
        const runId = randomUUID();
        const result = await runStub({ STUB_OUTPUT_ENTRIES: "20", STUB_SLEEP_MS: "12000" }, { run_id: runId });

        expect(result.status).toBe("failed");
        expect(result.stderr).toContain("more than 5 entries");
        expect(result.duration_ms).toBeLessThan(12_000);
        expect(podmanCalls()).toContain(`stop run-${runId}`);
      } finally {
        mockConfig.SCRAPER_MAX_OUTPUT_ENTRIES = 1000;
      }
    });

    it.each([["HOME"], ["LD_PRELOAD"], ["SCRAPER_API_KEY"], ["bad-key"]])(
      "rejects env key %s with 400 before fetching code or starting a container",
      async (key) => {
        await expect(runStub({ [key]: "x" })).rejects.toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
        expect(existsSync(join(stateDir, "calls.log")) ? podmanCalls().some((c) => c.startsWith("run ")) : false).toBe(
          false
        );
      }
    );
  });

  describe("sweepStaleRunData", () => {
    it("removes output directories older than the configured TTL", async () => {
      const stale = join(dataDir, "outputs", "stale-run");
      const fresh = join(dataDir, "outputs", "fresh-run");
      mkdirSync(stale, { recursive: true });
      mkdirSync(fresh, { recursive: true });
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      utimesSync(stale, twoHoursAgo, twoHoursAgo);

      await sweepStaleRunData();

      expect(existsSync(stale)).toBe(false);
      expect(existsSync(fresh)).toBe(true);
    });

    it("removes work directories of runs that are no longer active", { timeout: 15_000 }, async () => {
      const leftover = join(dataDir, "runs", randomUUID(), "output");
      mkdirSync(leftover, { recursive: true });
      const activeId = randomUUID();
      const active = runStub({ STUB_SLEEP_MS: "1500", STUB_OUTPUT: "id\n1\n" }, { run_id: activeId });
      await vi.waitFor(() => expect(isRunActive(activeId)).toBe(true));

      await sweepStaleRunData();

      expect(existsSync(leftover)).toBe(false);
      expect(existsSync(join(dataDir, "runs", activeId))).toBe(true);
      expect((await active).status).toBe("success");
    });

    it("force-removes leftover run containers before deleting their work directories", async () => {
      const orphanId = randomUUID();
      const orphanDir = join(dataDir, "runs", orphanId, "output");
      mkdirSync(orphanDir, { recursive: true });
      const orphan = spawn("sleep", ["60"]);
      writeFileSync(join(stateDir, `run-${orphanId}.pid`), String(orphan.pid));
      const exited = new Promise((resolve) => orphan.once("exit", resolve));

      await sweepStaleRunData();

      await exited;
      const calls = podmanCalls();
      const removed = calls.indexOf(`rm run-${orphanId}`);
      expect(removed).toBeGreaterThanOrEqual(0);
      expect(removed).toBeLessThan(calls.indexOf(`unshare ${join(dataDir, "runs", orphanId)}`));
      expect(existsSync(orphanDir)).toBe(false);
    });

    it("keeps work directories when leftover containers cannot be listed", async () => {
      process.env.STUB_PS_FAIL = "1";
      const leftover = join(dataDir, "runs", randomUUID());
      mkdirSync(leftover, { recursive: true });

      await sweepStaleRunData();

      expect(existsSync(leftover)).toBe(true);
    });

    it("sweeps once immediately when started", async () => {
      const leftover = join(dataDir, "runs", randomUUID());
      mkdirSync(leftover, { recursive: true });

      startRunDataSweep();

      await vi.waitFor(() => expect(existsSync(leftover)).toBe(false));
    });
  });

  describe("response budget", () => {
    it("answers within the overhead callers add to the run timeout", () => {
      expect(RUNNER_MAX_OVERHEAD_SECS).toBeLessThanOrEqual(SCRAPER_RUNNER_OVERHEAD_SECONDS);
    });
  });

  describe("run bookkeeping", () => {
    it("reports no active runs when idle", () => {
      expect(getActiveRunCount()).toBe(0);
      expect(isRunActive("nonexistent-run-id")).toBe(false);
    });

    it("counts each finished run exactly once in the metrics", async () => {
      const before = getMetrics();

      expect((await runStub({ STUB_OUTPUT: "id\n1\n" })).status).toBe("success");
      expect((await runStub({ STUB_EXIT: "3" })).status).toBe("failed");

      const after = getMetrics();
      expect(after.total_runs - before.total_runs).toBe(2);
      expect(after.total_success - before.total_success).toBe(1);
      expect(after.total_failed - before.total_failed).toBe(1);
      expect(after.total_timeout - before.total_timeout).toBe(0);
      expect(after.total_runs).toBe(after.total_success + after.total_failed + after.total_timeout);
      expect(after.active_runs).toBe(0);
    });
  });

  describe("getRuntimeHealth", () => {
    // Each test starts past the previous cache window so answers never leak between tests.
    let clock = Date.UTC(2030, 0, 1);
    const advancePastCache = () => {
      clock += RUNTIME_HEALTH_CACHE_MS + 1;
      vi.setSystemTime(clock);
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      advancePastCache();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reports missing images and the missing sandbox network", async () => {
      process.env.STUB_MISSING = "timescrape-node,scraper-sandbox";

      expect(await getRuntimeHealth()).toEqual({
        ok: false,
        unavailable: ["image timescrape-node", "network scraper-sandbox"],
      });
    });

    it("caches the answer for the cache window", async () => {
      expect(await getRuntimeHealth()).toEqual({ ok: true, unavailable: [] });
      process.env.STUB_MISSING = "timescrape-python";

      expect((await getRuntimeHealth()).ok).toBe(true);
      advancePastCache();
      expect(await getRuntimeHealth()).toEqual({ ok: false, unavailable: ["image timescrape-python"] });
    });

    it("treats a hanging podman as unavailable instead of blocking", { timeout: 20_000 }, async () => {
      process.env.STUB_HANG_CHECKS = "1";
      const startedAt = performance.now();

      const health = await getRuntimeHealth();

      expect(health.ok).toBe(false);
      expect(health.unavailable).toHaveLength(3);
      expect(performance.now() - startedAt).toBeLessThan(10_000);
    });
  });
});
