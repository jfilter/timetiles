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
import { sendScheduledIngestConfigInvalidEmail } from "@/lib/ingest/scheduled-ingest-emails";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { asSystem } from "@/lib/services/system-payload";
import { extractRelationId } from "@/lib/utils/relation-id";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledIngest } from "@/payload-types";

import { calculateNextRun, shouldRunNow } from "./schedule-manager/schedule-evaluation";
import { processScheduledScrapers } from "./schedule-manager/scraper-scheduling";

/**
 * Disable a scheduled ingest after detecting an invalid schedule configuration.
 *
 * Previously `calculateNextRun` swallowed parse errors and silently rescheduled
 * for 24 hours from now, making broken cron expressions look like "runs once
 * per day." Now the scheduler disables the ingest, stamps a readable
 * `lastError`, and emits an audit entry so operators notice and re-enable
 * after fixing the config.
 */
const disableScheduledIngestForInvalidConfig = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  errorMessage: string
): Promise<void> => {
  try {
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: { enabled: false, lastStatus: "failed", lastError: `Invalid schedule configuration: ${errorMessage}` },
    });
  } catch (updateError) {
    logError(updateError, "Failed to disable scheduled ingest after invalid config");
  }

  const ownerId = extractRelationId<number>(scheduledIngest.createdBy);
  if (!ownerId) return;

  try {
    const owner = await asSystem(payload).findByID({ collection: "users", id: ownerId, depth: 0 });
    await auditLog(payload, {
      action: AUDIT_ACTIONS.SCHEDULED_INGEST_CONFIG_INVALID,
      userId: ownerId,
      userEmail: owner.email,
      details: {
        scheduledIngestId: scheduledIngest.id,
        scheduledIngestName: scheduledIngest.name,
        scheduleType: scheduledIngest.scheduleType,
        frequency: scheduledIngest.frequency,
        cronExpression: scheduledIngest.cronExpression,
        error: errorMessage,
      },
    });

    // Notify the owner so a silently-disabled schedule doesn't stay unnoticed
    // until someone checks the admin UI. `queueEmail` swallows queue errors
    // internally, so a broken mail transport can't mask the disable.
    await sendScheduledIngestConfigInvalidEmail(payload, owner, scheduledIngest, errorMessage);
  } catch {
    // Audit + notification are best-effort — never mask the disable operation.
  }
};

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

  let nextRun: Date;
  try {
    nextRun = calculateNextRun(scheduledIngest, currentTime);
  } catch (scheduleError) {
    const message = scheduleError instanceof Error ? scheduleError.message : "Unknown schedule error";
    logError(scheduleError, "Invalid schedule configuration — disabling scheduled ingest", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
    });
    await disableScheduledIngestForInvalidConfig(payload, scheduledIngest, message);
    return false;
  }

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

  // Advance nextRun so the scheduler doesn't retry every minute for a
  // broken import. Without this, a queue failure would leave the old
  // nextRun in the past and re-trigger on every scheduler tick.
  let nextRun: Date | null = null;
  try {
    nextRun = calculateNextRun(scheduledIngest, currentTime);
  } catch (scheduleError) {
    // Both the trigger and the schedule parse failed — disable the ingest
    // so we stop re-trying a broken config and surface it in the audit log.
    const scheduleMessage = scheduleError instanceof Error ? scheduleError.message : "Unknown schedule error";
    const outerMessage = error instanceof Error ? error.message : "Unknown error";
    logError(scheduleError, "Invalid schedule configuration in error path — disabling scheduled ingest", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
      outerError: outerMessage,
    });
    await disableScheduledIngestForInvalidConfig(
      payload,
      scheduledIngest,
      `${outerMessage}; schedule also invalid: ${scheduleMessage}`
    );
    return;
  }

  try {
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
      const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
      if (!(await getFeatureFlagService(payload).isEnabled("enableScheduledJobExecution"))) {
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
