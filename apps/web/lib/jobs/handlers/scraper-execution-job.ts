/**
 * Background job handler for executing scrapers via the TimeScrape runner API.
 *
 * This job loads a scraper definition, calls the external runner service,
 * records the result as a scraper-run, and optionally triggers the import
 * pipeline when autoImport is enabled.
 *
 * @module
 * @category Jobs
 */
import { v4 as uuidv4 } from "uuid";

import { COLLECTION_NAMES, JOB_TYPES } from "@/lib/constants/import-constants";
import { createLogger, logError } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ImportFile, Scraper, ScraperRepo, User } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";

const log = createLogger("scraper-execution-job");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScraperExecutionJobInput {
  scraperId: number;
  triggeredBy: "schedule" | "manual" | "webhook";
}

interface RunnerRequest {
  run_id: string;
  runtime: string;
  entrypoint: string;
  output_file: string;
  code_url?: string;
  code?: Record<string, string>;
  env: Record<string, string>;
  limits: { timeout_secs: number; memory_mb: number };
}

interface RunnerResponse {
  status: "success" | "failed" | "timeout";
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  output?: { rows: number; bytes: number; download_url: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the code_url string for a git-based repo.
 * Format: "https://github.com/user/repo.git#branch"
 */
const buildCodeUrl = (repo: ScraperRepo): string | undefined => {
  if (repo.sourceType !== "git" || !repo.gitUrl) return undefined;
  const branch = repo.gitBranch ?? "main";
  return `${repo.gitUrl}#${branch}`;
};

/**
 * Build inline code map from a repo with uploaded code.
 */
const buildInlineCode = (repo: ScraperRepo): Record<string, string> | undefined => {
  if (repo.sourceType !== "upload" || !repo.code) return undefined;
  if (typeof repo.code === "object" && !Array.isArray(repo.code)) {
    return repo.code as Record<string, string>;
  }
  return undefined;
};

/**
 * Parse envVars from the scraper into a flat string->string map.
 */
const parseEnvVars = (envVars: Scraper["envVars"]): Record<string, string> => {
  if (!envVars || typeof envVars !== "object" || Array.isArray(envVars)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(envVars)) {
    result[key] = String(value);
  }
  return result;
};

/**
 * Call the TimeScrape runner API.
 */
const callRunner = async (request: RunnerRequest): Promise<RunnerResponse> => {
  const runnerUrl = process.env.SCRAPER_RUNNER_URL;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!runnerUrl) {
    throw new Error("SCRAPER_RUNNER_URL environment variable is not configured");
  }

  const baseUrl = runnerUrl.endsWith("/") ? runnerUrl.slice(0, -1) : runnerUrl;
  const url = `${baseUrl}/run`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const timeoutMs = ((request.limits?.timeout_secs ?? 300) + 60) * 1000;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Runner API returned ${response.status}: ${body}`);
  }

  return (await response.json()) as RunnerResponse;
};

/**
 * Update scraper statistics after a run.
 */
const updateScraperStatistics = (
  existing: Record<string, unknown> | null | undefined,
  status: RunnerResponse["status"]
): Record<string, unknown> => {
  const stats =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : { totalRuns: 0, successRuns: 0, failedRuns: 0 };

  stats.totalRuns = ((stats.totalRuns as number) ?? 0) + 1;
  if (status === "success") {
    stats.successRuns = ((stats.successRuns as number) ?? 0) + 1;
  } else {
    stats.failedRuns = ((stats.failedRuns as number) ?? 0) + 1;
  }

  return stats;
};

// ---------------------------------------------------------------------------
// Auto-import: create an import-files record from the CSV output
// ---------------------------------------------------------------------------

/**
 * Create an import-files record from scraper CSV output, following
 * the same pattern as the url-fetch-job.
 */
const triggerAutoImport = async (
  context: JobHandlerContext,
  scraper: Scraper,
  repo: ScraperRepo,
  runId: number,
  downloadUrl: string,
  outputBytes: number
): Promise<number | string> => {
  const { payload } = context.req;
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const originalName = `${scraper.name}-${timestamp}.csv`;
  const filename = `scraper-import-${timestamp}-${uuidv4()}.csv`;

  // Download CSV from runner instead of decoding base64
  const runnerUrl = process.env.SCRAPER_RUNNER_URL;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!runnerUrl) {
    throw new Error("SCRAPER_RUNNER_URL environment variable is not configured");
  }

  const baseUrl = runnerUrl.endsWith("/") ? runnerUrl.slice(0, -1) : runnerUrl;
  const fullDownloadUrl = `${baseUrl}${downloadUrl}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const fileResponse = await fetch(fullDownloadUrl, { headers });
  if (!fileResponse.ok) {
    throw new Error(`Failed to download output: ${fileResponse.status}`);
  }

  const csvBuffer = Buffer.from(await fileResponse.arrayBuffer());

  const catalogId = extractRelationId(repo.catalog);
  const userId = extractRelationId(repo.createdBy);
  const targetDatasetId = extractRelationId(scraper.targetDataset);

  // Load the user for the create call
  let user: User | undefined;
  if (userId) {
    const found = await payload.findByID({ collection: "users", id: userId });
    if (found) user = found;
  }

  const importFileData: Record<string, unknown> = {
    originalName,
    status: "pending",
    ...(catalogId != null ? { catalog: catalogId } : {}),
    ...(userId != null ? { user: userId } : {}),
    ...(targetDatasetId != null ? { targetDataset: targetDatasetId } : {}),
    processingOptions: { autoApproveSchema: true, skipDuplicateChecking: false },
  };

  const importFile = await payload.create({
    collection: "import-files",
    data: importFileData as Omit<ImportFile, "id" | "createdAt" | "updatedAt">,
    file: { data: csvBuffer, mimetype: "text/csv", name: filename, size: outputBytes },
    ...(user ? { user } : {}),
    context: { skipImportFileHooks: true },
  });

  // Queue dataset detection
  const detectionJob = await payload.jobs.queue({
    task: JOB_TYPES.DATASET_DETECTION,
    input: { importFileId: importFile.id },
  });

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_FILES,
    id: importFile.id,
    data: { status: "parsing", jobId: String(detectionJob.id) },
    context: { skipImportFileHooks: true },
  });

  // Link import file to the scraper run
  await payload.update({ collection: "scraper-runs", id: runId, data: { resultFile: importFile.id } });

  log.info(
    { importFileId: importFile.id, scraperId: scraper.id, scraperRunId: runId, filename, size: outputBytes },
    "Auto-import triggered from scraper output"
  );

  return importFile.id;
};

