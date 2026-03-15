/**
 * Podman container lifecycle management for scraper execution.
 *
 * @module
 * @category Services
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { getConfig } from "../config.js";
import { ConcurrencyError, TimeoutError } from "../lib/errors.js";
import { logger, logError } from "../lib/logger.js";
import { buildPodmanArgs } from "../security/container-config.js";
import type { RunRequest, RunResult } from "../types.js";
import { prepareCode } from "./code-prep.js";
import { validateOutput } from "./output-validator.js";

const execFileAsync = promisify(execFile);

const activeRuns = new Set<string>();

export async function executeRun(request: RunRequest): Promise<RunResult> {
  const config = getConfig();

  if (activeRuns.size >= config.SCRAPER_MAX_CONCURRENT) {
    throw new ConcurrencyError(config.SCRAPER_MAX_CONCURRENT);
  }

  const runId = request.run_id;
  const startedAt = Date.now();

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

    // Execute podman with timeout
    const timeoutMs = (request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT) * 1000 + 5000; // 5s grace
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const result = await execFileAsync("podman", podmanArgs, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB log buffer
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "killed" in error && error.killed) {
        throw new TimeoutError(request.limits?.timeout_secs ?? config.SCRAPER_DEFAULT_TIMEOUT);
      }
      // Process exited with non-zero code
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      stdout = execError.stdout ?? "";
      stderr = execError.stderr ?? "";
      exitCode = execError.code ?? 1;
    }

    const durationMs = Date.now() - startedAt;

    // Check for output file
    const outputFile = join(outputDir, request.output_file ?? "data.csv");
    let output: RunResult["output"] | undefined;

    try {
      const stats = await stat(outputFile);
      const content = await readFile(outputFile);

      // Validate output
      await validateOutput(content, config.SCRAPER_MAX_OUTPUT_SIZE_MB);

      // Count rows (lines minus header)
      const lines = content
        .toString("utf-8")
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const rows = Math.max(0, lines.length - 1);

      output = { rows, bytes: stats.size, content_base64: content.toString("base64") };
    } catch {
      // No output file or invalid — not an error if exit code is non-zero
      if (exitCode === 0) {
        exitCode = 1;
        stderr += "\nNo valid output file produced";
      }
    }

    const status = exitCode === 0 ? "success" : "failed";
    logger.info({ runId, status, exitCode, durationMs, rows: output?.rows }, "Scraper run completed");

    return {
      status,
      exit_code: exitCode,
      duration_ms: durationMs,
      stdout: truncateLog(stdout),
      stderr: truncateLog(stderr),
      output,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof TimeoutError) {
      // Try to stop the container
      try {
        await execFileAsync("podman", ["stop", `run-${runId}`], { timeout: 10_000 });
      } catch {
        // Container may have already stopped
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
}

export function stopRun(runId: string): Promise<void> {
  return execFileAsync("podman", ["stop", `run-${runId}`], { timeout: 15_000 }).then(
    () => {
      logger.info({ runId }, "Container stopped");
    },
    (error) => {
      logError("Failed to stop container", error, { runId });
    }
  );
}

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

export function getActiveRunCount(): number {
  return activeRuns.size;
}

function truncateLog(log: string, maxBytes: number = 1024 * 1024): string {
  if (log.length <= maxBytes) return log;
  return log.slice(0, maxBytes) + `\n... truncated (${log.length} bytes total)`;
}
