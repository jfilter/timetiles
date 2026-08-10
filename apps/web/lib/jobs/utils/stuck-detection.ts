/**
 * Shared utility for detecting stuck resources in cleanup jobs.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { buildResourceIdMatch } from "@/lib/services/payload-job-queries";
import { asSystem } from "@/lib/services/system-payload";
import { parseDateInput } from "@/lib/utils/date";

// Payload-jobs read helper lives in the infrastructure layer; re-exported here
// for the existing cleanup-job callers.
export { hasActivePayloadJob } from "@/lib/services/payload-job-queries";

/**
 * Check if a resource is stuck in a "running" state beyond a time threshold.
 *
 * **Important:** `lastRunAt` reflects when the resource was *queued* (trigger time),
 * not when processing actually started. There can be a significant delay between
 * queueing and execution (e.g., queue backlog, worker restart). Callers should use
 * a generous threshold to avoid falsely resetting jobs that are still actively running.
 * The default threshold in cleanup jobs is 4 hours to account for this gap.
 *
 * @param status - Current status of the resource (e.g., "running", "completed")
 * @param runningStatus - The status value that indicates "running" (e.g., "running")
 * @param lastRunAt - When the resource was queued/triggered (ISO string or Date)
 * @param currentTime - Current time for comparison
 * @param thresholdHours - How many hours before considering it stuck
 */
export const isResourceStuck = (
  status: string | null | undefined,
  runningStatus: string,
  lastRunAt: string | Date | null | undefined,
  currentTime: Date,
  thresholdHours: number
): boolean => {
  if (status !== runningStatus) {
    return false;
  }

  if (!lastRunAt) {
    return true;
  }

  const lastRunTime = parseDateInput(lastRunAt);
  if (!lastRunTime) {
    return true;
  }

  const hoursSinceLastRun = (currentTime.getTime() - lastRunTime.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastRun >= thresholdHours;
};

/**
 * Cancel the workflow jobs an abandoned run left behind, so their concurrency keys are released.
 *
 * Errors deliberately propagate: swallowing them and returning 0 makes a transient database error
 * permanent, because the caller flips the resource out of `running` on the same pass and the reaper
 * only ever revisits running resources.
 *
 * @param inputField - jsonb path of the resource id inside the job input (e.g. `input.scraperId`)
 */
export const cancelOrphanedWorkflowJobs = async (
  payload: Payload,
  inputField: string,
  resourceId: number | string,
  currentTime: Date,
  thresholdHours: number
): Promise<number> => {
  const orphanedJobCutoff = new Date(currentTime.getTime() - thresholdHours * 60 * 60 * 1000).toISOString();

  const orphanedJobs = await asSystem(payload).find({
    collection: "payload-jobs" as const,
    where: {
      and: [
        // Job input is jsonb, so a string `equals` compiles to a JSON *string* comparison and never
        // matches a numerically-enqueued id. buildResourceIdMatch covers both representations.
        buildResourceIdMatch(inputField, resourceId),
        { processing: { equals: false } },
        { completedAt: { exists: false } },
        { createdAt: { less_than: orphanedJobCutoff } },
      ],
    },
    // 0 lifts the limit; a fixed number would strand everything past it, since the resource leaves
    // `running` on the same pass (`pagination: false` does not lift an explicit limit).
    limit: 0,
    pagination: false,
  });

  let cancelled = 0;
  for (const job of orphanedJobs.docs) {
    await asSystem(payload).update({
      collection: "payload-jobs" as const,
      id: job.id,
      data: { completedAt: new Date().toISOString(), hasError: true, processing: false },
    });
    cancelled++;
  }
  return cancelled;
};