// ---------------------------------------------------------------------------
// Extracted handler steps
// ---------------------------------------------------------------------------

/**
 * Load a scraper by ID with depth:1 and validate that the repo relation is populated.
 */
const loadScraperWithRepo = async (
  payload: JobHandlerContext["req"]["payload"],
  scraperId: number
): Promise<{ scraper: Scraper; repo: ScraperRepo }> => {
  const scraper = await payload.findByID({ collection: "scrapers", id: scraperId, depth: 1, overrideAccess: true });

  if (!scraper) {
    throw new Error(`Scraper not found: ${scraperId}`);
  }

  const repo = scraper.repo as ScraperRepo;
  if (!repo || typeof repo !== "object") {
    throw new Error(`Scraper repo not populated for scraper ${scraperId}`);
  }

  return { scraper, repo };
};

/**
 * Create a scraper-runs record with status "running" and mark the scraper as running.
 */
const createRunRecord = async (
  payload: JobHandlerContext["req"]["payload"],
  scraperId: number,
  repo: ScraperRepo,
  triggeredBy: ScraperExecutionJobInput["triggeredBy"]
): Promise<{ id: number }> => {
  const scraperOwner = extractRelationId(repo.createdBy) ?? null;
  const run = await payload.create({
    collection: "scraper-runs",
    overrideAccess: true,
    data: {
      scraper: scraperId,
      scraperOwner: scraperOwner as number,
      status: "running",
      triggeredBy,
      startedAt: new Date().toISOString(),
    },
  });

  await payload.update({
    collection: "scrapers",
    id: scraperId,
    overrideAccess: true,
    data: { lastRunStatus: "running" },
  });

  return run;
};

