/**
 * Hook handlers for scheduled imports collection.
 *
 * Contains beforeChange hooks that handle schedule calculation
 * and data normalization. Extracted from the main collection file
 * to improve maintainability and reduce file size.
 *
 * @module
 * @category Collections/ScheduledImports
 */

import type { CollectionBeforeChangeHook } from "payload";

/**
 * Calculates the next run time based on frequency
 */
const calculateNextRunByFrequency = (frequency: string, fromDate?: Date): Date => {
  const now = fromDate ?? new Date();
  const next = new Date(now);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  switch (frequency) {
    case "hourly":
      next.setUTCMinutes(0);
      next.setUTCHours(next.getUTCHours() + 1);
      break;
    case "daily":
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly": {
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      const daysUntilSunday = 7 - next.getUTCDay() || 7;
      next.setUTCDate(next.getUTCDate() + daysUntilSunday);
      break;
    }
    case "monthly":
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }

  return next;
};

/**
 * Hook that handles schedule calculation and field normalization
 */
export const beforeChangeHook: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (!data) return data;

  // Set createdBy on create
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }

  // Calculate next run time when creating or enabling a schedule
  if ((operation === "create" || (operation === "update" && data.enabled)) && (data.cronExpression || data.frequency)) {
    // Calculate initial nextRun based on frequency or cron
    if (!data.nextRun && data.frequency) {
      data.nextRun = calculateNextRunByFrequency(data.frequency);
    }

    // This would be calculated by the schedule manager
    // For now, just ensure the fields exist
    if (!data.statistics) {
      data.statistics = {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
      };
    }
  }

  // Clear fields based on schedule type
  if (data.scheduleType === "frequency") {
    data.cronExpression = null;
  } else if (data.scheduleType === "cron") {
    data.frequency = null;
  }

  return data;
};
