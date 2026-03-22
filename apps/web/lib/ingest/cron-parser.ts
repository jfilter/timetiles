/**
 * Cron expression parser and scheduler utilities.
 *
 * Provides parsing and evaluation of cron expressions for scheduled ingests.
 * Supports standard 5-field cron syntax with common patterns like daily,
 * weekly, and monthly schedules. Used by the scheduled ingest system.
 *
 * All functions default to UTC when no timezone is specified (backward compatible).
 * When a timezone is provided, cron fields are matched against wall-clock time
 * in that timezone rather than UTC.
 *
 * @module
 * @category Utilities
 */

import { createTimezoneFormatter, getDatePartsWithFormatter } from "@/lib/utils/timezone";

export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const numericCronFieldRegex = /^\d+$/;

/**
 * Parse a cron expression into its component parts.
 */
export const parseCronExpression = (cronExpression: string): CronParts => {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}. Expected 5 parts, got ${parts.length}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return {
    minute: minute ?? "*",
    hour: hour ?? "*",
    dayOfMonth: dayOfMonth ?? "*",
    month: month ?? "*",
    dayOfWeek: dayOfWeek ?? "*",
  };
};

// Helper function to validate numeric cron field
const validateNumericField = (value: string, fieldName: string, min: number, max: number): void => {
  if (value === "*") return;

  if (!numericCronFieldRegex.test(value)) {
    throw new Error(`Invalid ${fieldName} in cron expression: ${value}`);
  }

  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < min || num > max) {
    throw new Error(`Invalid ${fieldName} in cron expression: ${value}`);
  }
};

/**
 * Validate cron expression parts.
 */
export const validateCronParts = (parts: CronParts): void => {
  validateNumericField(parts.minute, "minute", 0, 59);
  validateNumericField(parts.hour, "hour", 0, 23);
  validateNumericField(parts.dayOfMonth, "day of month", 1, 31);
  validateNumericField(parts.month, "month", 1, 12);
  validateNumericField(parts.dayOfWeek, "day of week", 0, 7);
};

/**
 * Detect the pattern type from cron expression.
 */
export type CronPattern = "every-minute" | "hourly" | "daily" | "weekly" | "monthly" | "complex";

// Helper to check if all fields match a pattern
const matchesPattern = (parts: CronParts, pattern: string[]): boolean => {
  const fields = [parts.minute, parts.hour, parts.dayOfMonth, parts.month, parts.dayOfWeek];
  return fields.every((field, index) => {
    const expected = pattern[index];
    return expected === "N" ? field !== "*" : field === expected;
  });
};

export const detectCronPattern = (parts: CronParts): CronPattern => {
  // Define patterns: [minute, hour, dayOfMonth, month, dayOfWeek]
  // "N" means non-wildcard, "*" means wildcard
  const patterns: Array<[string[], CronPattern]> = [
    [["*", "*", "*", "*", "*"], "every-minute"],
    [["N", "*", "*", "*", "*"], "hourly"],
    [["N", "N", "*", "*", "*"], "daily"],
    [["N", "N", "*", "*", "N"], "weekly"],
    [["N", "N", "N", "*", "*"], "monthly"],
  ];

  for (const [pattern, type] of patterns) {
    if (matchesPattern(parts, pattern)) {
      return type;
    }
  }

  return "complex";
};

/**
 * Get human-readable description of cron expression.
 */
export const describeCronExpression = (cronExpression: string): string => {
  try {
    const parts = parseCronExpression(cronExpression);
    validateCronParts(parts);
    const pattern = detectCronPattern(parts);

    switch (pattern) {
      case "every-minute":
        return "Every minute";

      case "hourly":
        return `Every hour at :${parts.minute.padStart(2, "0")}`;

      case "daily": {
        const hour = Number.parseInt(parts.hour, 10);
        const minute = Number.parseInt(parts.minute, 10);
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        return `Daily at ${timeStr}`;
      }

      case "weekly": {
        const hour = Number.parseInt(parts.hour, 10);
        const minute = Number.parseInt(parts.minute, 10);
        const dow = Number.parseInt(parts.dayOfWeek, 10);
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        return `Every ${days[dow % 7]} at ${timeStr}`;
      }

      case "monthly": {
        const hour = Number.parseInt(parts.hour, 10);
        const minute = Number.parseInt(parts.minute, 10);
        const day = Number.parseInt(parts.dayOfMonth, 10);
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        return `Monthly on the ${day}${getOrdinalSuffix(day)} at ${timeStr}`;
      }

      default:
        return cronExpression;
    }
  } catch {
    return cronExpression;
  }
};