/**
 * Build the request object for the runner API (pure function).
 */
const buildRunnerRequest = (scraper: Scraper, repo: ScraperRepo, runUuid: string): RunnerRequest => {
  const request: RunnerRequest = {
    run_id: runUuid,
    runtime: scraper.runtime,
    entrypoint: scraper.entrypoint,
    output_file: scraper.outputFile ?? "data.csv",
    env: parseEnvVars(scraper.envVars),
    limits: { timeout_secs: scraper.timeoutSecs ?? 300, memory_mb: scraper.memoryMb ?? 512 },
  };

  const codeUrl = buildCodeUrl(repo);
  if (codeUrl) {
    request.code_url = codeUrl;
  }

  const inlineCode = buildInlineCode(repo);
  if (inlineCode) {
    request.code = inlineCode;
  }

  return request;
};

/** Helper to extract existing statistics as a Record or null. */
const extractExistingStats = (scraper: Scraper): Record<string, unknown> | null =>
  scraper.statistics && typeof scraper.statistics === "object" && !Array.isArray(scraper.statistics)
    ? (scraper.statistics as Record<string, unknown>)
    : null;

/**
 * Update the scraper-run with results, update scraper statistics, and return output info.
 */
const handleRunSuccess = async (
  context: JobHandlerContext,
  scraper: Scraper,
  repo: ScraperRepo,
  runId: number,
  result: RunnerResponse
): Promise<{ importFileId?: number | string }> => {
  const { payload } = context.req;
  const finishedAt = new Date().toISOString();

  await payload.update({
    collection: "scraper-runs",
    id: runId,
    overrideAccess: true,
    data: {
      status: result.status,
      finishedAt,
      durationMs: result.duration_ms,
      exitCode: result.exit_code,
      stdout: result.stdout ?? null,
      stderr: result.stderr ?? null,
      ...(result.output ? { outputRows: result.output.rows, outputBytes: result.output.bytes } : {}),
    },
  });

  const updatedStats = updateScraperStatistics(extractExistingStats(scraper), result.status);
  await payload.update({
    collection: "scrapers",
    id: scraper.id,
    overrideAccess: true,
    data: { lastRunAt: finishedAt, lastRunStatus: result.status, statistics: updatedStats },
  });

  log.info(
    {
      scraperId: scraper.id,
      runId,
      status: result.status,
      durationMs: result.duration_ms,
      outputRows: result.output?.rows,
    },
    "Scraper execution completed"
  );

  // Auto-import if enabled and run succeeded
  let importFileId: number | string | undefined;
  if (scraper.autoImport && result.status === "success" && result.output?.download_url) {
    try {
      importFileId = await triggerAutoImport(
        context,
        scraper,
        repo,
        runId,
        result.output.download_url,
        result.output.bytes
      );

      // Clean up output on runner (best-effort)
      try {
        const runnerUrl = process.env.SCRAPER_RUNNER_URL;
        const apiKey = process.env.SCRAPER_API_KEY;
        if (runnerUrl) {
          const baseUrl = runnerUrl.endsWith("/") ? runnerUrl.slice(0, -1) : runnerUrl;
          // Extract runId from download_url: /output/{runId}/{filename}
          const urlParts = result.output.download_url.split("/");
          const runUuid = urlParts[2];
          const cleanupHeaders: Record<string, string> = {};
          if (apiKey) {
            cleanupHeaders["Authorization"] = `Bearer ${apiKey}`;
          }
          await fetch(`${baseUrl}/output/${runUuid}`, { method: "DELETE", headers: cleanupHeaders });
        }
      } catch {
        /* best-effort cleanup */
      }
    } catch (importError) {
      logError(importError, "Auto-import failed after successful scrape", { scraperId: scraper.id, runId });
      // Don't fail the whole job if auto-import fails
    }
  }

  return { importFileId };
};

