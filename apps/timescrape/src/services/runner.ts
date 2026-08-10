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

import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { getConfig } from "../config.js";
import { countCsvDataRows } from "../lib/csv.js";
import { ConcurrencyError, OutputValidationError, RunnerError, TimeoutError } from "../lib/errors.js";
import { logError, logger } from "../lib/logger.js";
import { buildPodmanArgs, CONTAINER_STOP_GRACE_SECS } from "../security/container-config.js";
import type { RunRequest, RunResult } from "../types.js";
import { prepareCode } from "./code-prep.js";
import { validateOutput } from "./output-validator.js";

const execFileAsync = promisify(execFile);

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

/** Default TTL for persistent output dirs when SCRAPER_OUTPUT_TTL_HOURS is unset. */
const DEFAULT_OUTPUT_TTL_HOURS = 24;
/** How often the output sweep runs. */
const OUTPUT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h

/**
 * Remove persistent output dirs under {SCRAPER_DATA_DIR}/outputs whose mtime is
 * older than the configured TTL.
 *
 * The runner owns the persistent outputs dir but cannot rely on the web app's
 * best-effort `DELETE /output/:runId` to clean it up: that call only fires on
 * the autoImport-success path, so disabled-autoImport runs and any failed
 * download/DELETE leak files forever. This sweep is the backstop.
 */
export const sweepStaleOutputs = async (): Promise<void> => {
  const config = getConfig();
  const ttlHours = Number(process.env.SCRAPER_OUTPUT_TTL_HOURS) || DEFAULT_OUTPUT_TTL_HOURS;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const base = join(config.SCRAPER_DATA_DIR, "outputs");

  const entries = await readdir(base).catch(() => [] as string[]);
  for (const entry of entries) {
    const dir = join(base, entry);
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
};

let sweepTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Start the periodic output-directory sweep. Idempotent. The interval handle is
 * unref'd so it never keeps the process alive on its own.
 */
export const startOutputSweep = (): void => {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweepStaleOutputs();
  }, OUTPUT_SWEEP_INTERVAL_MS);
  sweepTimer.unref();
};

// Auto-start the sweep on module load (skipped under test to avoid leaking timers).
if (process.env.NODE_ENV !== "test") {
  startOutputSweep();
}

const runPodmanContainer = async (
  podmanArgs: string[],
  timeoutSecs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const timeoutMs = timeoutSecs * 1000 + 5000; // 5s grace
  try {
    const result = await execFileAsync("podman", podmanArgs, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "killed" in error && error.killed) {
      throw new TimeoutError(timeoutSecs);
    }
    // `code` is typed number but Node sets STRING codes for non-exit failures
    // ("ERR_CHILD_PROCESS_STDIO_MAXBUFFER" when stdout exceeds maxBuffer,
    // "ENOENT" when podman is missing) — those must not leak into the numeric
    // exit_code contract, where they fail the web side's run-record validation
    // and discard the run's logs. Surface them in stderr instead.
    const execError = error as { stdout?: string; stderr?: string; code?: number | string };
    const exitCode = typeof execError.code === "number" ? execError.code : 1;
    const codeNote = typeof execError.code === "string" ? `\n[runner] process error: ${execError.code}` : "";
    return { stdout: execError.stdout ?? "", stderr: `${execError.stderr ?? ""}${codeNote}`, exitCode };
  }
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
      timeout: (CONTAINER_STOP_GRACE_SECS + 5) * 1000,
    });
    return;
  } catch (error) {
    logger.info({ runId, error: String(error) }, "podman stop did not complete, escalating to SIGKILL");
  }

  try {
    await execFileAsync("podman", ["kill", "-s", "KILL", name], { timeout: 10_000 });
  } catch (error) {
    logger.info({ runId, error: String(error) }, "podman kill failed, attempting force-remove");
  }

  try {
    await execFileAsync("podman", ["rm", "-f", "-t", "0", name], { timeout: 15_000 });
  } catch {
    // Already removed by `--rm`, or never created. Nothing left to do.
  }
};

/** How often the output watchdog samples the output directory. */
const OUTPUT_WATCHDOG_INTERVAL_MS = 2000;

/** Total bytes held by a directory tree, ignoring anything unreadable. */
const directorySizeBytes = async (dir: string): Promise<number> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  let total = 0;
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(full);
    } else if (entry.isFile()) {
      total += await stat(full)
        .then((s) => s.size)
        .catch(() => 0);
    }
  }
  return total;
};

/**
 * Kill a run as soon as its output exceeds the configured size cap.
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
  maxSizeMb: number
): { stop: () => void; breached: () => boolean } => {
  const maxBytes = maxSizeMb * 1024 * 1024;
  let breached = false;
  let checking = false;

  const check = async (): Promise<void> => {
    try {
      const bytes = await directorySizeBytes(outputDir);
      if (bytes <= maxBytes || breached) return;
      breached = true;
      logger.warn({ runId, bytes, maxBytes }, "Scraper output exceeded size limit, killing container");
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
    if (checking || breached) return;
    checking = true;
    void check();
  }, OUTPUT_WATCHDOG_INTERVAL_MS);
  timer.unref();

  return { stop: () => clearInterval(timer), breached: () => breached };
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
 * itself via copyFile, so they stay owned by the runner and remove normally.
 */
