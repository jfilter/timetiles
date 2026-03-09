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

import { validateCronExpression } from "@/lib/collections/scheduled-imports/validation";
import { logger } from "@/lib/logger";

/**
 * Calculates the next run time based on frequency.
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
 * Parses a cron expression and matches it against a date.
 */
const matchesCronPart = (field: string, value: number): boolean => {
  if (field === "*") return true;

  return field.split(",").some((part) => {
    if (part.startsWith("*/")) {
      const step = Number.parseInt(part.slice(2), 10);
      return step > 0 && value % step === 0;
    }
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number.parseInt(startRaw ?? "", 10);
      const end = Number.parseInt(endRaw ?? "", 10);
      return !Number.isNaN(start) && !Number.isNaN(end) && value >= start && value <= end;
    }
    return Number.parseInt(part, 10) === value;
  });
};

const matchesCronDate = (
  date: Date,
  parts: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string }
): boolean => {
  if (!matchesCronPart(parts.minute, date.getUTCMinutes())) return false;
  if (!matchesCronPart(parts.hour, date.getUTCHours())) return false;
  if (!matchesCronPart(parts.month, date.getUTCMonth() + 1)) return false;

  const dayOfMonthMatches = matchesCronPart(parts.dayOfMonth, date.getUTCDate());
  const dayOfWeek = date.getUTCDay();
  const dayOfWeekMatches =
    parts.dayOfWeek === "*" ||
    matchesCronPart(parts.dayOfWeek, dayOfWeek) ||
    (dayOfWeek === 0 && matchesCronPart(parts.dayOfWeek, 7));
  const usesDayOfMonth = parts.dayOfMonth !== "*";
  const usesDayOfWeek = parts.dayOfWeek !== "*";

  if (usesDayOfMonth && usesDayOfWeek) return dayOfMonthMatches || dayOfWeekMatches;
  if (usesDayOfMonth) return dayOfMonthMatches;
  if (usesDayOfWeek) return dayOfWeekMatches;
  return true;
};

/**
 * Calculate the next run time from a cron expression.
 */
const calculateNextRunByCron = (cronExpression: string, fromDate?: Date): Date | null => {
  const validationResult = validateCronExpression(cronExpression);
  if (validationResult !== true) return null;

  const rawParts = cronExpression.trim().split(/\s+/);
  if (rawParts.length !== 5) return null;

  const [minute = "*", hour = "*", dayOfMonth = "*", month = "*", dayOfWeek = "*"] = rawParts;
  const parts = { minute, hour, dayOfMonth, month, dayOfWeek };

  const next = new Date(fromDate ?? new Date());
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCronDate(next, parts)) {
      return next;
    }
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  return null;
};

/**
 * Handle schedule initialization and statistics.
 */
const handleScheduleInitialization = (data: Record<string, unknown>, operation: string): void => {
  if ((operation === "create" || (operation === "update" && data.enabled)) && (data.cronExpression ?? data.frequency)) {
    // Calculate initial nextRun based on frequency or cron
    if (!data.nextRun && data.frequency) {
      data.nextRun = calculateNextRunByFrequency(data.frequency as string);
    }

    if (!data.nextRun && data.cronExpression) {
      const nextRun = calculateNextRunByCron(data.cronExpression as string);
      if (nextRun) {
        data.nextRun = nextRun.toISOString();
      } else {
        logger.warn("Failed to calculate nextRun from cron expression", {
          cronExpression: data.cronExpression,
        });
      }
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

  // Handle webhook token generation
  handleWebhookToken(data, originalDoc);

  // Clear fields based on schedule type BEFORE calculating nextRun,
  // so the correct schedule type is used for the calculation
  clearScheduleTypeFields(data);

  // Calculate next run time when creating or enabling a schedule
  handleScheduleInitialization(data, operation);

  return data;
};