/**
 * Update the scraper-run and scraper with failed status on error.
 * Individual update failures are logged but do not propagate.
 */
const handleRunFailure = async (
  payload: JobHandlerContext["req"]["payload"],
  scraper: Scraper,
  runId: number,
  error: unknown
): Promise<void> => {
  const finishedAt = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  try {
    await payload.update({
      collection: "scraper-runs",
      id: runId,
      overrideAccess: true,
      data: { status: "failed", finishedAt, error: errorMessage },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scraper run on error", { runId });
  }

  try {
    const updatedStats = updateScraperStatistics(extractExistingStats(scraper), "failed");
    await payload.update({
      collection: "scrapers",
      id: scraper.id,
      overrideAccess: true,
      data: { lastRunAt: finishedAt, lastRunStatus: "failed", statistics: updatedStats },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scraper status on error", { scraperId: scraper.id });
  }
};

// ---------------------------------------------------------------------------
// Job handler
// ---------------------------------------------------------------------------

export const scraperExecutionJob = {
  slug: "scraper-execution",
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as ScraperExecutionJobInput;
    const { scraperId, triggeredBy } = input;
    const jobId = String(context.job?.id ?? "unknown");

    log.info({ jobId, scraperId, triggeredBy }, "Starting scraper execution job");

    // Feature flag check
    const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
    if (!(await isFeatureEnabled(payload, "enableScrapers"))) {
      log.info({ jobId }, "Scraper execution skipped - feature disabled");
      return { output: { success: false, skipped: true, reason: "Feature flag enableScrapers is disabled" } };
    }

    const { scraper, repo } = await loadScraperWithRepo(payload, scraperId);

    // Quota check: daily scraper runs
    const repoOwnerId = extractRelationId(repo.createdBy);
    if (repoOwnerId) {
      const { createQuotaService } = await import("@/lib/services/quota-service");
      const quotaService = createQuotaService(payload);
      const owner = await payload.findByID({ collection: "users", id: repoOwnerId, overrideAccess: true });
      if (owner) {
        await quotaService.checkAndIncrementUsage(owner, "SCRAPER_RUNS_PER_DAY", 1);
      }
    }

    let run: { id: number } | undefined;

    try {
      run = await createRunRecord(payload, scraperId, repo, triggeredBy);

      const runUuid = uuidv4();
      const request = buildRunnerRequest(scraper, repo, runUuid);

      log.info({ scraperId, runId: run.id, runUuid, runtime: scraper.runtime }, "Calling runner API");

      const result = await callRunner(request);
      const { importFileId } = await handleRunSuccess(context, scraper, repo, run.id, result);

      return {
        output: {
          success: true,
          runId: run.id,
          status: result.status,
          durationMs: result.duration_ms,
          outputRows: result.output?.rows,
          ...(importFileId != null ? { importFileId } : {}),
        },
      };
    } catch (error) {
      if (run) {
        await handleRunFailure(payload, scraper, run.id, error);
      }

      // Rollback quota on failure (best-effort)
      if (repoOwnerId) {
        try {
          const { createQuotaService } = await import("@/lib/services/quota-service");
          const quotaService = createQuotaService(payload);
          await quotaService.decrementUsage(repoOwnerId, "SCRAPER_RUNS_PER_DAY", 1);
        } catch {
          /* quota rollback is best-effort */
        }
      }

      logError(error, "Scraper execution failed", { jobId, scraperId, runId: run?.id });
      throw error;
    }
  },
};
