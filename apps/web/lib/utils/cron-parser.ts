/**
 * Simple cron expression parser for common patterns
 * Supports basic scheduling patterns used in scheduled imports
 */

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

/**
 * Parse a cron expression into its component parts
 */
export const parseCronExpression = (cronExpression: string): CronParts => {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}. Expected 5 parts, got ${parts.length}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return {
    minute: minute || "*",
    hour: hour || "*",
    dayOfMonth: dayOfMonth || "*",
    month: month || "*",
    dayOfWeek: dayOfWeek || "*",
  };
};

/**
 * Validate cron expression parts
 */
export const validateCronParts = (parts: CronParts): void => {
  // Validate minute (0-59)
  if (parts.minute !== "*") {
    const minute = parseInt(parts.minute);
    if (isNaN(minute) || minute < 0 || minute > 59) {
      throw new Error(`Invalid minute in cron expression: ${parts.minute}`);
    }
  }

  // Validate hour (0-23)
  if (parts.hour !== "*") {
    const hour = parseInt(parts.hour);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      throw new Error(`Invalid hour in cron expression: ${parts.hour}`);
    }
  }

  // Validate day of month (1-31)
  if (parts.dayOfMonth !== "*") {
    const day = parseInt(parts.dayOfMonth);
    if (isNaN(day) || day < 1 || day > 31) {
      throw new Error(`Invalid day of month in cron expression: ${parts.dayOfMonth}`);
    }
  }

  // Validate month (1-12)
  if (parts.month !== "*") {
    const month = parseInt(parts.month);
    if (isNaN(month) || month < 1 || month > 12) {
      throw new Error(`Invalid month in cron expression: ${parts.month}`);
    }
  }

  // Validate day of week (0-6, where 0 and 7 are Sunday)
  if (parts.dayOfWeek !== "*") {
    const dow = parseInt(parts.dayOfWeek);
    if (isNaN(dow) || dow < 0 || dow > 7) {
      throw new Error(`Invalid day of week in cron expression: ${parts.dayOfWeek}`);
    }
  }
};

/**
 * Detect the pattern type from cron expression
 */
export type CronPattern = "every-minute" | "hourly" | "daily" | "weekly" | "monthly" | "complex";

export const detectCronPattern = (parts: CronParts): CronPattern => {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parts;

  // Every minute: * * * * *
  if (minute === "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "every-minute";
  }

  // Hourly: N * * * * (specific minute, any hour)
  if (minute !== "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "hourly";
  }

  // Daily: N N * * * (specific time, any day)
  if (minute !== "*" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "daily";
  }

  // Weekly: N N * * D (specific time and day of week)
  if (minute !== "*" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    return "weekly";
  }

  // Monthly: N N D * * (specific time and day of month)
  if (minute !== "*" && hour !== "*" && dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    return "monthly";
  }

  // Everything else is complex
  return "complex";
};

/**
 * Get human-readable description of cron expression
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
  return s[(v - 20) % 10] || s[v] || s[0] || "th";
};
