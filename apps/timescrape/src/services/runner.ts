/**
 * Podman container lifecycle management for scraper execution.
 *
 * **Single-instance design**: All run tracking, metrics, and concurrency
 * limits are held in module-level memory. This is intentional — the runner
 * is deployed as a single ephemeral process. If multi-instance deployment
 * is ever needed, run tracking should move to a shared store (e.g. Redis
 * or the web app's database).
 *
 * @module
 * @category Services
 */

import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { SCRAPER_CLONE_DEADLINE_SECONDS, SCRAPER_DEFAULT_OUTPUT_FILE, SCRAPER_RUNTIMES } from "@timetiles/shared";

import { getConfig } from "../config.js";
import { countCsvDataRows } from "../lib/csv.js";
import { ConcurrencyError, OutputValidationError, RunnerError } from "../lib/errors.js";
import { logError, logger } from "../lib/logger.js";
import { isShuttingDown } from "../lib/shutdown.js";
import {
  buildPodmanArgs,
  CONTAINER_STOP_GRACE_SECS,
  SCRAPER_SANDBOX_NETWORK,
  scraperImage,
} from "../security/container-config.js";
import type { RunRequest, RunResult } from "../types.js";
import { prepareCode } from "./code-prep.js";
import { validateOutput } from "./output-validator.js";

const execFileAsync = promisify(execFile);

/** Headroom on top of the run timeout for podman to create and start the container. */
const CONTAINER_START_GRACE_MS = 5000;
/** Client timeouts of the kill escalation; `stop` must outlast podman's own grace period. */
const STOP_CLIENT_TIMEOUT_MS = (CONTAINER_STOP_GRACE_SECS + 5) * 1000;
const KILL_CLIENT_TIMEOUT_MS = 10_000;
const RM_CLIENT_TIMEOUT_MS = 15_000;
const WORK_DIR_CLEANUP_TIMEOUT_MS = 30_000;
const PS_CLIENT_TIMEOUT_MS = 15_000;

/** Worst case this runner adds to a run's timeout before answering; must fit the shared overhead. */
export const RUNNER_MAX_OVERHEAD_SECS =
  SCRAPER_CLONE_DEADLINE_SECONDS +
  (CONTAINER_START_GRACE_MS +
    STOP_CLIENT_TIMEOUT_MS +
    KILL_CLIENT_TIMEOUT_MS +
    RM_CLIENT_TIMEOUT_MS +
    WORK_DIR_CLEANUP_TIMEOUT_MS) /
    1000;

/** In-memory set of active run IDs. Resets on process restart. */
const activeRuns = new Set<string>();

/** Metrics counters — non-durable, reset on process restart. */
const startedAt = Date.now();
let totalRuns = 0;
let totalSuccess = 0;
let totalFailed = 0;
let totalTimeout = 0;

export interface RunnerMetrics {
  active_runs: number;
  total_runs: number;
  total_success: number;
  total_failed: number;
  total_timeout: number;
  uptime_seconds: number;
  queue_capacity: number;
}

export const getMetrics = (): RunnerMetrics => {
  const config = getConfig();
  return {
    active_runs: activeRuns.size,
    total_runs: totalRuns,
    total_success: totalSuccess,
    total_failed: totalFailed,
    total_timeout: totalTimeout,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    queue_capacity: config.SCRAPER_MAX_CONCURRENT,
  };
};

/** How long a runtime health answer is reused, so probes cannot pile up podman calls. */
export const RUNTIME_HEALTH_CACHE_MS = 30_000;
const RUNTIME_CHECK_TIMEOUT_MS = 5000;

export interface RuntimeHealth {
  ok: boolean;
  /** Images and networks podman could not confirm, e.g. `image timescrape-node`. */
  unavailable: string[];
}

let runtimeHealth: { checkedAt: number; result: Promise<RuntimeHealth> } | undefined;

