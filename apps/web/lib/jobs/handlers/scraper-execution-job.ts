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

import { createLogger, logError } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Scraper, ScraperRepo } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";
import { handleRunFailure, handleRunSuccess } from "./scraper-execution/auto-import";
import type { ScraperExecutionJobInput } from "./scraper-execution/runner-api";
import { buildRunnerRequest, callRunner } from "./scraper-execution/runner-api";

const log = createLogger("scraper-execution-job");

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
    const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
    if (!(await getFeatureFlagService(payload).isEnabled("enableScrapers"))) {
      log.info({ jobId }, "Scraper execution skipped - feature disabled");
      throw new Error("Feature flag enableScrapers is disabled");
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
      const { ingestFileId } = await handleRunSuccess(context, scraper, repo, run.id, result);

      return {
        output: {
          runId: run.id,
          status: result.status,
          durationMs: result.duration_ms,
          outputRows: result.output?.rows,
          ...(ingestFileId != null ? { ingestFileId } : {}),
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
        } catch (error) {
          logError(error, "Failed to rollback quota after scraper failure", { repoOwnerId });
        }
      }

      logError(error, "Scraper execution failed", { jobId, scraperId, runId: run?.id });
      throw error;
    }
  },
};
