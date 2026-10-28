/**
 * Event quota of one ingest job: the counts it charges and the check against a user's limits.
 *
 * Shared by the review gate before an import runs, the approval of a quota review, and the
 * re-check before events are written, so all three agree on what the import costs.
 *
 * @module
 * @category Ingest
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { createQuotaService } from "@/lib/services/quota-service";
import { isRecord } from "@/lib/utils/is-record";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { IngestJob, User } from "@/payload-types";

/** Valid `duplicateStrategy` values for external duplicate handling. */
type DuplicateStrategy = "skip" | "update";

/**
 * The duplicate strategy from a job's `configSnapshot`; `"skip"` when the field is missing,
 * null or of an unexpected type.
 */
export const readDuplicateStrategy = (job: Pick<IngestJob, "configSnapshot">): DuplicateStrategy => {
  const snapshot = isRecord(job.configSnapshot) ? job.configSnapshot : null;
  const idStrategy = snapshot && isRecord(snapshot.idStrategy) ? snapshot.idStrategy : null;
  return idStrategy?.duplicateStrategy === "update" ? "update" : "skip";
};

/**
 * UI + progress display: per-type duplicate counts.
 *
 * Reads from `job.duplicates.summary` as persisted by analyze-duplicates-job.
 * All fields default to `0` when the summary is absent so callers can rely
 * on stable shapes without optional chaining.
 */
export const getDuplicateSummary = (
  job: IngestJob
): { totalRows: number; uniqueRows: number; internalCount: number; externalCount: number } => {
  const summary = job.duplicates?.summary;
  return {
    totalRows: summary?.totalRows ?? 0,
    uniqueRows: summary?.uniqueRows ?? 0,
    internalCount: summary?.internalDuplicates ?? 0,
    externalCount: summary?.externalDuplicates ?? 0,
  };
};

/**
 * Quota + progress gates: post-dedup, strategy-adjusted event count.
 *
 * Reads `job.duplicates.summary.uniqueRows` as written by
 * analyze-duplicates-job, which already applies the duplicate strategy when
 * computing this number. Use this for any "how many events will we actually
 * create?" decision.
 */
export const getUniqueRowsForQuota = (job: IngestJob): number => {
  return job.duplicates?.summary?.uniqueRows ?? 0;
};

/**
 * Lifetime TOTAL_EVENTS quota: the number of events this import will NEWLY
 * CREATE (never updates of existing events).
 *
 * Under the `"update"` strategy, {@link getUniqueRowsForQuota} includes external
 * duplicates — they are written as in-place updates and must count toward
 * progress and the per-import gate. But updates do NOT create new events, so
 * charging them against the lifetime counter would inflate usage on every
 * scheduled re-import. Subtract the to-be-updated externals so only genuinely
 * new events are counted. Under `"skip"`/`"disabled"`, `uniqueRows` already
 * excludes externals, so no adjustment is needed.
 */
export const getNewEventCountForQuota = (job: IngestJob): number => {
  const { uniqueRows, externalCount } = getDuplicateSummary(job);
  const willUpdateExternals = readDuplicateStrategy(job) === "update";
  return Math.max(0, willUpdateExternals ? uniqueRows - externalCount : uniqueRows);
};

export type ImportQuotaCheck =
  | { allowed: true }
  | { allowed: false; current: number; limit: number; estimatedNew: number; reason: string };

/**
 * Check an import against the user's EVENTS_PER_IMPORT limit (`uniqueRows`, every row written)
 * and TOTAL_EVENTS limit (`newEventCount`, only newly created events). Does not charge usage, and
 * skips TOTAL_EVENTS for an import that creates nothing, as event creation does.
 */
export const checkImportQuota = async (
  payload: Payload,
  user: User,
  uniqueRows: number,
  newEventCount: number
): Promise<ImportQuotaCheck> => {
  const quotaService = createQuotaService(payload);

  const perImportCheck = await quotaService.checkQuota(user, "EVENTS_PER_IMPORT", uniqueRows);
  if (!perImportCheck.allowed) {
    return {
      allowed: false,
      current: perImportCheck.current,
      limit: perImportCheck.limit,
      estimatedNew: uniqueRows,
      reason: `This import would create ${uniqueRows} events, exceeding your limit of ${perImportCheck.limit} events per import.`,
    };
  }

  if (newEventCount <= 0) return { allowed: true };

  const totalCheck = await quotaService.checkQuota(user, "TOTAL_EVENTS", newEventCount);
  if (!totalCheck.allowed) {
    return {
      allowed: false,
      current: totalCheck.current,
      limit: totalCheck.limit,
      estimatedNew: newEventCount,
      reason: `Creating ${newEventCount} events would exceed your total events limit (${totalCheck.current}/${totalCheck.limit}).`,
    };
  }

  return { allowed: true };
};

/** {@link checkImportQuota} for a job, against the owner of its ingest file; files without one pass. */
export const checkJobQuota = async (
  payload: Payload,
  job: IngestJob,
  req?: PayloadRequest
): Promise<ImportQuotaCheck> => {
  const ingestFile = await payload.findByID({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: requireRelationId(job.ingestFile, "ingestJob.ingestFile"),
    depth: 0,
    req,
  });
  if (!ingestFile.user) return { allowed: true };
  const user = await payload.findByID({
    collection: COLLECTION_NAMES.USERS,
    id: requireRelationId(ingestFile.user, "ingestFile.user"),
    depth: 0,
    req,
  });
  return checkImportQuota(payload, user, getUniqueRowsForQuota(job), getNewEventCountForQuota(job));
};

/** Message for approving a quota review the owner's limit still blocks. */
export const quotaApprovalBlockedMessage = (reason: string): string =>
  `Raise the user's event limit before approving this import. ${reason}`;