const probeRuntime = async (): Promise<RuntimeHealth> => {
  const checks: Array<[kind: "image" | "network", name: string]> = [
    ...SCRAPER_RUNTIMES.map((runtime): ["image", string] => ["image", scraperImage(runtime)]),
    ["network", SCRAPER_SANDBOX_NETWORK],
  ];
  const answers = await Promise.all(
    checks.map(async ([kind, name]) => {
      try {
        await execFileAsync("podman", [kind, "exists", name], { timeout: RUNTIME_CHECK_TIMEOUT_MS });
        return null;
      } catch {
        return `${kind} ${name}`;
      }
    })
  );
  const unavailable = answers.filter((answer) => answer !== null);
  return { ok: unavailable.length === 0, unavailable };
};

/** Whether podman can start a run at all: every runtime image and the sandbox network exist. */
export const getRuntimeHealth = (): Promise<RuntimeHealth> => {
  if (!runtimeHealth || Date.now() - runtimeHealth.checkedAt >= RUNTIME_HEALTH_CACHE_MS) {
    runtimeHealth = { checkedAt: Date.now(), result: probeRuntime() };
  }
  return runtimeHealth.result;
};

/** How often the run-data sweep runs. */
const RUN_DATA_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h

/**
 * Remove run data nothing will clean up any more.
 *
 * Persistent outputs older than the TTL: the web app's `DELETE /output/:runId`
 * is best-effort and skipped without autoImport. Work directories of runs that
 * are not active: a crash or restart skips executeRun's own cleanup.
 */
export const sweepStaleRunData = async (): Promise<void> => {
  const config = getConfig();
  const ttlHours = config.SCRAPER_OUTPUT_TTL_HOURS;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const outputsBase = join(config.SCRAPER_DATA_DIR, "outputs");
  const runsBase = join(config.SCRAPER_DATA_DIR, "runs");

  for (const entry of await readdir(outputsBase).catch(() => [] as string[])) {
    const dir = join(outputsBase, entry);
    try {
      const stats = await stat(dir);
      if (Date.now() - stats.mtimeMs > ttlMs) {
        await rm(dir, { recursive: true, force: true });
        logger.info({ dir, ttlHours }, "Swept stale scraper output directory");
      }
    } catch (error) {
      logError(error, "Failed to sweep scraper output directory", { dir });
    }
  }

  try {
    await removeOrphanedContainers();
  } catch (error) {
    // An orphan may still be writing into its work directory, so leave them all for the next sweep.
    logError(error, "Failed to remove leftover scraper containers, keeping work directories");
    return;
  }

  for (const entry of await readdir(runsBase).catch(() => [] as string[])) {
    if (activeRuns.has(entry)) continue;
    const dir = join(runsBase, entry);
    try {
      await removeContainerWrittenDir(dir);
      logger.info({ dir }, "Swept leftover scraper work directory");
    } catch (error) {
      logError(error, "Failed to sweep scraper work directory", { dir });
    }
  }
};

/** Force-remove run containers no active run owns, e.g. those a runner restart left running. */
const removeOrphanedContainers = async (): Promise<void> => {
  const { stdout } = await execFileAsync("podman", ["ps", "-a", "--filter", "name=^run-", "--format", "{{.Names}}"], {
    timeout: PS_CLIENT_TIMEOUT_MS,
  });
  const orphans = stdout.split("\n").filter((name) => name.startsWith("run-") && !activeRuns.has(name.slice(4)));

  for (const name of orphans) {
    await execFileAsync("podman", ["rm", "-f", "-t", "0", name], { timeout: RM_CLIENT_TIMEOUT_MS });
    logger.info({ container: name }, "Removed leftover scraper container");
  }
};

let sweepTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Sweep now, then hourly. Idempotent; the interval is unref'd so it never keeps
 * the process alive. Sweeping at startup clears what a crashed process left.
 */
