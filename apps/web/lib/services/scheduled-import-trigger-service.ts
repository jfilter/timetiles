/**
 * Service functions for webhook-triggered scheduled imports.
 *
 * Extracts business logic from the webhook trigger route into a
 * testable service layer. Handles import name generation, statistics
 * updates, and job queueing with status management.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScheduledImport } from "@/payload-types";

/**
 * Generate an import name from the scheduled import's template.
 * Replaces {{name}}, {{date}}, {{time}}, and {{url}} placeholders.
 */
export const generateImportName = (scheduledImport: ScheduledImport, currentTime: Date): string => {
  const importName = scheduledImport.importNameTemplate ?? "{{name}} - {{date}}";
  return importName
    .replace("{{name}}", scheduledImport.name)
    .replace("{{date}}", currentTime.toISOString().split("T")[0] ?? "")
    .replace("{{time}}", currentTime.toTimeString().split(" ")[0] ?? "")
    .replace("{{url}}", new URL(scheduledImport.sourceUrl).hostname);
};

/**
 * Update statistics when a webhook triggers an import.
 * Execution history is NOT recorded here because the import has only been queued,
 * not completed. The actual success/failure entry is added by the job handler
 * when processing finishes.
 */
export const updateStatisticsOnTrigger = async (payload: Payload, scheduledImport: ScheduledImport): Promise<void> => {
  const stats = scheduledImport.statistics ?? { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 };
  stats.totalRuns = (stats.totalRuns ?? 0) + 1;

  await payload.update({ collection: "scheduled-imports", id: scheduledImport.id, data: { statistics: stats } });
};

/**
 * Queue an import job for a webhook-triggered scheduled import.
 *
 * Sets status to "running" before queueing, reverts on failure.
 * Returns the job ID on success, throws on failure.
 */
export const queueWebhookImport = async (
  payload: Payload,
  scheduledImport: ScheduledImport
): Promise<{ jobId: number }> => {
  const currentTime = new Date();
  const importName = generateImportName(scheduledImport, currentTime);

  // CRITICAL: Set status to "running" BEFORE queuing job
  const previousStatus = scheduledImport.lastStatus ?? null;
  await payload.update({
    collection: "scheduled-imports",
    id: scheduledImport.id,
    data: { lastStatus: "running", lastRun: currentTime.toISOString() },
  });

  // Queue URL fetch job - wrapped in try/catch to revert status on failure
  let urlFetchJob;
  try {
    urlFetchJob = await payload.jobs.queue({
      task: JOB_TYPES.URL_FETCH,
      input: {
        scheduledImportId: scheduledImport.id,
        sourceUrl: scheduledImport.sourceUrl,
        authConfig: scheduledImport.authConfig,
        catalogId: extractRelationId(scheduledImport.catalog),
        originalName: importName,
        userId: extractRelationId(scheduledImport.createdBy),
        triggeredBy: "webhook",
      },
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

  // Update statistics (execution history is recorded by the job handler on completion)
  await updateStatisticsOnTrigger(payload, scheduledImport);

  logger.info(
    {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
      jobId: urlFetchJob.id,
      triggeredBy: "webhook",
    },
    "Webhook triggered import successfully"
  );

  return { jobId: urlFetchJob.id };
};
