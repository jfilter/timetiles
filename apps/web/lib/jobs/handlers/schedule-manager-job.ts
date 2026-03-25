/**
 * Background job handler for managing scheduled ingests.
 *
 * Runs periodically to check for scheduled ingests that are due for execution.
 * Creates new import-files records for scheduled URLs and triggers URL fetch jobs.
 * Implements a cron-like scheduler using Payload's job system with support for
 * various frequency patterns and retry logic.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledIngest } from "@/payload-types";

import { calculateNextRun, shouldRunNow } from "./schedule-manager/schedule-evaluation";
import { processScheduledScrapers } from "./schedule-manager/scraper-scheduling";

// Helper to process a single scheduled ingest
const processScheduledIngest = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date
): Promise<boolean> => {
  if (!shouldRunNow(scheduledIngest, currentTime)) {
    return false;
  }

  // Quick in-memory check before attempting the atomic claim.
  // Not a guarantee (stale data), but avoids unnecessary SQL round-trips.
  if (scheduledIngest.lastStatus === "running") {
    logger.info("Skipping scheduled ingest - already running", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
    });
    return false;
  }

  const nextRun = calculateNextRun(scheduledIngest, currentTime);

  try {
    await triggerScheduledIngest(payload, scheduledIngest, currentTime, {
      triggeredBy: "schedule",
      nextRun: nextRun.toISOString(),
    });
  } catch (error) {
    // Concurrency rejection from the atomic SQL claim means another worker
    // already claimed this import. This is expected, not an error.
    if (error instanceof Error && error.message.includes("concurrent trigger rejected")) {
      logger.info("Skipping scheduled ingest - claimed by another worker", {
        scheduledIngestId: scheduledIngest.id,
        name: scheduledIngest.name,
      });
      return false;
    }
    throw error; // Re-throw real errors for handleImportError
  }

  return true;
};

// Helper to handle import error
const handleImportError = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  error: unknown,
  currentTime: Date
): Promise<void> => {
  logError(error, "Failed to trigger scheduled ingest", {
    scheduledIngestId: scheduledIngest.id,
    name: scheduledIngest.name,
    url: sanitizeUrlForLogging(scheduledIngest.sourceUrl),
  });

  try {
    // Advance nextRun so the scheduler doesn't retry every minute for a
    // broken import. Without this, a queue failure would leave the old
    // nextRun in the past and re-trigger on every scheduler tick.
    const nextRun = calculateNextRun(scheduledIngest, currentTime);

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastStatus: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
        nextRun: nextRun.toISOString(),
      },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scheduled ingest error status");
  }
};

export const scheduleManagerJob = {
  slug: "schedule-manager",
  schedule: [{ cron: "* * * * *", queue: "default" as const }],
  // Only one schedule-manager may run at a time across all workers.
  // Without this, two workers could both trigger the same scheduled ingest.
  concurrency: () => "schedule-manager",
  handler: async ({ job, req }: JobHandlerContext) => {
    const { payload } = req;

    try {
      // Check feature flag - skip execution if disabled
      const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
      if (!(await isFeatureEnabled(payload, "enableScheduledJobExecution"))) {
        logger.info("Schedule manager job skipped - feature disabled", { jobId: job?.id });
        return {
          output: { success: true, skipped: true, reason: "Feature flag enableScheduledJobExecution is disabled" },
        };
      }

      logger.info("Starting schedule manager job", { jobId: job?.id });

      const currentTime = new Date();

      // Find all enabled scheduled ingests
      const scheduledIngests = await payload.find({
        collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
        where: { enabled: { equals: true } },
        limit: 1000,
        pagination: false,
      });

      logger.info("Found scheduled ingests", {
        count: scheduledIngests.docs.length,
        totalDocs: scheduledIngests.totalDocs,
      });

      let triggeredCount = 0;
      let errorCount = 0;

      for (const scheduledIngest of scheduledIngests.docs) {
        try {
          const triggered = await processScheduledIngest(payload, scheduledIngest, currentTime);
          if (triggered) {
            triggeredCount++;
          }
        } catch (error) {
          errorCount++;
          await handleImportError(payload, scheduledIngest, error, currentTime);
        }
      }

      // Process scheduled scrapers
      const scraperResults = await processScheduledScrapers(payload, currentTime);

      logger.info("Schedule manager job completed", {
        jobId: job?.id,
        totalScheduled: scheduledIngests.docs.length,
        triggered: triggeredCount,
        errors: errorCount,
        scrapersTriggered: scraperResults.triggered,
        scraperErrors: scraperResults.errors,
      });

      return {
        output: {
          success: true,
          totalScheduled: scheduledIngests.docs.length,
          triggered: triggeredCount,
          errors: errorCount,
          scrapersTriggered: scraperResults.triggered,
          scraperErrors: scraperResults.errors,
        },
      };
    } catch (error) {
      logError(error, "Schedule manager job failed", { jobId: job?.id });
      throw error;
    }
  },
};