export const startRunDataSweep = (): void => {
  if (sweepTimer) return;
  void sweepStaleRunData();
  sweepTimer = setInterval(() => {
    void sweepStaleRunData();
  }, RUN_DATA_SWEEP_INTERVAL_MS);
  sweepTimer.unref();
};

/**
 * Terminate a run's container, escalating until it is actually gone.
 *
 * Every step here is sized against podman's OWN grace period, because the
 * previous shape could not kill anything: it ran `podman stop` under a 10s
 * client timeout against a container configured with `--stop-timeout` equal to
 * the run timeout (up to 3600s), then fell back to `podman rm -f` under a 5s
 * client timeout while `rm --force` itself waits out the same grace before
 * SIGKILL. Both calls were killed before podman ever reached the SIGKILL step,
 * so a container ignoring SIGTERM survived the timeout meant to end it.
 *
 *   1. `podman stop -t <grace>` — lets a well-behaved scraper flush and exit.
 *      The client timeout exceeds the grace so podman's own SIGKILL can land.
 *   2. `podman kill -s KILL` — no grace period at all, for a container that
 *      ignored SIGTERM or a stop that failed for any other reason.
 *   3. `podman rm -f -t 0` — backstop. `--rm` normally reaps the container, but
 *      a container that never started, or a podman-side failure, can leave one
 *      behind holding the run name and its share of the disk. `-t 0` skips the
 *      SIGTERM wait so this cannot hang either.
 */
const forceKillContainer = async (runId: string): Promise<void> => {
  const name = `run-${runId}`;

  try {
    await execFileAsync("podman", ["stop", "-t", String(CONTAINER_STOP_GRACE_SECS), name], {
      timeout: STOP_CLIENT_TIMEOUT_MS,
    });
    return;
  } catch (error) {
    logger.info({ runId, error: String(error) }, "podman stop did not complete, escalating to SIGKILL");
  }

  try {
    await execFileAsync("podman", ["kill", "-s", "KILL", name], { timeout: KILL_CLIENT_TIMEOUT_MS });
  } catch (error) {
    logger.info({ runId, error: String(error) }, "podman kill failed, attempting force-remove");
  }

  try {
    await execFileAsync("podman", ["rm", "-f", "-t", "0", name], { timeout: RM_CLIENT_TIMEOUT_MS });
  } catch {
    // Already removed by `--rm`, or never created. Nothing left to do.
  }
};

type ContainerOutcome = { stdout: string; stderr: string; exitCode: number; timedOut: boolean };

/**
 * Run the container under a deadline the runner enforces itself.
 *
 * execFile's `timeout` only SIGTERMs the podman client, which proxies it to the
 * container, so a scraper ignoring TERM kept running and could still report
 * success. At the deadline the container is killed through podman, then the
 * client is SIGKILLed, and the run counts as timed out whatever it exited with.
 */
const runPodmanContainer = async (
  runId: string,
  podmanArgs: string[],
  timeoutSecs: number
): Promise<ContainerOutcome> => {
  const run = execFileAsync("podman", podmanArgs, { maxBuffer: 10 * 1024 * 1024 });
  let killing: Promise<void> | undefined;
  const timer = setTimeout(
    () => {
      killing = killContainerAndClient(runId, run.child);
    },
    timeoutSecs * 1000 + CONTAINER_START_GRACE_MS
  );

  let result: Omit<ContainerOutcome, "timedOut">;
  try {
    const { stdout, stderr } = await run;
    result = { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    // `code` is typed number but Node sets STRING codes for non-exit failures
    // ("ERR_CHILD_PROCESS_STDIO_MAXBUFFER", "ENOENT"); keep those out of the numeric exit_code.
    const execError = error as { stdout?: string; stderr?: string; code?: number | string };
    const exitCode = typeof execError.code === "number" ? execError.code : 1;
    const codeNote = typeof execError.code === "string" ? `\n[runner] process error: ${execError.code}` : "";
    result = { stdout: execError.stdout ?? "", stderr: `${execError.stderr ?? ""}${codeNote}`, exitCode };
  } finally {
    clearTimeout(timer);
  }

  if (killing) {
    await killing;
    return { ...result, exitCode: -1, timedOut: true };
  }
  return { ...result, timedOut: false };
};

const killContainerAndClient = async (runId: string, client: ChildProcess): Promise<void> => {
  await forceKillContainer(runId);
  client.kill("SIGKILL");
};

/** How often the output watchdog samples the output directory. */
const OUTPUT_WATCHDOG_INTERVAL_MS = 2000;

/** Size of a file in bytes, or 0 when it vanished or cannot be read. */
const fileSize = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
};