const getOrdinalSuffix = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th";
};

const strictParseInt = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  return Number.parseInt(value, 10);
};

/**
 * Test if a cron field matches a specific value.
 * Supports wildcards (*), steps (asterisk/N), ranges (A-B), and lists (A,B,C).
 */
export const matchesCronField = (field: string, value: number): boolean => {
  if (field === "*") return true;

  return field.split(",").some((part) => {
    if (part.startsWith("*/")) {
      const step = strictParseInt(part.slice(2));
      return step != null && step > 0 && value % step === 0;
    }
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = strictParseInt(startRaw ?? "");
      const end = strictParseInt(endRaw ?? "");
      return start != null && end != null && value >= start && value <= end;
    }
    const parsed = strictParseInt(part);
    return parsed != null && parsed === value;
  });
};

/**
 * Test if a date matches a cron expression's parts.
 *
 * When a timezone formatter is provided, the cron fields are matched against
 * wall-clock time in that timezone. Pass `undefined` or omit for UTC (backward compatible).
 *
 * Accepts an Intl.DateTimeFormat for performance in tight loops; use
 * {@link createTimezoneFormatter} from `@/lib/utils/timezone` to create one.
 */
export const matchesCronDate = (date: Date, parts: CronParts, tzFormatter?: Intl.DateTimeFormat): boolean => {
  let minute: number;
  let hour: number;
  let month: number;
  let dayOfMonthValue: number;
  let dayOfWeek: number;

  if (tzFormatter) {
    const tz = getDatePartsWithFormatter(date, tzFormatter);
    minute = tz.minute;
    hour = tz.hour;
    month = tz.month;
    dayOfMonthValue = tz.day;
    dayOfWeek = tz.dayOfWeek;
  } else {
    minute = date.getUTCMinutes();
    hour = date.getUTCHours();
    month = date.getUTCMonth() + 1;
    dayOfMonthValue = date.getUTCDate();
    dayOfWeek = date.getUTCDay();
  }

  if (!matchesCronField(parts.minute, minute)) return false;
  if (!matchesCronField(parts.hour, hour)) return false;
  if (!matchesCronField(parts.month, month)) return false;

  const dayOfMonthMatches = matchesCronField(parts.dayOfMonth, dayOfMonthValue);
  const dayOfWeekMatches =
    parts.dayOfWeek === "*" ||
    matchesCronField(parts.dayOfWeek, dayOfWeek) ||
    (dayOfWeek === 0 && matchesCronField(parts.dayOfWeek, 7));
  const usesDayOfMonth = parts.dayOfMonth !== "*";
  const usesDayOfWeek = parts.dayOfWeek !== "*";

  if (usesDayOfMonth && usesDayOfWeek) return dayOfMonthMatches || dayOfWeekMatches;
  if (usesDayOfMonth) return dayOfMonthMatches;
  if (usesDayOfWeek) return dayOfWeekMatches;
  return true;
};

/**
 * Calculate the next time a cron expression matches after fromDate.
 * Returns null if no match found within ~1 year.
 *
 * When timezone is provided, cron fields are matched against wall-clock time
 * in that timezone. The returned Date is always a UTC Date object.
 */
export const calculateNextCronRun = (cronExpression: string, fromDate?: Date, timezone?: string): Date | null => {
  const parts = parseCronExpression(cronExpression);
  const next = new Date(fromDate ?? new Date());
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  // Create formatter once for the entire search (avoids O(n) Intl construction)
  const tzFormatter = timezone && timezone !== "UTC" ? createTimezoneFormatter(timezone) : undefined;

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCronDate(next, parts, tzFormatter)) {
      return next;
    }
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  return null;
};
