/**
 * Review check functions for the ingest pipeline.
 *
 * These checks run between pipeline tasks and can pause processing
 * by setting the IngestJob to NEEDS_REVIEW with a specific reason.
 * The user (or admin) reviews the issue and decides how to proceed.
 *
 * Thresholds are configurable at two levels:
 * - Global defaults via `timetiles.yml` → `reviewThresholds`
 * - Per-source overrides via `scheduled-ingests` / `scrapers` → `advancedOptions.reviewChecks`
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { getAppConfig } from "@/lib/config/app-config";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";

/** Per-source review check overrides (stored in processingOptions.reviewChecks). */
export interface ReviewChecksConfig {
  skipTimestampCheck?: boolean;
  skipLocationCheck?: boolean;
  skipEmptyRowCheck?: boolean;
  skipRowErrorCheck?: boolean;
  skipDuplicateRateCheck?: boolean;
  skipGeocodingCheck?: boolean;
  emptyRowThreshold?: number | null;
  rowErrorThreshold?: number | null;
  duplicateRateThreshold?: number | null;
  geocodingFailureThreshold?: number | null;
}

/** Review reasons — extensible enum for different pause conditions. */
export const REVIEW_REASONS = {
  SCHEMA_DRIFT: "schema-drift",
  QUOTA_EXCEEDED: "quota-exceeded",
  HIGH_DUPLICATE_RATE: "high-duplicates",
  GEOCODING_PARTIAL: "geocoding-partial",
  HIGH_ROW_ERROR_RATE: "high-row-errors",
  HIGH_EMPTY_ROW_RATE: "high-empty-rows",
  NO_TIMESTAMP_DETECTED: "no-timestamp",
  NO_LOCATION_DETECTED: "no-location",
} as const;

/** Maps review reason → resume point for the ingest-process workflow. */
export const REVIEW_RESUME_POINTS: Record<string, string> = {
  [REVIEW_REASONS.SCHEMA_DRIFT]: "create-schema-version",
  [REVIEW_REASONS.QUOTA_EXCEEDED]: "detect-schema",
  [REVIEW_REASONS.HIGH_DUPLICATE_RATE]: "detect-schema",
  [REVIEW_REASONS.GEOCODING_PARTIAL]: "create-events",
  [REVIEW_REASONS.HIGH_ROW_ERROR_RATE]: "create-events",
  [REVIEW_REASONS.HIGH_EMPTY_ROW_RATE]: "detect-schema",
  [REVIEW_REASONS.NO_TIMESTAMP_DETECTED]: "detect-schema",
  [REVIEW_REASONS.NO_LOCATION_DETECTED]: "detect-schema",
};

/** Get the global review thresholds from app config. */
const getThresholds = () => getAppConfig().reviewThresholds;

/**
 * Set an IngestJob to NEEDS_REVIEW with a specific reason and details.
 */
export const setNeedsReview = async (
  payload: Payload,
  ingestJobId: string | number,
  reason: string,
  details: Record<string, unknown>
): Promise<void> => {
  logger.info(`Setting ingest job to NEEDS_REVIEW`, { ingestJobId, reason, details });

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { stage: PROCESSING_STAGE.NEEDS_REVIEW, reviewReason: reason, reviewDetails: details } as Record<
      string,
      unknown
    >,
  });
};

/**
 * Check if importing uniqueRows events would exceed the user's quota.
 * Returns `{ allowed: true }` or `{ allowed: false, ...details }`.
 */
export const checkQuotaForSheet = async (
  payload: Payload,
  ingestJobId: string | number,
  uniqueRows: number
): Promise<{ allowed: boolean; current?: number; limit?: number; estimatedNew?: number; reason?: string }> => {
  // Load the ingest job to get the user
  const ingestJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
  if (!ingestJob) return { allowed: true }; // Can't check, let it proceed

  const ingestFileId = extractRelationId(ingestJob.ingestFile);
  if (!ingestFileId) return { allowed: true };

  const ingestFile = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId });
  if (!ingestFile?.user) return { allowed: true };

  const userId = extractRelationId(ingestFile.user);
  if (!userId) return { allowed: true };

  const user = await payload.findByID({ collection: COLLECTION_NAMES.USERS, id: userId });
  if (!user) return { allowed: true };

  const quotaService = createQuotaService(payload);

  // Check per-import quota
  const perImportCheck = await quotaService.checkQuota(user, "EVENTS_PER_IMPORT", uniqueRows);
  if (!perImportCheck.allowed) {
    return {
      allowed: false,
      current: perImportCheck.current ?? 0,
      limit: perImportCheck.limit ?? 0,
      estimatedNew: uniqueRows,
      reason: `This import would create ${uniqueRows} events, exceeding your limit of ${perImportCheck.limit} events per import.`,
    };
  }

  // Check total events quota
  const totalCheck = await quotaService.checkQuota(user, "TOTAL_EVENTS", uniqueRows);
  if (!totalCheck.allowed) {
    return {
      allowed: false,
      current: totalCheck.current ?? 0,
      limit: totalCheck.limit ?? 0,
      estimatedNew: uniqueRows,
      reason: `Creating ${uniqueRows} events would exceed your total events limit (${totalCheck.current}/${totalCheck.limit}).`,
    };
  }

  return { allowed: true };
};

