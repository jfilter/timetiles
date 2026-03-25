/**
 * Frequency-based schedule calculation utilities.
 *
 * Shared by both the scheduled-ingests collection hooks (initial nextRun
 * on create/update) and the schedule-manager job (runtime next-run after
 * execution). Extracted to eliminate duplication between those two sites.
 *
 * @module
 * @category Utilities
 */

import { getDatePartsInTimezone, wallClockToUtc } from "@/lib/utils/timezone";

/**
 * Calculate the next frequency-based execution in a specific timezone.
 *
 * Schedule boundaries (midnight, start of week, etc.) are computed in the
 * given timezone. The returned Date is always a UTC instant.
 */
const getNextFrequencyInTimezone = (frequency: string, now: Date, timezone: string): Date => {
  const local = getDatePartsInTimezone(now, timezone);

  switch (frequency) {
    case "hourly": {
      let result = wallClockToUtc(local.year, local.month, local.day, local.hour + 1, 0, timezone);
      while (result <= now) {
        result = new Date(result.getTime() + 60 * 60 * 1000);
      }
      return result;
    }
    case "daily": {
      let result = wallClockToUtc(local.year, local.month, local.day + 1, 0, 0, timezone);
      while (result <= now) {
        result = new Date(result.getTime() + 24 * 60 * 60 * 1000);
      }
      return result;
    }
    case "weekly": {
      const daysUntilSunday = 7 - local.dayOfWeek || 7;
      let result = wallClockToUtc(local.year, local.month, local.day + daysUntilSunday, 0, 0, timezone);
      while (result <= now) {
        result = new Date(result.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      return result;
    }
    case "monthly": {
      let result = wallClockToUtc(local.year, local.month + 1, 1, 0, 0, timezone);
      while (result <= now) {
        const advParts = getDatePartsInTimezone(result, timezone);
        result = wallClockToUtc(advParts.year, advParts.month + 1, 1, 0, 0, timezone);
      }
      return result;
    }
    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }
};

/**
 * Gets the next execution time based on frequency.
 *
 * When a timezone is provided, schedule boundaries (midnight, start of week, etc.)
 * are computed in that timezone. The returned Date is always a UTC instant.
 * Defaults to UTC for backward compatibility.
 */
export const getNextFrequencyExecution = (frequency: string, fromDate?: Date, timezone?: string): Date => {
  const now = fromDate ?? new Date();
  const tz = timezone ?? "UTC";

  if (tz !== "UTC") {
    return getNextFrequencyInTimezone(frequency, now, tz);
  }

  const next = new Date(now);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  switch (frequency) {
    case "hourly": {
      next.setUTCMinutes(0);
      next.setUTCHours(next.getUTCHours() + 1);
      while (next <= now) {
        next.setUTCHours(next.getUTCHours() + 1);
      }
      break;
    }

    case "daily":
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(next.getUTCDate() + 1);
      while (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
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

    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }

  return next;
};
