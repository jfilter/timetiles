/**
 * Auto-import and statistics helpers for scraper execution.
 *
 * Handles downloading scraper output, creating import file records,
 * triggering the import pipeline, and updating scraper statistics.
 *
 * @module
 * @category Jobs
 */
import { v4 as uuidv4 } from "uuid";

import { getEnv } from "@/lib/config/env";
import { createIngestFile } from "@/lib/ingest/create-ingest-file";
import { createLogger, logError } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import { recordScraperRun, resolveScraperStats } from "@/lib/types/run-statistics";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Scraper, ScraperRepo, User } from "@/payload-types";

import type { JobHandlerContext } from "../../utils/job-context";
import type { RunnerResponse } from "./runner-api";

const log = createLogger("scraper-execution-job");

/**
 * Create an import-files record from scraper CSV output, following
 * the same pattern as the url-fetch-job.
 */
export const triggerAutoImport = async (
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
  const env = getEnv();

  if (!env.SCRAPER_RUNNER_URL) {
    throw new Error("SCRAPER_RUNNER_URL environment variable is not configured");
  }

  const baseUrl = env.SCRAPER_RUNNER_URL.endsWith("/") ? env.SCRAPER_RUNNER_URL.slice(0, -1) : env.SCRAPER_RUNNER_URL;
  const fullDownloadUrl = `${baseUrl}${downloadUrl}`;

  const headers: Record<string, string> = {};
  if (env.SCRAPER_API_KEY) {
    headers["Authorization"] = `Bearer ${env.SCRAPER_API_KEY}`;
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

  // The `scrapers` collection does not currently expose a `schemaMode` field
  // (only `scheduled-ingests` does — see `apps/web/payload-types.ts:1600`).
  // Scraper-driven imports therefore omit `schemaMode` from `processingOptions`,
  // which lets `validate-schema-job` fall through to the dataset-level
  // `schemaConfig` (the permissive fallback documented on `translateSchemaMode`
  // in `apps/web/lib/ingest/configure-service.ts`). If the scraper schema ever
  // gains a `schemaMode` field, propagate it here in the same shape as the
  // `url-fetch-job` writes for scheduled re-runs.
  const importFileData: Record<string, unknown> = {
    originalName,
    status: "pending",
    ...(catalogId != null ? { catalog: catalogId } : {}),
    ...(userId != null ? { user: userId } : {}),
    ...(targetDatasetId != null ? { targetDataset: targetDatasetId } : {}),
    processingOptions: {
      autoApproveSchema: true,
      skipDuplicateChecking: false,
      reviewChecks: scraper.reviewChecks ?? undefined,
    },
  };

  // Create import file, queue detection, and mark as parsing
  const { ingestFileId } = await createIngestFile({
    payload,
    importFileData,
    file: { data: csvBuffer, mimetype: "text/csv", name: filename, size: outputBytes },
    user,
  });

  // Link import file to the scraper run (import-files IDs are always numeric)
  await payload.update({ collection: "scraper-runs", id: runId, data: { resultFile: ingestFileId as number } });

  log.info(
    { ingestFileId, scraperId: scraper.id, scraperRunId: runId, filename, size: outputBytes },
    "Auto-import triggered from scraper output"
  );

  return ingestFileId;
};

/**
 * Update the scraper-run with results, update scraper statistics, and return output info.
 */
export const handleRunSuccess = async (
  context: JobHandlerContext,
  scraper: Scraper,
  repo: ScraperRepo,
  runId: number,
  result: RunnerResponse
): Promise<{ ingestFileId?: number | string }> => {
  const { payload } = context.req;
  const finishedAt = new Date().toISOString();

  await asSystem(payload).update({
    collection: "scraper-runs",
    id: runId,
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

  const updatedStats = recordScraperRun(resolveScraperStats(scraper.statistics), result.status);
  await asSystem(payload).update({
    collection: "scrapers",
    id: scraper.id,
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
  let ingestFileId: number | string | undefined;
  if (scraper.autoImport && result.status === "success" && result.output?.download_url) {
    try {
      ingestFileId = await triggerAutoImport(
        context,
        scraper,
        repo,
        runId,
        result.output.download_url,
        result.output.bytes
      );

      // Clean up output on runner (best-effort)
      try {
        const cleanupEnv = getEnv();
        if (cleanupEnv.SCRAPER_RUNNER_URL) {
          const cleanupBaseUrl = cleanupEnv.SCRAPER_RUNNER_URL.endsWith("/")
            ? cleanupEnv.SCRAPER_RUNNER_URL.slice(0, -1)
            : cleanupEnv.SCRAPER_RUNNER_URL;
          // Extract runId from download_url: /output/{runId}/{filename}
          const urlParts = result.output.download_url.split("/");
          const runUuid = urlParts[2];
          const cleanupHeaders: Record<string, string> = {};
          if (cleanupEnv.SCRAPER_API_KEY) {
            cleanupHeaders["Authorization"] = `Bearer ${cleanupEnv.SCRAPER_API_KEY}`;
          }
          await fetch(`${cleanupBaseUrl}/output/${runUuid}`, { method: "DELETE", headers: cleanupHeaders });
        }
      } catch {
        /* best-effort cleanup */
      }
    } catch (importError) {
      logError(importError, "Auto-import failed after successful scrape", { scraperId: scraper.id, runId });
      // Don't fail the whole job if auto-import fails
    }
  }

  return { ingestFileId };
};

/**
 * Update the scraper-run and scraper with failed status on error.
 * Individual update failures are logged but do not propagate.
 */
export const handleRunFailure = async (
  payload: JobHandlerContext["req"]["payload"],
  scraper: Scraper,
  runId: number,
  error: unknown
): Promise<void> => {
  const finishedAt = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  try {
    await asSystem(payload).update({
      collection: "scraper-runs",
      id: runId,
      data: { status: "failed", finishedAt, error: errorMessage },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scraper run on error", { runId });
  }

  try {
    const updatedStats = recordScraperRun(resolveScraperStats(scraper.statistics), "failed");
    await asSystem(payload).update({
      collection: "scrapers",
      id: scraper.id,
      data: { lastRunAt: finishedAt, lastRunStatus: "failed", statistics: updatedStats },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scraper status on error", { scraperId: scraper.id });
  }
};
