/**
 * Hook handlers for scheduled imports collection.
 *
 * Contains beforeChange hooks that handle schedule calculation,
 * webhook token management, and data normalization. Extracted from
 * the main collection file to improve maintainability and reduce file size.
 *
 * @module
 * @category Collections/ScheduledImports
 */

import { randomBytes } from "node:crypto";

import type { CollectionBeforeChangeHook } from "payload";

const getTimeZoneDateParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number.parseInt(getPart("year"), 10),
    month: Number.parseInt(getPart("month"), 10),
    day: Number.parseInt(getPart("day"), 10),
    hour: Number.parseInt(getPart("hour"), 10),
    minute: Number.parseInt(getPart("minute"), 10),
    second: Number.parseInt(getPart("second"), 10),
    weekday: weekdayMap[getPart("weekday")] ?? 0,
  };
};

const getTimeZoneOffset = (date: Date, timeZone: string): number => {
  const parts = getTimeZoneDateParts(date, timeZone);
  const utcTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcTimestamp - date.getTime();
};

const zonedTimeToUtc = (
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string
): Date => {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    0
  );
  const guessDate = new Date(utcGuess);
  const offset = getTimeZoneOffset(guessDate, timeZone);
  return new Date(utcGuess - offset);
};

/**
 * Calculates the next run time based on frequency.
 */
const calculateNextRunByFrequency = (frequency: string, fromDate?: Date, timeZone = "UTC"): Date => {
  const now = fromDate ?? new Date();
  const nowParts = getTimeZoneDateParts(now, timeZone);

  switch (frequency) {
    case "hourly":
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month,
          day: nowParts.day,
          hour: nowParts.hour + 1,
          minute: 0,
          second: 0,
        },
        timeZone
      );
    case "daily":
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month,
          day: nowParts.day + 1,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone
      );
    case "weekly": {
      const daysUntilSunday = (7 - nowParts.weekday) || 7;
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month,
          day: nowParts.day + daysUntilSunday,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone
      );
    }
    case "monthly":
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month + 1,
          day: 1,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone
      );
    default:
      return now;
  }
};

/**
 * Handle webhook token generation and management.
 */
const handleWebhookToken = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>): void => {
  if (data.webhookEnabled && !data.webhookToken) {
    // Generate new token when enabling webhooks
    data.webhookToken = randomBytes(32).toString("hex");
  } else if (data.webhookEnabled && !originalDoc?.webhookEnabled) {
    // Regenerate token when re-enabling (for security rotation)
    data.webhookToken = randomBytes(32).toString("hex");
  } else if (data.webhookEnabled === false && originalDoc?.webhookEnabled) {
    // Clear token when disabling webhooks
    data.webhookToken = null;
  }
};

/**
 * Handle schedule initialization and statistics.
 */
const handleScheduleInitialization = (data: Record<string, unknown>, operation: string): void => {
  if ((operation === "create" || (operation === "update" && data.enabled)) && (data.cronExpression ?? data.frequency)) {
    // Calculate initial nextRun based on frequency or cron
    if (!data.nextRun && data.frequency) {
      data.nextRun = calculateNextRunByFrequency(data.frequency as string, undefined, (data.timezone as string) || "UTC");
    }

    // This would be calculated by the schedule manager
    // For now, just ensure the fields exist
    data.statistics ??= {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    };
  }
};

/**
 * Clear fields based on schedule type.
 */
const clearScheduleTypeFields = (data: Record<string, unknown>): void => {
  if (data.scheduleType === "frequency") {
    data.cronExpression = null;
  } else if (data.scheduleType === "cron") {
    data.frequency = null;
  }
};

/**
 * Hook that handles schedule calculation, webhook token management, and field normalization.
 * Also preserves createdBy on updates to prevent modification.
 */
export const beforeChangeHook: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (!data) return data;

  // Prevent changing createdBy on update - preserve the original value
  if (operation === "update" && originalDoc?.createdBy) {
    data.createdBy = typeof originalDoc.createdBy === "object" ? originalDoc.createdBy.id : originalDoc.createdBy;
  }

  data.timezone ??= (originalDoc?.timezone as string | undefined) ?? "UTC";

  // Handle webhook token generation
  handleWebhookToken(data, originalDoc);

  // Calculate next run time when creating or enabling a schedule
  handleScheduleInitialization(data, operation);

  // Clear fields based on schedule type
  clearScheduleTypeFields(data);

  return data;
};
