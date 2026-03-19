/**
 * Shared utility for detecting stuck resources in cleanup jobs.
 *
 * @module
 * @category Jobs
 */
import { parseDateInput } from "@/lib/utils/date";

/**
 * Check if a resource is stuck in a "running" state beyond a time threshold.
 *
 * @param status - Current status of the resource (e.g., "running", "completed")
 * @param runningStatus - The status value that indicates "running" (e.g., "running")
 * @param lastRunAt - When the resource last started running (ISO string or Date)
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