interface DirectoryUsage {
  bytes: number;
  entries: number;
}

/** Bytes and entries in a directory tree, ignoring anything unreadable; stops counting past `maxEntries`. */
const measureDirectory = async (
  dir: string,
  maxEntries: number,
  usage: DirectoryUsage = { bytes: 0, entries: 0 }
): Promise<DirectoryUsage> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    usage.entries++;
    if (usage.entries > maxEntries) return usage;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await measureDirectory(full, maxEntries, usage);
    } else if (entry.isFile()) {
      const size = await fileSize(full);
      usage.bytes += size;
    }
  }
  return usage;
};

/**
 * Kill a run as soon as its output exceeds the configured size or entry cap.
 *
 * SCRAPER_MAX_OUTPUT_SIZE_MB was only ever checked in `collectOutput`, after
 * the container exited — by which point the bytes are already on the runner
 * host's disk, so the limit could not prevent the write it exists to limit.
 * `/output` is a bind mount and carries no quota of its own (see the mount
 * comment in security/container-config.ts), so the cap has to be enforced from
 * out here while the run is still in flight.
 *
 * Sampling means the bound is approximate: a run can overshoot by whatever it
 * writes within one interval. That is a far weaker guarantee than a quota, but
 * it turns "fills the host disk" into "overshoots the cap briefly". A hard
 * bound requires SCRAPER_DATA_DIR to sit on a size-limited filesystem.
 */
