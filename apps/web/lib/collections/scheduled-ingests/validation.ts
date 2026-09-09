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

import { createCronSchedule } from "@/lib/ingest/cron-parser";
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

/** Validates optional cron input with the same engine used for execution. */
export const validateCronExpression = (value: string | null | undefined): string | true => {
  if (!value) return true;
  try {
    createCronSchedule(value);
    return true;
  } catch (error) {
    return `The following field is invalid: Cron expression - ${error instanceof Error ? error.message : "Invalid expression"}`;
  }
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
