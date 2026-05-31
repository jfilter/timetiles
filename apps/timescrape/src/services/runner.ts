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
import { ConcurrencyError, OutputValidationError, RunnerError, TimeoutError } from "../lib/errors.js";
import { logError, logger } from "../lib/logger.js";
import { buildPodmanArgs } from "../security/container-config.js";
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
      logError("Failed to sweep scraper output directory", error, { dir });
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
      logError("Failed to sweep scraper output directory", error, { dir });
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
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: execError.stdout ?? "", stderr: execError.stderr ?? "", exitCode: execError.code ?? 1 };
  }
};

const collectOutput = async (
  outputDir: string,
  outputFileName: string,
  maxSizeMb: number,
  exitCode: number,
  stderr: string,
  runId: string
): Promise<{ output: RunResult["output"] | undefined; exitCode: number; stderr: string }> => {
  const outputFile = join(outputDir, outputFileName);
  if (!resolve(outputFile).startsWith(resolve(outputDir) + "/")) {
    throw new RunnerError("output_file escapes output directory", "INVALID_REQUEST", 400);
  }

  try {
    const stats = await stat(outputFile);
    const sizeMb = stats.size / (1024 * 1024);
    if (sizeMb > maxSizeMb) {
      throw new OutputValidationError(`Output size (${sizeMb.toFixed(1)}MB) exceeds limit (${maxSizeMb}MB)`);
    }

    // Read content for validation and row counting, then discard
    const content = await readFile(outputFile);
    await validateOutput(content, maxSizeMb);

    const lines = content
      .toString("utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    const rows = Math.max(0, lines.length - 1);

    // Copy output file to persistent location for download
    const config = getConfig();
    const persistentDir = join(config.SCRAPER_DATA_DIR, "outputs", runId);
    await mkdir(persistentDir, { recursive: true });
    await copyFile(outputFile, join(persistentDir, outputFileName));

    const downloadUrl = `/output/${runId}/${outputFileName}`;

    return { output: { rows, bytes: stats.size, download_url: downloadUrl }, exitCode, stderr };
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    if (exitCode === 0) {
      return { output: undefined, exitCode: 1, stderr: stderr + "\nNo valid output file produced" };
    }
    return { output: undefined, exitCode, stderr };
  }
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

    // Build podman args with full hardening
    const podmanArgs = buildPodmanArgs({
      runId,
      runtime: request.runtime,
      entrypoint: request.entrypoint,
      codeDir,
      outputDir,
      env: request.env ?? {},
      limits: {
        timeoutSecs: request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT,
        memoryMb: request.limits?.memory_mb ?? config.SCRAPER_DEFAULT_MEMORY,
      },
    });

    logger.info({ runId, runtime: request.runtime, entrypoint: request.entrypoint }, "Starting scraper container");

    const timeoutSecs = request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT;
    const { stdout, stderr, exitCode } = await runPodmanContainer(podmanArgs, timeoutSecs);

    const durationMs = Date.now() - runStartedAt;

    const {
      output,
      exitCode: finalExitCode,
      stderr: finalStderr,
    } = await collectOutput(
      outputDir,
      request.output_file ?? "data.csv",
      config.SCRAPER_MAX_OUTPUT_SIZE_MB,
      exitCode,
      stderr,
      runId
    );

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
      // Try to stop the container, force-remove as fallback
      try {
        await execFileAsync("podman", ["stop", `run-${runId}`], { timeout: 10_000 });
      } catch {
        try {
          await execFileAsync("podman", ["rm", "-f", `run-${runId}`], { timeout: 5_000 });
        } catch {
          // Container may have already been removed
        }
      }

      return {
        status: "timeout",
        exit_code: -1,
        duration_ms: durationMs,
        stdout: "",
        stderr: `Scraper exceeded timeout of ${request.limits?.timeout_secs ?? getConfig().SCRAPER_DEFAULT_TIMEOUT}s`,
      };
    }

    logError("Scraper run failed", error, { runId });
    throw error;
  } finally {
    activeRuns.delete(runId);

    // Cleanup work directory
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch (error) {
      logError("Failed to cleanup work directory", error, { runId, workDir });
    }
  }
};

export const stopRun = async (runId: string): Promise<void> => {
  try {
    await execFileAsync("podman", ["stop", `run-${runId}`], { timeout: 15_000 });
    logger.info({ runId }, "Container stopped");
  } catch (error) {
    logError("Failed to stop container", error, { runId });
  }
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
