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
import { z } from "zod";

import { getAppConfig } from "@/lib/config/app-config";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { PER_SHEET_REVIEW_CHECKS_KEY } from "@/lib/constants/review-reasons";
import { logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";

/**
 * Zod schema for per-source review check overrides.
 *
 * User-supplied config from `ingestFile.processingOptions.reviewChecks` is
 * untyped JSON; parse it through this schema so malformed shapes fall back to
 * defaults with a logged warning instead of silently type-punning into the
 * wrong field.
 */
export const ReviewChecksConfigSchema = z
  .object({
    skipTimestampCheck: z.boolean().optional(),
    skipLocationCheck: z.boolean().optional(),
    skipEmptyRowCheck: z.boolean().optional(),
    skipRowErrorCheck: z.boolean().optional(),
    skipDuplicateRateCheck: z.boolean().optional(),
    skipGeocodingCheck: z.boolean().optional(),
    skipAmbiguousCoordinateCheck: z.boolean().optional(),
    skipAmbiguousDateCheck: z.boolean().optional(),
    emptyRowThreshold: z.number().min(0).max(1).nullable().optional(),
    rowErrorThreshold: z.number().min(0).max(1).nullable().optional(),
    duplicateRateThreshold: z.number().min(0).max(1).nullable().optional(),
    geocodingFailureThreshold: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

/** Per-source review check overrides (stored in processingOptions.reviewChecks). */
export type ReviewChecksConfig = z.infer<typeof ReviewChecksConfigSchema>;

/**
 * Extract the file-level review checks (everything except the `perSheet`
 * namespace) and the raw `perSheet` map from the stored JSON.
 */
const splitReviewChecks = (raw: unknown): { fileLevel: unknown; perSheet: Record<string, unknown> } => {
  if (raw == null || typeof raw !== "object") return { fileLevel: raw, perSheet: {} };

  const { [PER_SHEET_REVIEW_CHECKS_KEY]: perSheetRaw, ...fileLevel } = raw as Record<string, unknown>;
  const perSheet =
    perSheetRaw != null && typeof perSheetRaw === "object" ? (perSheetRaw as Record<string, unknown>) : {};

  return { fileLevel, perSheet };
};

/**
 * Safely parse raw reviewChecks JSON from processingOptions.
 *
 * Returns `{ config, error }` where `error` is a user-presentable message if
 * parsing failed (for storage on `job.errors`). Unknown input shapes produce a
 * single warning + undefined config — defaults apply downstream.
 *
 * When `sheetIndex` is provided, per-sheet approval skip flags stored under the
 * `perSheet` namespace are merged on top of the file-level config so that an
 * approval for one sheet only affects that sheet. File-level flags (set
 * intentionally by scheduled-ingests / scrapers / data-packages) still apply to
 * every sheet.
 */
export const parseReviewChecksConfig = (
  raw: unknown,
  sheetIndex?: number | null
): { config: ReviewChecksConfig | undefined; error?: string } => {
  if (raw == null) return { config: undefined };

  const { fileLevel, perSheet } = splitReviewChecks(raw);

  const sheetOverride =
    sheetIndex != null && perSheet[String(sheetIndex)] != null ? perSheet[String(sheetIndex)] : undefined;

  // Merge file-level config with this sheet's approval flags. The sheet override
  // can only ever ADD skip flags (approvals), so a shallow merge is sufficient.
  const merged =
    sheetOverride != null && typeof fileLevel === "object" && fileLevel != null
      ? { ...(fileLevel as Record<string, unknown>), ...(sheetOverride as Record<string, unknown>) }
      : (sheetOverride ?? fileLevel);

  const result = ReviewChecksConfigSchema.safeParse(merged);
  if (result.success) return { config: result.data };

  const message = `Invalid reviewChecks override: ${result.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ")}`;
  logger.warn({ issue: result.error.issues }, "Invalid reviewChecks override — falling back to defaults");
  return { config: undefined, error: message };
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
    data: { stage: PROCESSING_STAGE.NEEDS_REVIEW, reviewReason: reason, reviewDetails: details },
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

  // Quota phase 1 of 3: approximate gate before user sees the review screen.
  // See also: phase 2 (re-check) and phase 3 (increment) in create-events-batch/job-completion.ts.
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
  fieldMappings: {
    latitudePath?: string | null;
    longitudePath?: string | null;
    coordinatePath?: string | null;
    locationPath?: string | null;
    locationNamePath?: string | null;
  },
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean } => {
  if (reviewChecks?.skipLocationCheck) return { needsReview: false };

  // A single combined-coordinate column (e.g. "40.7,-74.0") is a valid coordinate
  // source, so it counts the same as separate lat/lng paths.
  const hasCoordinates =
    Boolean(fieldMappings.latitudePath && fieldMappings.longitudePath) || Boolean(fieldMappings.coordinatePath);
  // Payload fields are `string | null | undefined`; `??` correctly treats empty strings as
  // "present" (falsy-but-set should not trigger the fallback) while `||` would incorrectly
  // fall through on `""`.
  const hasLocation = Boolean(fieldMappings.locationPath ?? fieldMappings.locationNamePath);
  return { needsReview: !hasCoordinates && !hasLocation };
};

/**
 * Check if a single combined-coordinate column was detected but its axis order
 * is ambiguous (every sample fit both "lat,lng" and "lng,lat"). The order is a
 * per-column decision the data cannot settle, so we must ask rather than guess —
 * a wrong guess renders points on the wrong continent. Returns true when a
 * combined column exists with `coordinateFormat === "ambiguous"` and the check
 * is not skipped. Separate lat/lng columns and explicit-order combined columns
 * never trigger this.
 */
export const shouldReviewAmbiguousCoordinates = (
  fieldMappings: { coordinatePath?: string | null; coordinateFormat?: string | null },
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean } => {
  if (reviewChecks?.skipAmbiguousCoordinateCheck) return { needsReview: false };
  return { needsReview: Boolean(fieldMappings.coordinatePath) && fieldMappings.coordinateFormat === "ambiguous" };
};

/**
 * Check if a timestamp column was detected but its day/month order is ambiguous
 * (every sample fit both D/M and M/D — typical when all parts are ≤ 12). The
 * order is a per-column decision the data cannot settle, so we must ask rather
 * than guess — a wrong guess silently maps `01/02` to the wrong month for every
 * such row. Returns true when a timestamp column exists with
 * `timestampOrder === "ambiguous"` and the check is not skipped. Explicit-order
 * (D/M | M/D) and ISO-only columns never trigger this.
 */
export const shouldReviewAmbiguousDateOrder = (
  fieldMappings: { timestampPath?: string | null; timestampOrder?: string | null },
  reviewChecks?: ReviewChecksConfig
): { needsReview: boolean } => {
  if (reviewChecks?.skipAmbiguousDateCheck) return { needsReview: false };
  return { needsReview: Boolean(fieldMappings.timestampPath) && fieldMappings.timestampOrder === "ambiguous" };
};

export { REVIEW_REASONS } from "@/lib/constants/review-reasons";
