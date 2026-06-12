/**
 * Validation functions for scheduled ingests.
 *
 * Contains validation logic for cron expressions, URLs, and other
 * scheduled ingest fields. Extracted from the main collection file
 * to improve maintainability and reduce file size.
 *
 * @module
 * @category Collections/ScheduledIngests
 */

import { parseCronExpression } from "@/lib/ingest/cron-parser";
import { validateExtractPattern } from "@/lib/ingest/safe-regex";
import { validateExternalHttpUrl } from "@/lib/security/url-validation";

/**
 * Validates a URL string for Payload field validation.
 * Wraps the centralized URL validator with Payload's `string | true` return convention.
 */
export const validateUrl = (val: string | null | undefined): string | true => {
  if (!val) return "The following field is invalid: Source URL - URL is required";
  const result = validateExternalHttpUrl(val);
  if ("error" in result) {
    return `The following field is invalid: Source URL - ${result.error}`;
  }
  return true;
};

/**
 * Validates a cron expression field range.
 */
const parseStrictCronNumber = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  return Number.parseInt(trimmedValue, 10);
};

const validateRange = (field: string, min: number, max: number, name: string): string | true => {
  // Ranges may carry a step (A-B/N) — validate it, then the bare range.
  const [rangePart, stepPart] = field.split("/");
  if (stepPart !== undefined) {
    const step = parseStrictCronNumber(stepPart);
    if (step == null || step <= 0) {
      return `Invalid ${name} step value in cron expression`;
    }
  }
  const parts = (rangePart ?? "").split("-");
  if (parts.length !== 2) {
    return `Invalid ${name} range in cron expression`;
  }
  const [start, end] = parts.map((p) => parseStrictCronNumber(p));
  if (start == null || end == null || start < min || end > max || start > end) {
    return `Invalid ${name} range in cron expression (must be ${min}-${max})`;
  }
  return true;
};

/**
 * Validates a cron expression step value.
 */
const validateStep = (field: string, name: string): string | true => {
  const step = parseStrictCronNumber(field.substring(2));
  if (step == null || step <= 0) {
    return `Invalid ${name} step value in cron expression`;
  }
  return true;
};

/**
 * Validates a list of cron expression values.
 */
const validateList = (field: string, min: number, max: number, name: string): string | true => {
  const values = field.split(",");
  for (const v of values) {
    const num = parseStrictCronNumber(v);
    if (num == null || num < min || num > max) {
      return `Invalid ${name} value ${v} in cron expression (must be ${min}-${max})`;
    }
  }
  return true;
};

/**
 * Validates a single cron expression field.
 */
const validateField = (field: string, min: number, max: number, name: string): string | true => {
  if (field === "*") return true;

  // Handle different cron patterns
  if (field.includes("-")) {
    return validateRange(field, min, max, name);
  }
  if (field.startsWith("*/")) {
    return validateStep(field, name);
  }
  if (field.includes(",")) {
    return validateList(field, min, max, name);
  }

  // Simple numeric value
  const num = parseStrictCronNumber(field);
  if (num == null || num < min || num > max) {
    return `The following field is invalid: Cron expression - invalid ${name} value (must be ${min}-${max})`;
  }
  return true;
};

/**
 * Validates a complete cron expression.
 */
export const validateCronExpression = (value: string | null | undefined): string | true => {
  if (!value) return true; // Not required

  let cronParts;
  try {
    cronParts = parseCronExpression(value);
  } catch {
    return "The following field is invalid: Cron expression must have exactly 5 fields (minute hour day month weekday)";
  }

  const { minute, hour, dayOfMonth, month, dayOfWeek } = cronParts;

  // Validate each field
  const minuteValid = validateField(minute, 0, 59, "minute");
  if (minuteValid !== true) return minuteValid;

  const hourValid = validateField(hour, 0, 23, "hour");
  if (hourValid !== true) return hourValid;

  const dayValid = validateField(dayOfMonth, 1, 31, "day of month");
  if (dayValid !== true) return dayValid;

  const monthValid = validateField(month, 1, 12, "month");
  if (monthValid !== true) return monthValid;

  const weekdayValid = validateField(dayOfWeek, 0, 7, "day of week");
  if (weekdayValid !== true) return weekdayValid;

  return true;
};

/** Valid frequency values accepted by the schedule system. */
const VALID_FREQUENCIES = new Set(["hourly", "daily", "weekly", "monthly"]);

/**
 * Validates that either frequency or cron expression is provided when enabled,
 * and that the frequency value is one of the accepted options.
 */
export const validateScheduleConfig = (
  _value: unknown,
  {
    siblingData,
  }: {
    siblingData?: {
      enabled?: boolean;
      scheduleType?: string;
      frequency?: string | null;
      cronExpression?: string | null;
    };
  }
): string | true => {
  if (!siblingData?.enabled) {
    return true; // No validation needed when disabled
  }

  if (siblingData.scheduleType === "frequency" && !siblingData.frequency) {
    return "Frequency is required when schedule type is 'frequency'";
  }

  if (
    siblingData.scheduleType === "frequency" &&
    siblingData.frequency &&
    !VALID_FREQUENCIES.has(siblingData.frequency)
  ) {
    return `Invalid frequency: ${siblingData.frequency}. Must be one of: ${[...VALID_FREQUENCIES].join(", ")}`;
  }

  if (siblingData.scheduleType === "cron" && !siblingData.cronExpression) {
    return "Cron expression is required when schedule type is 'cron'";
  }

  return true;
};

// ---------------------------------------------------------------------------
// HTML-in-JSON detail-page regex validation
// ---------------------------------------------------------------------------

/**
 * Validate user-supplied regex patterns inside a stored `htmlExtractConfig`.
 *
 * `htmlExtractConfig` is an opaque `json` field, so its `detailPage.fields[].pattern`
 * values are not reached by Payload field-level validation. Those patterns are
 * compiled and run against fetched detail-page text inside the shared ingest
 * worker (see `enrichRecordsFromDetailPages`), so a catastrophic-backtracking
 * shape would block the worker (ReDoS). We reject unsafe patterns at save time
 * using the same validator the `extract` transform uses at runtime.
 *
 * Returns `null` when every pattern is safe, or a user-presentable error string.
 */
export const validateHtmlExtractConfig = (htmlExtractConfig: unknown): string | null => {
  if (htmlExtractConfig == null || typeof htmlExtractConfig !== "object") return null;

  const detailPage = (htmlExtractConfig as { detailPage?: unknown }).detailPage;
  if (detailPage == null || typeof detailPage !== "object") return null;

  const fields = (detailPage as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return null;

  for (const [index, field] of fields.entries()) {
    if (field == null || typeof field !== "object") continue;
    const pattern = (field as { pattern?: unknown }).pattern;
    // Empty/omitted pattern is tolerated — runtime extracts plain text instead.
    if (pattern == null || pattern === "") continue;
    if (typeof pattern !== "string") {
      return `htmlExtractConfig detail-page field ${index + 1}: pattern must be a string`;
    }
    const validation = validateExtractPattern(pattern);
    if (!validation.valid) {
      return `htmlExtractConfig detail-page field ${index + 1}: ${validation.reason}`;
    }
  }

  return null;
};
