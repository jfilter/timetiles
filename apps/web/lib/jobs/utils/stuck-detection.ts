/**
 * Shared utility for detecting stuck resources in cleanup jobs.
 *
 * @module
 * @category Jobs
 */
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
