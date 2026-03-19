/**
 * Shared trigger logic for scheduled imports.
 *
 * Consolidates the common steps for triggering a scheduled import run
 * (name generation, status updates, job queueing, statistics) into a
 * single helper used by both the webhook route and the schedule manager job.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScheduledImport } from "@/payload-types";

/**
 * Generate an import name from the scheduled import's template.
 * Replaces {{name}}, {{date}}, {{time}}, and {{url}} placeholders.
 *
 * All time values use UTC to ensure consistent filenames regardless of
 * which code path (webhook or schedule manager) triggers the import.
 */
export const generateImportName = (scheduledImport: ScheduledImport, currentTime: Date): string => {
  const importName = scheduledImport.importNameTemplate ?? "{{name}} - {{date}}";
  const timeString = `${currentTime.getUTCHours().toString().padStart(2, "0")}:${currentTime.getUTCMinutes().toString().padStart(2, "0")}:${currentTime.getUTCSeconds().toString().padStart(2, "0")}`;

  return importName
    .replace("{{name}}", scheduledImport.name)
    .replace("{{date}}", currentTime.toISOString().split("T")[0] ?? "")
    .replace("{{time}}", timeString)
    .replace("{{url}}", new URL(scheduledImport.sourceUrl).hostname);
};

interface TriggerOptions {
  /** Which code path triggered this import. */
  triggeredBy: "webhook" | "schedule";
  /** If provided, nextRun will be set in the post-queue update. */
  nextRun?: string;
  /** When true, skip the atomic status claim (caller already claimed "running"). */
  alreadyClaimed?: boolean;
}

/**
 * Shared logic for triggering a scheduled import run.
 *
 * Sets status to "running", queues a URL fetch job, bumps `totalRuns`,
 * and resets `currentRetries` to 0. The caller controls whether `nextRun`
 * is updated via {@link TriggerOptions.nextRun}.
 *
 * Execution history is NOT recorded here because the import has only been
 * queued, not completed. The actual success/failure entry is added by the
 * url-fetch job handler when processing finishes.
 *
 * @returns The queued job ID.
 * @throws If the job cannot be queued. The caller is responsible for
 *   error recovery (e.g. reverting status or recording failure).
 */
export const triggerScheduledImport = async (
  payload: Payload,
  scheduledImport: ScheduledImport,
  currentTime: Date,
  options: TriggerOptions
): Promise<{ jobId: number }> => {
  const importName = generateImportName(scheduledImport, currentTime);

  // Atomically claim "running" status to prevent overlapping triggers.
  // The conditional WHERE prevents a race where two schedule-manager
  // instances both see lastStatus != "running" and double-queue.
  // For webhooks, the route already claimed "running" via raw SQL,
  // so we skip the claim and only update metadata.
  if (options.alreadyClaimed) {
    // Caller already claimed "running" via raw SQL. Re-assert it here so
    // the Payload ORM write doesn't overwrite the SQL-set value.
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      id: scheduledImport.id,
      data: {
        lastStatus: "running",
        lastRun: currentTime.toISOString(),
        currentRetries: 0,
        ...(options.nextRun != null ? { nextRun: options.nextRun } : {}),
      },
    });
  } else {
    const claimResult = await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      where: { id: { equals: scheduledImport.id }, lastStatus: { not_equals: "running" } },
      data: {
        lastStatus: "running",
        lastRun: currentTime.toISOString(),
        currentRetries: 0,
        ...(options.nextRun != null ? { nextRun: options.nextRun } : {}),
      },
    });

    if (claimResult.docs.length === 0) {
      throw new Error("Scheduled import is already running (concurrent trigger rejected)");
    }
  }

  // Queue URL fetch job
  const urlFetchJob = await payload.jobs.queue({
    task: JOB_TYPES.URL_FETCH,
    input: {
      scheduledImportId: scheduledImport.id,
      sourceUrl: scheduledImport.sourceUrl,
      authConfig: scheduledImport.authConfig,
      catalogId: extractRelationId(scheduledImport.catalog),
      originalName: importName,
      userId: extractRelationId(scheduledImport.createdBy),
      triggeredBy: options.triggeredBy,
    },
  });

  logger.info(
    {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
      jobId: urlFetchJob.id,
      triggeredBy: options.triggeredBy,
      ...(options.nextRun != null ? { nextRun: options.nextRun } : {}),
    },
    `Triggered scheduled import via ${options.triggeredBy}`
  );

  // NOTE: totalRuns is NOT incremented here. It is updated by the job
  // handler on completion (updateScheduledImportSuccess / updateScheduledImportFailure)
  // to avoid double-counting.

  return { jobId: urlFetchJob.id };
};

/**
 * Queue an import job for a webhook-triggered scheduled import.
 *
 * Sets status to "running" before queueing, reverts on failure.
 * Does NOT update `nextRun` because webhooks are event-driven and
 * should not interfere with the scheduled cadence.
 *
 * @returns The queued job ID on success.
 * @throws If the job cannot be queued (status is reverted first).
 */
export const queueWebhookImport = async (
  payload: Payload,
  scheduledImport: ScheduledImport
): Promise<{ jobId: number }> => {
  const currentTime = new Date();
  const previousStatus = scheduledImport.lastStatus ?? null;

  try {
    return await triggerScheduledImport(payload, scheduledImport, currentTime, {
      triggeredBy: "webhook",
      alreadyClaimed: true,
    });
  } catch (queueError) {
    // Revert lastStatus so the import doesn't get stuck as "running"
    logError(queueError, "Failed to queue webhook job, reverting status", {
      scheduledImportId: scheduledImport.id,
      previousStatus,
    });
    await payload.update({
      collection: "scheduled-imports",
      id: scheduledImport.id,
      data: { lastStatus: previousStatus },
    });
    throw new Error("Failed to queue import job");
  }
};
