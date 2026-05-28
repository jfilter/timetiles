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

/** Resume point constants for the ingest-process workflow. */
const RESUME_DETECT_SCHEMA = "detect-schema";
const RESUME_CREATE_EVENTS = "create-events";
const RESUME_CREATE_SCHEMA_VERSION = "create-schema-version";

/** Maps review reason → resume point for the ingest-process workflow. */
export const REVIEW_RESUME_POINTS: Record<string, string> = {
  [REVIEW_REASONS.SCHEMA_DRIFT]: RESUME_CREATE_SCHEMA_VERSION,
  [REVIEW_REASONS.QUOTA_EXCEEDED]: RESUME_DETECT_SCHEMA,
  [REVIEW_REASONS.HIGH_DUPLICATE_RATE]: RESUME_DETECT_SCHEMA,
  [REVIEW_REASONS.GEOCODING_PARTIAL]: RESUME_CREATE_EVENTS,
  [REVIEW_REASONS.HIGH_ROW_ERROR_RATE]: RESUME_CREATE_EVENTS,
  [REVIEW_REASONS.HIGH_EMPTY_ROW_RATE]: RESUME_DETECT_SCHEMA,
  [REVIEW_REASONS.NO_TIMESTAMP_DETECTED]: RESUME_DETECT_SCHEMA,
  [REVIEW_REASONS.NO_LOCATION_DETECTED]: RESUME_DETECT_SCHEMA,
  // FILE_TOO_LARGE is a hard limit — there is no meaningful resume point.
  // Map to detect-schema so the workflow has a valid target; the user is
  // expected to split the file and retry rather than resume in place.
  [REVIEW_REASONS.FILE_TOO_LARGE]: RESUME_DETECT_SCHEMA,
};

/** Get the resume point for the ingest-process workflow given a review reason. */
export const getResumePointForReason = (reason: string | null | undefined): string => {
  if (!reason) return RESUME_CREATE_SCHEMA_VERSION; // default (backward compat with schema-drift)
  return REVIEW_RESUME_POINTS[reason] ?? RESUME_CREATE_SCHEMA_VERSION;
};
