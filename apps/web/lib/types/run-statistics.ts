/**
 * Shared type definitions and pure helper functions for run statistics.
 *
 * Two resource types track run statistics:
 * - Scheduled ingests: strongly typed Payload group with `successfulRuns` + `averageDuration`
 * - Scrapers: JSON field with `successRuns` (no averageDuration)
 *
 * @module
 * @category Types
 */
import type { ScheduledIngest, Scraper } from "@/payload-types";

type RequiredDefined<T> = { [K in keyof T]-?: Exclude<T[K], null | undefined> };

// ---------------------------------------------------------------------------
// Scheduled Ingest Statistics
// ---------------------------------------------------------------------------

/** Statistics shape for scheduled ingests with all numeric fields required. */
export type ScheduledIngestStatistics = RequiredDefined<NonNullable<ScheduledIngest["statistics"]>>;

type ScheduledIngestStatsInput = ScheduledIngest["statistics"] | null | undefined;

/** Safely resolve a ScheduledIngest.statistics value to a typed object. */
export const resolveScheduledIngestStats = (raw: ScheduledIngestStatsInput): ScheduledIngestStatistics => ({
  totalRuns: raw?.totalRuns ?? 0,
  successfulRuns: raw?.successfulRuns ?? 0,
  failedRuns: raw?.failedRuns ?? 0,
  averageDuration: raw?.averageDuration ?? 0,
});

/** Return updated stats after a successful scheduled ingest run. */
export const recordScheduledIngestSuccess = (
  current: ScheduledIngestStatistics,
  durationMs: number
): ScheduledIngestStatistics => {
  const newSuccessful = current.successfulRuns + 1;
  const newAverage = (current.averageDuration * (newSuccessful - 1) + durationMs) / newSuccessful;
  return {
    totalRuns: current.totalRuns + 1,
    successfulRuns: newSuccessful,
    failedRuns: current.failedRuns,
    averageDuration: newAverage,
  };
};

/** Return updated stats after a failed scheduled ingest run. */
export const recordScheduledIngestFailure = (current: ScheduledIngestStatistics): ScheduledIngestStatistics => ({
  ...current,
  totalRuns: current.totalRuns + 1,
  failedRuns: current.failedRuns + 1,
});

// ---------------------------------------------------------------------------
// Scraper Statistics
// ---------------------------------------------------------------------------

/** Statistics shape for scrapers (stored as JSON in the database). Index signature required for Payload JSON field compatibility. */
export type ScraperStatistics = Extract<Scraper["statistics"], Record<string, unknown>> & {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
};

/**
 * Safely parse a Scraper.statistics JSON value into a typed object.
 *
 * The scrapers collection uses `type: "json"`, so Payload types this as
 * `{ [k: string]: unknown } | unknown[] | string | number | boolean | null`.
 * This function normalizes that to a safe ScraperStatistics.
 */
export const resolveScraperStats = (raw: Scraper["statistics"]): ScraperStatistics => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      totalRuns: typeof obj.totalRuns === "number" ? obj.totalRuns : 0,
      successRuns: typeof obj.successRuns === "number" ? obj.successRuns : 0,
      failedRuns: typeof obj.failedRuns === "number" ? obj.failedRuns : 0,
    };
  }
  return { totalRuns: 0, successRuns: 0, failedRuns: 0 };
};

/** Return updated scraper stats after a run completes. */
export const recordScraperRun = (
  current: ScraperStatistics,
  status: "success" | "failed" | "timeout"
): ScraperStatistics => ({
  totalRuns: current.totalRuns + 1,
  successRuns: current.successRuns + (status === "success" ? 1 : 0),
  failedRuns: current.failedRuns + (status !== "success" ? 1 : 0),
});
