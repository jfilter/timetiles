/**
 * Cron expression parser and scheduler utilities.
 *
 * Provides parsing and evaluation of cron expressions for scheduled imports.
 * Supports standard 5-field cron syntax with common patterns like daily,
 * weekly, and monthly schedules. Used by the scheduled import system.
 *
 * @module
 * @category Utilities
 */

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

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

  const num = parseInt(value);
  if (isNaN(num) || num < min || num > max) {
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
    const pattern = detectCronPattern(parts);

    switch (pattern) {
      case "every-minute":
        return "Every minute";

      case "hourly":
        return `Every hour at :${parts.minute.padStart(2, "0")}`;

      case "daily": {
        const hour = parseInt(parts.hour);
        const minute = parseInt(parts.minute);
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        return `Daily at ${timeStr}`;
      }

      case "weekly": {
        const hour = parseInt(parts.hour);
        const minute = parseInt(parts.minute);
        const dow = parseInt(parts.dayOfWeek);
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        return `Every ${days[dow % 7]} at ${timeStr}`;
      }

      case "monthly": {
        const hour = parseInt(parts.hour);
        const minute = parseInt(parts.minute);
        const day = parseInt(parts.dayOfMonth);
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