const startOutputWatchdog = (
  runId: string,
  outputDir: string,
  limits: { maxSizeMb: number; maxEntries: number }
): { stop: () => void; breach: () => string | undefined } => {
  const maxBytes = limits.maxSizeMb * 1024 * 1024;
  let breach: string | undefined;
  let checking = false;

  const check = async (): Promise<void> => {
    try {
      const { bytes, entries } = await measureDirectory(outputDir, limits.maxEntries);
      if (breach) return;
      if (entries > limits.maxEntries) {
        breach = `Output held more than ${limits.maxEntries} entries`;
      } else if (bytes > maxBytes) {
        breach = `Output exceeded the ${limits.maxSizeMb}MB limit`;
      } else {
        return;
      }
      logger.warn({ runId, bytes, entries, ...limits }, "Scraper output exceeded its limits, killing container");
      await forceKillContainer(runId);
    } catch (error) {
      logError(error, "Output watchdog check failed", { runId, outputDir });
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(() => {
    // Skip if a sample is still in flight: a large tree can take longer to walk
    // than the interval, and overlapping walks would pile up.
    if (checking || breach) return;
    checking = true;
    void check();
  }, OUTPUT_WATCHDOG_INTERVAL_MS);
  timer.unref();

  return { stop: () => clearInterval(timer), breach: () => breach };
};

/**
 * Remove a work directory that a container may have taken ownership of.
 *
 * The output mount uses `:U`, so Podman chowns it into the container's mapped
 * subuid range. Those uids are not the runner's own, which leaves it unable to
 * unlink anything inside -- a plain remove fails with EPERM and the directory
 * leaks. `podman unshare` runs inside the user namespace that owns those
 * subuids, which is what makes the tree removable again without root.
 *
 * Only this directory needs it. Persistent outputs are written by the runner
 * itself via writeFile, so they stay owned by the runner and remove normally.
 */
const removeContainerWrittenDir = async (dir: string): Promise<void> => {
  try {
    await execFileAsync("podman", ["unshare", "rm", "-rf", dir], { timeout: WORK_DIR_CLEANUP_TIMEOUT_MS });
  } catch (error) {
    // A run that failed before starting a container leaves the tree owned by
    // the runner, where a plain remove is both sufficient and cheaper than
    // reaching for Podman -- so treat this as the expected path, not a defect.
    logger.info({ dir, error: String(error) }, "podman unshare cleanup unavailable, removing directly");
    await rm(dir, { recursive: true, force: true });
  }
};

type CollectedOutput = { output: RunResult["output"] | undefined; exitCode: number; stderr: string };

/**
 * Record a bad output as a FAILED RUN carrying the scraper's own logs.
 *
 * Throwing `OutputValidationError` here used to answer the caller with HTTP
 * 422, which discards stdout and stderr — the operator saw "invalid output"
 * and had no way to learn why the scraper produced it. Bad output is a fact
 * ABOUT the run, not a malformed request, so it belongs in the run record.
 * An already-failing exit code is preserved; a scraper that claimed success
 * is forced to exit 1.
 */
const failedOutput = (exitCode: number, stderr: string, reason: string): CollectedOutput => ({
  output: undefined,
  exitCode: exitCode === 0 ? 1 : exitCode,
  stderr: `${stderr}\n[runner] ${reason}`,
});

/** Read the whole file, or null when it holds more than `limit` bytes. */
const readAtMost = async (handle: FileHandle, limit: number): Promise<Buffer | null> => {
  const buffer = Buffer.alloc(limit + 1);
  let total = 0;
  let bytesRead = -1;
  while (bytesRead !== 0 && total <= limit) {
    ({ bytesRead } = await handle.read(buffer, total, buffer.length - total, null));
    total += bytesRead;
  }
  return total > limit ? null : buffer.subarray(0, total);
};

/**
 * Open the output without trusting the scraper's filesystem entries.
 *
 * The runner runs as a host user, so following a planted symlink would read
 * host files (secrets, /dev/zero) into the run output. O_NOFOLLOW refuses the
 * link, O_NONBLOCK stops a FIFO from blocking the open, and every later check
 * and read uses this one handle.
 */
type OpenedOutput = { handle: FileHandle } | { missing: true } | { unreadable: string };

const openOutputFile = async (outputFile: string): Promise<OpenedOutput> => {
  try {
    return { handle: await open(outputFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { missing: true };
    return { unreadable: `Output file is not a readable regular file (${code ?? String(error)})` };
  }
};

const collectOutput = async (
  outputDir: string,
  outputFileName: string,
  maxSizeMb: number,
  exitCode: number,
  stderr: string,
  runId: string
): Promise<CollectedOutput> => {
  const outputFile = join(outputDir, outputFileName);
  // A path escape is a malformed REQUEST, not a run outcome, so it stays an
  // HTTP error — the request could never have produced a valid run.
  if (!resolve(outputFile).startsWith(resolve(outputDir) + "/")) {
    throw new RunnerError("output_file escapes output directory", "INVALID_REQUEST", 400);
  }

  // Success/failure split for output, made explicit:
  //   - file MISSING            -> failure. The scraper never wrote a result;
  //                                if it also exited 0 it lied about its work.
  //   - file present, 0 records -> SUCCESS with rows: 0. Finding nothing is a
  //                                valid scrape (an empty listing page today).
  //   - file present, oversize,
  //     headerless or not a
  //     regular file            -> failure. Real output, unusable shape.
  // Every failure branch keeps stdout/stderr so the cause stays visible.
  const opened = await openOutputFile(outputFile);
  if ("missing" in opened) {
    return exitCode === 0
      ? failedOutput(exitCode, stderr, `No output file produced at ${outputFileName}`)
      : { output: undefined, exitCode, stderr };
  }
  if ("unreadable" in opened) return failedOutput(exitCode, stderr, opened.unreadable);
  const { handle } = opened;

  let content: Buffer;
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return failedOutput(exitCode, stderr, "Output file is not a regular file");

    const sizeMb = stats.size / (1024 * 1024);
    if (sizeMb > maxSizeMb) {
      return failedOutput(exitCode, stderr, `Output size (${sizeMb.toFixed(1)}MB) exceeds limit (${maxSizeMb}MB)`);
    }

    const read = await readAtMost(handle, stats.size);
    if (!read) return failedOutput(exitCode, stderr, "Output file grew while it was being read");
    content = read;
    validateOutput(content);
  } catch (error) {
    if (error instanceof OutputValidationError) return failedOutput(exitCode, stderr, error.message);
    if (error instanceof RunnerError) throw error;
    return failedOutput(exitCode, stderr, `Could not read output file: ${String(error)}`);
  } finally {
    await handle.close();
  }

  // Count parsed CSV records, not raw lines: a quoted field may contain line
  // breaks, so line counting inflates the row total on any multi-line value.
  const rows = countCsvDataRows(content.toString("utf-8"));

  try {
    // Persist the bytes already read, never the path, which the scraper controls.
    const config = getConfig();
    const persistentDir = join(config.SCRAPER_DATA_DIR, "outputs", runId);
    await mkdir(persistentDir, { recursive: true });
    await writeFile(join(persistentDir, outputFileName), content);
  } catch (error) {
    return failedOutput(exitCode, stderr, `Could not persist output file: ${String(error)}`);
  }

  const downloadUrl = `/output/${runId}/${outputFileName}`;
  return { output: { rows, bytes: content.length, download_url: downloadUrl }, exitCode, stderr };
};

/** Create the run's directories and fetch its code; a shutdown meanwhile means the run must not start. */
const prepareRun = async (request: RunRequest, codeDir: string, outputDir: string): Promise<void> => {
  await mkdir(codeDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await prepareCode(request, codeDir);

  // Shutdown already stopped the containers it knew of; one started now would outlive the runner.
  if (isShuttingDown()) {
    throw new RunnerError("Runner is shutting down; the run was not started", "RUNNER_SHUTTING_DOWN", 503);
  }
};

export const executeRun = async (request: RunRequest): Promise<RunResult> => {
  const config = getConfig();

  // A second request under an active id would share, and then delete, the first run's work directory.
  if (activeRuns.has(request.run_id)) {
    throw new RunnerError(`Run ${request.run_id} is already active`, "RUN_ALREADY_ACTIVE", 409);
  }

  if (activeRuns.size >= config.SCRAPER_MAX_CONCURRENT) {
    throw new ConcurrencyError(config.SCRAPER_MAX_CONCURRENT);
  }

  const runId = request.run_id;
  const runStartedAt = Date.now();

  totalRuns++;
  activeRuns.add(runId);

  const workDir = join(config.SCRAPER_DATA_DIR, "runs", runId);
  const codeDir = join(workDir, "code");
  const outputDir = join(workDir, "output");

  try {
    // One source of truth for the filename: the container is told where to
    // write and `collectOutput` reads the same name back.
    const outputFileName = request.output_file ?? SCRAPER_DEFAULT_OUTPUT_FILE;

    const timeoutSecs = request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT;

    // Built before fetching code so a request with rejected env fails without a clone.
    const podmanArgs = buildPodmanArgs({
      runId,
      runtime: request.runtime,
      entrypoint: request.entrypoint,
      codeDir,
      outputDir,
      outputFile: outputFileName,
      env: request.env ?? {},
      limits: { timeoutSecs, memoryMb: request.limits?.memory_mb ?? config.SCRAPER_DEFAULT_MEMORY },
    });

    await prepareRun(request, codeDir, outputDir);

    logger.info({ runId, runtime: request.runtime, entrypoint: request.entrypoint }, "Starting scraper container");

    // Bound the output write while it happens; the post-run size check in
    // collectOutput cannot, because by then the bytes are already on disk.
    const watchdog = startOutputWatchdog(runId, outputDir, {
      maxSizeMb: config.SCRAPER_MAX_OUTPUT_SIZE_MB,
      maxEntries: config.SCRAPER_MAX_OUTPUT_ENTRIES,
    });
    let outcome: ContainerOutcome;
    try {
      outcome = await runPodmanContainer(runId, podmanArgs, timeoutSecs);
    } finally {
      watchdog.stop();
    }
    const { stdout, stderr, exitCode } = outcome;

    const durationMs = Date.now() - runStartedAt;

    if (outcome.timedOut) {
      totalTimeout++;
      logger.info({ runId, status: "timeout", durationMs }, "Scraper run killed at its timeout");
      return {
        status: "timeout",
        exit_code: -1,
        duration_ms: durationMs,
        stdout: truncateLog(stdout),
        stderr: truncateLog(`${stderr}\n[runner] Scraper exceeded timeout of ${timeoutSecs}s`),
      };
    }

    // A watchdog kill is a failed run, full stop. Whatever the scraper managed
    // to write is a truncated fragment of a result it never finished, so it is
    // not offered for download — but the logs are kept so the cause is visible.
    const breach = watchdog.breach();
    if (breach) {
      totalFailed++;
      const reason = `${breach}; container was killed mid-run`;
      logger.info({ runId, status: "failed", durationMs }, "Scraper run killed by output watchdog");
      return {
        status: "failed",
        exit_code: exitCode === 0 ? 1 : exitCode,
        duration_ms: durationMs,
        stdout: truncateLog(stdout),
        stderr: truncateLog(`${stderr}\n[runner] ${reason}`),
      };
    }

    const {
      output,
      exitCode: finalExitCode,
      stderr: finalStderr,
    } = await collectOutput(outputDir, outputFileName, config.SCRAPER_MAX_OUTPUT_SIZE_MB, exitCode, stderr, runId);

    const status = finalExitCode === 0 ? "success" : "failed";
    if (status === "success") {
      totalSuccess++;
    } else {
      totalFailed++;
    }
    logger.info({ runId, status, exitCode: finalExitCode, durationMs, rows: output?.rows }, "Scraper run completed");

    return {
      status,
      exit_code: finalExitCode,
      duration_ms: durationMs,
      stdout: truncateLog(stdout),
      stderr: truncateLog(finalStderr),
      output,
    };
  } catch (error) {
    // Count non-timeout failures (clone errors, unexpected throws) so
    // /metrics stays consistent: total = success + failed + timeout.
    totalFailed++;
    logError(error, "Scraper run failed", { runId });
    throw error;
  } finally {
    activeRuns.delete(runId);

    // Cleanup work directory
    try {
      await removeContainerWrittenDir(workDir);
    } catch (error) {
      logError(error, "Failed to cleanup work directory", { runId, workDir });
    }
  }
};

export const stopRun = async (runId: string): Promise<void> => {
  // Same escalation as the timeout path: an operator asking for a stop means
  // the container must go, not that it should be politely asked.
  await forceKillContainer(runId);
  logger.info({ runId }, "Container stopped");
};

/** Ids of runs currently executing — used by the shutdown handler to stop them. */
export const getActiveRunIds = (): string[] => [...activeRuns];

export const isRunActive = (runId: string): boolean => activeRuns.has(runId);

export const getActiveRunCount = (): number => activeRuns.size;

const truncateLog = (log: string, maxBytes: number = 1024 * 1024): string => {
  const byteLength = Buffer.byteLength(log, "utf-8");
  if (byteLength <= maxBytes) return log;
  // Slice conservatively (multi-byte chars may overshoot)
  const truncated = Buffer.from(log, "utf-8").subarray(0, maxBytes).toString("utf-8");
  return truncated + `\n... truncated (${byteLength} bytes total)`;
};
