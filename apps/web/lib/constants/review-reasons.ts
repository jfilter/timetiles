/**
 * Review reason constants used by both server (job handlers) and client (review panel).
 *
 * Extracted from `lib/jobs/workflows/review-checks.ts` to avoid pulling server-only
 * dependencies (logger, getAppConfig) into the client bundle.
 *
 * @module
 * @category Constants
 */
export const REVIEW_REASONS = {
  SCHEMA_DRIFT: "schema-drift",
  QUOTA_EXCEEDED: "quota-exceeded",
  HIGH_DUPLICATE_RATE: "high-duplicates",
  GEOCODING_PARTIAL: "geocoding-partial",
  HIGH_ROW_ERROR_RATE: "high-row-errors",
  HIGH_EMPTY_ROW_RATE: "high-empty-rows",
  NO_TIMESTAMP_DETECTED: "no-timestamp",
  NO_LOCATION_DETECTED: "no-location",
  FILE_TOO_LARGE: "file-too-large",
} as const;