/**
 * Check if the duplicate rate is too high (>80% by default).
 * Returns true if review is needed.
 */
export const shouldReviewHighDuplicates = (
  totalRows: number,
  uniqueRows: number,
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean; duplicateRate?: number } => {
  if (reviewChecks?.skipDuplicateRateCheck) return { needsReview: false };
  if (totalRows <= 0) return { needsReview: false };

  // 0 unique rows out of N total = 100% duplicates → definitely needs review
  if (uniqueRows <= 0 && totalRows > 0) return { needsReview: true, duplicateRate: 1 };

  const duplicateRate = 1 - uniqueRows / totalRows;
  const threshold = reviewChecks?.duplicateRateThreshold ?? getThresholds().highDuplicateRate;
  if (duplicateRate > threshold) {
    return { needsReview: true, duplicateRate };
  }
  return { needsReview: false };
};

/**
 * Check if geocoding had too many failures (>50% by default).
 * Returns true if review is needed.
 */
export const shouldReviewGeocodingPartial = (
  geocoded: number,
  failed: number,
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean; failRate?: number } => {
  if (reviewChecks?.skipGeocodingCheck) return { needsReview: false };

  const total = geocoded + failed;
  if (total <= 0 || geocoded <= 0) return { needsReview: false }; // total failure handled separately

  const failRate = failed / total;
  const threshold = reviewChecks?.geocodingFailureThreshold ?? getThresholds().geocodingPartialFailureRate;
  if (failRate > threshold) {
    return { needsReview: true, failRate };
  }
  return { needsReview: false };
};

/**
 * Check if too many rows failed during event creation (>10% by default).
 * Returns true if review is needed.
 */
export const shouldReviewHighRowErrors = (
  totalEvents: number,
  errorCount: number,
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean; errorRate?: number } => {
  if (reviewChecks?.skipRowErrorCheck) return { needsReview: false };

  const total = totalEvents + errorCount;
  if (total <= 0) return { needsReview: false };

  const errorRate = errorCount / total;
  const threshold = reviewChecks?.rowErrorThreshold ?? getThresholds().highRowErrorRate;
  if (errorRate > threshold) {
    return { needsReview: true, errorRate };
  }
  return { needsReview: false };
};

/**
 * Check if too many rows are empty (>20% by default).
 * An empty row is one where all values are null, undefined, or blank strings.
 * Returns true if review is needed.
 */
export const shouldReviewHighEmptyRows = (
  totalRows: number,
  emptyRows: number,
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean; emptyRate?: number } => {
  if (reviewChecks?.skipEmptyRowCheck) return { needsReview: false };
  if (totalRows <= 0) return { needsReview: false };

  const emptyRate = emptyRows / totalRows;
  const threshold = reviewChecks?.emptyRowThreshold ?? getThresholds().highEmptyRowRate;
  if (emptyRate > threshold) {
    return { needsReview: true, emptyRate };
  }
  return { needsReview: false };
};

/**
 * Check if no timestamp/date field was detected in the schema.
 * Returns true if review is needed.
 */
export const shouldReviewNoTimestamp = (
  fieldMappings: { timestampPath?: string | null },
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean } => {
  if (reviewChecks?.skipTimestampCheck) return { needsReview: false };
  return { needsReview: !fieldMappings.timestampPath };
};

/**
 * Check if no location/address/coordinate fields were detected in the schema.
 * Returns true if review is needed.
 */
export const shouldReviewNoLocation = (
  fieldMappings: { latitudePath?: string | null; longitudePath?: string | null; locationPath?: string | null },
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean } => {
  if (reviewChecks?.skipLocationCheck) return { needsReview: false };

  const hasCoordinates = Boolean(fieldMappings.latitudePath && fieldMappings.longitudePath);
  const hasLocation = Boolean(fieldMappings.locationPath);
  return { needsReview: !hasCoordinates && !hasLocation };
};

/**
 * Get the resume point for a given review reason.
 */
export const getResumePointForReason = (reason: string | null | undefined): string => {
  if (!reason) return "create-schema-version"; // default (backward compat with schema-drift)
  return REVIEW_RESUME_POINTS[reason] ?? "create-schema-version";
};