const removeContainerWrittenDir = async (dir: string): Promise<void> => {
  try {
    await execFileAsync("podman", ["unshare", "rm", "-rf", dir], { timeout: 30_000 });
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
  //   - file present, oversize
  //     or headerless           -> failure. Real output, unusable shape.
  // Every failure branch keeps stdout/stderr so the cause stays visible.
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(outputFile);
  } catch {
    return exitCode === 0
      ? failedOutput(exitCode, stderr, `No output file produced at ${outputFileName}`)
      : { output: undefined, exitCode, stderr };
  }

  const sizeMb = stats.size / (1024 * 1024);
  if (sizeMb > maxSizeMb) {
    return failedOutput(exitCode, stderr, `Output size (${sizeMb.toFixed(1)}MB) exceeds limit (${maxSizeMb}MB)`);
  }

  let content: Buffer;
  try {
    content = await readFile(outputFile);
    await validateOutput(content, maxSizeMb);
  } catch (error) {
    if (error instanceof OutputValidationError) return failedOutput(exitCode, stderr, error.message);
    if (error instanceof RunnerError) throw error;
    return failedOutput(exitCode, stderr, `Could not read output file: ${String(error)}`);
  }

  // Count parsed CSV records, not raw lines: a quoted field may contain line
  // breaks, so line counting inflates the row total on any multi-line value.
  const rows = countCsvDataRows(content.toString("utf-8"));

  try {
    // Copy output file to persistent location for download
    const config = getConfig();
    const persistentDir = join(config.SCRAPER_DATA_DIR, "outputs", runId);
    await mkdir(persistentDir, { recursive: true });
    await copyFile(outputFile, join(persistentDir, outputFileName));
  } catch (error) {
    return failedOutput(exitCode, stderr, `Could not persist output file: ${String(error)}`);
  }

  const downloadUrl = `/output/${runId}/${outputFileName}`;
  return { output: { rows, bytes: stats.size, download_url: downloadUrl }, exitCode, stderr };
};

export const executeRun = async (request: RunRequest): Promise<RunResult> => {
  const config = getConfig();

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
    await mkdir(codeDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    // Prepare code (clone git repo or write inline code)
    await prepareCode(request, codeDir);

    // One source of truth for the filename: the container is told where to
    // write and `collectOutput` reads the same name back.
    const outputFileName = request.output_file ?? "data.csv";

    // Build podman args with full hardening
    const podmanArgs = buildPodmanArgs({
      runId,
      runtime: request.runtime,
      entrypoint: request.entrypoint,
      codeDir,
      outputDir,
      outputFile: outputFileName,
      env: request.env ?? {},
      limits: {
        timeoutSecs: request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT,
        memoryMb: request.limits?.memory_mb ?? config.SCRAPER_DEFAULT_MEMORY,
      },
    });

    logger.info({ runId, runtime: request.runtime, entrypoint: request.entrypoint }, "Starting scraper container");

    const timeoutSecs = request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT;

    // Bound the output write while it happens; the post-run size check in
    // collectOutput cannot, because by then the bytes are already on disk.
    const watchdog = startOutputWatchdog(runId, outputDir, config.SCRAPER_MAX_OUTPUT_SIZE_MB);
    let stdout: string;
    let stderr: string;
    let exitCode: number;
    try {
      ({ stdout, stderr, exitCode } = await runPodmanContainer(podmanArgs, timeoutSecs));
    } finally {
      watchdog.stop();
    }

    const durationMs = Date.now() - runStartedAt;

    // A watchdog kill is a failed run, full stop. Whatever the scraper managed
    // to write is a truncated fragment of a result it never finished, so it is
    // not offered for download — but the logs are kept so the cause is visible.
    if (watchdog.breached()) {
      totalFailed++;
      const reason = `Output exceeded the ${config.SCRAPER_MAX_OUTPUT_SIZE_MB}MB limit; container was killed mid-run`;
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
    const durationMs = Date.now() - runStartedAt;

    if (error instanceof TimeoutError) {
      totalTimeout++;
      // Escalate all the way to SIGKILL. A container that ignores SIGTERM must
      // still die here, or it outlives the timeout and keeps its memory, pids
      // and network slot until something else notices.
      await forceKillContainer(runId);

      return {
        status: "timeout",
        exit_code: -1,
        duration_ms: durationMs,
        stdout: "",
        stderr: `Scraper exceeded timeout of ${request.limits?.timeout_secs ?? getConfig().SCRAPER_DEFAULT_TIMEOUT}s`,
      };
    }

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

export const isRunActive = (runId: string): boolean => activeRuns.has(runId);

export const getActiveRunCount = (): number => activeRuns.size;

const truncateLog = (log: string, maxBytes: number = 1024 * 1024): string => {
  const byteLength = Buffer.byteLength(log, "utf-8");
  if (byteLength <= maxBytes) return log;
  // Slice conservatively (multi-byte chars may overshoot)
  const truncated = Buffer.from(log, "utf-8").subarray(0, maxBytes).toString("utf-8");
  return truncated + `\n... truncated (${byteLength} bytes total)`;
};
