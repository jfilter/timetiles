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
import type { AmbiguityResolution } from "@/lib/ingest/types/interpretation";
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
 * Check if this import would exceed the user's quota.
 *
 * `uniqueRows` is the strategy-adjusted processing volume (gates EVENTS_PER_IMPORT);
 * `newEventCount` is the number of events the import will NEWLY create (gates the
 * lifetime TOTAL_EVENTS counter). Under the "update" strategy these differ:
 * re-importing unchanged rows updates existing events (newEventCount = 0) but still
 * processes `uniqueRows`. Charging updates against TOTAL_EVENTS would falsely trip
 * QUOTA_EXCEEDED on every scheduled re-import — so the lifetime gate uses
 * `newEventCount`, matching the phase-3 reservation (getNewEventCountForQuota).
 *
 * Returns `{ allowed: true }` or `{ allowed: false, ...details }`.
 */
export const checkQuotaForSheet = async (
  payload: Payload,
  ingestJobId: string | number,
  uniqueRows: number,
  newEventCount: number
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

  // Check total (lifetime) events quota against NEWLY created events only —
  // updates of existing events do not increase the total.
  const totalCheck = await quotaService.checkQuota(user, "TOTAL_EVENTS", newEventCount);
  if (!totalCheck.allowed) {
    return {
      allowed: false,
      current: totalCheck.current ?? 0,
      limit: totalCheck.limit ?? 0,
      estimatedNew: newEventCount,
      reason: `Creating ${newEventCount} events would exceed your total events limit (${totalCheck.current}/${totalCheck.limit}).`,
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
 * The sentinel `*Order`/`*Format` value the schema detector writes when a
 * per-column interpretation choice (combined-coordinate axis order, date
 * day/month order) could not be settled from the samples.
 */
const AMBIGUOUS_INTERPRETATION_VALUE = "ambiguous";

/**
 * Shared shape for every "a column was detected but its interpretation order is
 * ambiguous" review gate. Each descriptor pairs the detected path field with the
 * order/format field that carries the ambiguous sentinel and the skip flag that
 * suppresses it. Adding a future ambiguous-order dimension is one new entry here.
 *
 * `reason` / `message` / `samplePredicate` are consumed by the schema-detection
 * job when it builds the NEEDS_REVIEW details; they live alongside the gate so a
 * new dimension is described in exactly one place.
 */
export interface AmbiguousInterpretationCheck {
  /** fieldMappings key holding the detected column path (e.g. "coordinatePath"). */
  pathKey: "coordinatePath" | "timestampPath" | "endTimestampPath";
  /** fieldMappings key holding the order/format value (e.g. "coordinateFormat"). */
  orderKey: "coordinateFormat" | "timestampOrder" | "endTimestampOrder";
  /** reviewChecks flag that suppresses this gate. */
  skipFlag: "skipAmbiguousCoordinateCheck" | "skipAmbiguousDateCheck";
  /** Review reason key used when the gate fires. */
  reason: "AMBIGUOUS_COORDINATE_ORDER" | "AMBIGUOUS_DATE_ORDER";
  /** User-facing message stored on the review details. */
  message: string;
  /** Optional filter narrowing which sample value is shown to the user. */
  samplePredicate?: (sample: string) => boolean;
}

/**
 * Ambiguous-order review gates, in evaluation order (coordinate axis order, then
 * date day/month order). The single source of truth for both the public wrappers
 * below and the schema-detection job's review loop.
 */
export const AMBIGUOUS_INTERPRETATION_CHECKS: readonly AmbiguousInterpretationCheck[] = [
  {
    pathKey: "coordinatePath",
    orderKey: "coordinateFormat",
    skipFlag: "skipAmbiguousCoordinateCheck",
    reason: "AMBIGUOUS_COORDINATE_ORDER",
    message:
      "A single column holds both coordinates, but their order (latitude,longitude vs longitude,latitude) could not be determined. Please confirm the order.",
    // A combined-coordinate cell is a "lat,lng" string, so only comma-bearing
    // samples are useful examples.
    samplePredicate: (s) => s.includes(","),
  },
  {
    pathKey: "timestampPath",
    orderKey: "timestampOrder",
    skipFlag: "skipAmbiguousDateCheck",
    reason: "AMBIGUOUS_DATE_ORDER",
    message:
      "A date column was detected, but its order (day/month vs month/day) could not be determined. Please confirm the order.",
  },
  // End-date dimension. Reuses the AMBIGUOUS_DATE_ORDER reason + skipAmbiguousDateCheck
  // flag; it is distinguished downstream by `reviewDetails.endTimestampPath` (the
  // start-date entry stores `reviewDetails.timestampPath`). Evaluated after the start
  // timestamp entry, so a file ambiguous on both pauses on the start date first, then
  // on the end date after the resume — one decision per resume.
  {
    pathKey: "endTimestampPath",
    orderKey: "endTimestampOrder",
    skipFlag: "skipAmbiguousDateCheck",
    reason: "AMBIGUOUS_DATE_ORDER",
    message:
      "An end-date column was detected, but its order (day/month vs month/day) could not be determined. Please confirm the order.",
  },
];

/**
 * Shared driver for the ambiguous-interpretation gates. Fires when the detected
 * path is set, its order/format carries the `ambiguous` sentinel, and the check
 * is not skipped. The order is a per-column decision the data cannot settle, so
 * by default (`strict`) we ask rather than guess — a wrong guess silently
 * corrupts every affected row.
 *
 * `ambiguityResolution` is the dataset-wide sticky policy (ADR 0040). Under
 * `best-effort` the gate is suppressed and the pipeline does its best per row:
 * dates fall back to the parser's per-row day/month heuristic
 * (`inferDayMonthOrder`); combined coordinates stay strict (no per-row guess —
 * a wrong axis order lands points on the wrong continent) and fall through to
 * geocoding. This is the opt-in escape from the `strict` default. When omitted
 * it defaults to `strict` so the safe (ask-don't-guess) behavior holds for any
 * caller that doesn't supply it.
 *
 * `check.skipFlag` (e.g. `skipAmbiguousDateCheck`) is a SEPARATE, narrower escape
 * hatch and must not be confused with `best-effort`. It is a TRANSIENT, per-import
 * approval that suppresses this one gate for one run while the dataset's policy
 * stays `strict` — set by the unattended paths (url-fetch-job/index.ts and
 * scraper-execution/auto-import.ts via reviewChecks) so a scheduled/scraped import
 * does not stall waiting for a human. It deliberately trades strict's
 * no-undecided-order guarantee for unattended throughput: with the gate skipped,
 * an undecided date column reaches `extractTimestamp` with order=undefined and the
 * parser per-row-guesses via `inferDayMonthOrder` (see the STRICT-BY-GATE note in
 * event-creation-helpers.ts). That is intentional, not a leak — distinct from the
 * persistent per-dataset `best-effort` policy, which makes the same per-row
 * guessing sticky and explicit rather than a one-off approval side effect.
 *
 * Used by the public wrappers below and by the schema-detection job's review loop
 * (driven by {@link AMBIGUOUS_INTERPRETATION_CHECKS}).
 */
export const shouldReviewAmbiguousInterpretation = (
  fieldMappings: Partial<
    Record<AmbiguousInterpretationCheck["pathKey"] | AmbiguousInterpretationCheck["orderKey"], string | null>
  >,
  check: Pick<AmbiguousInterpretationCheck, "pathKey" | "orderKey" | "skipFlag">,
  reviewChecks?: ReviewChecksConfig,
  ambiguityResolution: AmbiguityResolution = "strict"
): { needsReview: boolean } => {
  if (ambiguityResolution === "best-effort") return { needsReview: false };
  if (reviewChecks?.[check.skipFlag]) return { needsReview: false };
  return {
    needsReview:
      Boolean(fieldMappings[check.pathKey]) && fieldMappings[check.orderKey] === AMBIGUOUS_INTERPRETATION_VALUE,
  };
};

/**
 * Check if a single combined-coordinate column was detected but its axis order
 * is ambiguous (every sample fit both "lat,lng" and "lng,lat"). The order is a
 * per-column decision the data cannot settle, so we must ask rather than guess —
 * a wrong guess renders points on the wrong continent. Returns true when a
 * combined column exists with `coordinateFormat === "ambiguous"` and the check
 * is not skipped. Separate lat/lng columns and explicit-order combined columns
 * never trigger this.
 *
 * Thin wrapper over {@link shouldReviewAmbiguousInterpretation}; see
 * {@link AMBIGUOUS_INTERPRETATION_CHECKS} for the shared shape.
 */
export const shouldReviewAmbiguousCoordinates = (
  fieldMappings: { coordinatePath?: string | null; coordinateFormat?: string | null },
  reviewChecks?: ReviewChecksConfig,
  ambiguityResolution: AmbiguityResolution = "strict"
): { needsReview: boolean } =>
  shouldReviewAmbiguousInterpretation(
    fieldMappings,
    { pathKey: "coordinatePath", orderKey: "coordinateFormat", skipFlag: "skipAmbiguousCoordinateCheck" },
    reviewChecks,
    ambiguityResolution
  );

/**
 * Check if a timestamp column was detected but its day/month order is ambiguous
 * (every sample fit both D/M and M/D — typical when all parts are ≤ 12). The
 * order is a per-column decision the data cannot settle, so we must ask rather
 * than guess — a wrong guess silently maps `01/02` to the wrong month for every
 * such row. Returns true when a timestamp column exists with
 * `timestampOrder === "ambiguous"` and the check is not skipped. Explicit-order
 * (D/M | M/D) and ISO-only columns never trigger this.
 *
 * Thin wrapper over {@link shouldReviewAmbiguousInterpretation}; see
 * {@link AMBIGUOUS_INTERPRETATION_CHECKS} for the shared shape.
 */
export const shouldReviewAmbiguousDateOrder = (
  fieldMappings: { timestampPath?: string | null; timestampOrder?: string | null },
  reviewChecks?: ReviewChecksConfig,
  ambiguityResolution: AmbiguityResolution = "strict"
): { needsReview: boolean } =>
  shouldReviewAmbiguousInterpretation(
    fieldMappings,
    { pathKey: "timestampPath", orderKey: "timestampOrder", skipFlag: "skipAmbiguousDateCheck" },
    reviewChecks,
    ambiguityResolution
  );

export { REVIEW_REASONS } from "@/lib/constants/review-reasons";
