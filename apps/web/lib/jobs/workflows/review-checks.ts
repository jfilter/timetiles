/**
 * Review check functions for the ingest pipeline.
 *
 * These checks run between pipeline tasks and can pause processing
 * by setting the IngestJob to NEEDS_REVIEW with a specific reason.
 * The user (or admin) reviews the issue and decides how to proceed.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";

/** Review reasons — extensible enum for different pause conditions. */
export const REVIEW_REASONS = {
  SCHEMA_DRIFT: "schema-drift",
  QUOTA_EXCEEDED: "quota-exceeded",
  HIGH_DUPLICATE_RATE: "high-duplicates",
  GEOCODING_PARTIAL: "geocoding-partial",
} as const;

/** Maps review reason → resume point for the ingest-process workflow. */
export const REVIEW_RESUME_POINTS: Record<string, string> = {
  [REVIEW_REASONS.SCHEMA_DRIFT]: "create-schema-version",
  [REVIEW_REASONS.QUOTA_EXCEEDED]: "detect-schema",
  [REVIEW_REASONS.HIGH_DUPLICATE_RATE]: "detect-schema",
  [REVIEW_REASONS.GEOCODING_PARTIAL]: "create-events",
};

/** Thresholds for review checks (hardcoded for MVP, configurable later). */
const THRESHOLDS = { HIGH_DUPLICATE_RATE: 0.8, GEOCODING_PARTIAL_FAILURE_RATE: 0.5 };

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
    context: { skipStageTransition: true },
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
  uniqueRows: number
): { needsReview: boolean; duplicateRate?: number } => {
  if (totalRows <= 0 || uniqueRows <= 0) return { needsReview: false };

  const duplicateRate = 1 - uniqueRows / totalRows;
  if (duplicateRate > THRESHOLDS.HIGH_DUPLICATE_RATE) {
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
  failed: number
): { needsReview: boolean; failRate?: number } => {
  const total = geocoded + failed;
  if (total <= 0 || geocoded <= 0) return { needsReview: false }; // total failure handled separately

  const failRate = failed / total;
  if (failRate > THRESHOLDS.GEOCODING_PARTIAL_FAILURE_RATE) {
    return { needsReview: true, failRate };
  }
  return { needsReview: false };
};

/**
 * Get the resume point for a given review reason.
 */
export const getResumePointForReason = (reason: string | null | undefined): string => {
  if (!reason) return "create-schema-version"; // default (backward compat with schema-drift)
  return REVIEW_RESUME_POINTS[reason] ?? "create-schema-version";
};
