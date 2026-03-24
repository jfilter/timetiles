/**
 * Shared utility for detecting stuck resources in cleanup jobs.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { parseDateInput } from "@/lib/utils/date";

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
 * Check if a Payload job is actively running for the given resource.
 *
 * Queries the `payload-jobs` collection for jobs whose input references the resource
 * and whose processing status indicates they are currently being worked on.
 * This provides a secondary safety check before resetting a "stuck" resource.
 *
 * @param payload - Payload instance
 * @param resourceFieldPath - The dot-path in job input that references the resource (e.g., "input.scheduledIngestId")
 * @param resourceId - The resource ID to match
 * @returns true if an active Payload job exists for this resource
 */
export const hasActivePayloadJob = async (
  payload: Payload,
  resourceFieldPath: string,
  resourceId: string | number
): Promise<boolean> => {
  try {
    const activeJobs = await payload.find({
      // eslint-disable-next-line @typescript-eslint/prefer-as-const -- payload-jobs is an internal Payload collection not in Config["collections"]
      collection: "payload-jobs" as "payload-jobs",
      where: {
        and: [
          { [resourceFieldPath]: { equals: String(resourceId) } },
          { processingStarted: { equals: true } },
          { hasError: { equals: false } },
          { completedAt: { exists: false } },
        ],
      },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    });
    return activeJobs.docs.length > 0;
  } catch {
    // If we can't check (e.g., collection doesn't exist), assume not active
    // and fall through to the threshold-based check
    return false;
  }
};
