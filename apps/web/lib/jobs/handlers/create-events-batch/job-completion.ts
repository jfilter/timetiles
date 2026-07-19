/**
 * Job completion, error handling, and quota helpers for create-events-batch.
 *
 * Handles marking jobs as completed, persisting errors, cleaning up
 * checking event quotas, and cleaning up prior attempts.
 *
 * @module
 * @category Jobs
 */
import { and, eq, gte, inArray } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { getIngestGeocodingResults } from "@/lib/ingest/types/geocoding";
import { createJobLogger, logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { requireRelationId } from "@/lib/utils/relation-id";
import { _events_v, events as eventsTable } from "@/payload-generated-schema";
import type { IngestFile, IngestJob, User } from "@/payload-types";

import { getDuplicateSummary, getNewEventCountForQuota, getUniqueRowsForQuota } from "../../utils/resource-loading";
import { EventSnapshotStore } from "./event-snapshots";
import { normalizeIngestErrorMessage } from "./process-batch";

/** Maximum number of individual errors stored on an import job. */
export const MAX_STORED_ERRORS = 500;

const getEventQuotaOwner = async (
  payload: Payload,
  ingestJobId: string | number
): Promise<{ user: User; userId: string | number } | null> => {
  const ingestJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  if (!ingestJob?.ingestFile) return null;

  const ingestFileId = requireRelationId(ingestJob.ingestFile, "ingestJob.ingestFile");
  const ingestFile = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId });

  if (!ingestFile?.user) return null;

  const userId = requireRelationId(ingestFile.user, "ingestFile.user");
  const user =
    typeof ingestFile.user === "object" ? ingestFile.user : await payload.findByID({ collection: "users", id: userId });

  if (!user) return null;

  return { user, userId };
};

const reconcileReservedEventQuota = async (
  payload: Payload,
  ingestJobId: string | number,
  reservedEvents: number,
  actualEventsCreated: number
): Promise<void> => {
  const owner = await getEventQuotaOwner(payload, ingestJobId);
  if (!owner) return;

  const quotaService = createQuotaService(payload);
  const adjustment = actualEventsCreated - reservedEvents;

  if (adjustment > 0) {
    await quotaService.checkAndIncrementUsage(owner.user, "TOTAL_EVENTS", adjustment);
  } else if (adjustment < 0) {
    await quotaService.decrementUsage(owner.userId, "TOTAL_EVENTS", Math.abs(adjustment));
  }

  createJobLogger(String(ingestJobId), "create-events-batch").info("Event creation tracked for quota", {
    userId: owner.userId,
    eventsCreated: actualEventsCreated,
    reservedEvents,
    ingestJobId,
  });
};

export const releaseReservedEventQuota = async (
  payload: Payload,
  ingestJobId: string | number,
  reservedEvents: number
): Promise<void> => {
  if (reservedEvents <= 0) return;

  const owner = await getEventQuotaOwner(payload, ingestJobId);
  if (!owner) return;

  const quotaService = createQuotaService(payload);
  await quotaService.decrementUsage(owner.userId, "TOTAL_EVENTS", reservedEvents);
};

export const markJobCompleted = async (
  payload: Payload,
  ingestJobId: string | number,
  reservedEventQuota = 0,
  eventsUpdated = 0
): Promise<number> => {
  // Re-query job for current state (errors may have accumulated across batches)
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  // Count events written by this import job (reliable source of truth). This
  // includes in-place updates of existing events, whose `ingestJob` was
  // reassigned to this job.
  const eventsResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { ingestJob: { equals: ingestJobId } },
  });
  const totalEventsWritten = eventsResult.totalDocs;

  // Only newly-created events increase the lifetime TOTAL_EVENTS count. Updates
  // re-touch events that already existed (and were already counted), so subtract
  // them before reconciling the quota — otherwise repeated "update"-strategy
  // re-imports inflate usage without bound.
  const newEventsCreated = Math.max(0, totalEventsWritten - eventsUpdated);

  const { internalCount, externalCount } = getDuplicateSummary(currentJob);
  const duplicatesSkipped = internalCount + externalCount;

  // Store results and mark job as COMPLETED
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      results: {
        totalEvents: totalEventsWritten,
        duplicatesSkipped,
        geocoded: Object.keys(getIngestGeocodingResults(currentJob)).length,
        errors: currentJob.errors?.length ?? 0,
      },
    },
  });

  await reconcileReservedEventQuota(payload, ingestJobId, reservedEventQuota, newEventsCreated);
  return newEventsCreated;
};

export const updateJobErrors = async (
  payload: Payload,
  ingestJobId: string | number,
  storedErrorCount: number,
  errors: Array<{ row: number; error: string }>
): Promise<number> => {
  if (errors.length === 0) return storedErrorCount;

  if (storedErrorCount >= MAX_STORED_ERRORS) {
    logger.debug({ ingestJobId, skipped: errors.length }, "Error details cap reached, skipping storage");
    return storedErrorCount;
  }

  const remaining = MAX_STORED_ERRORS - storedErrorCount;
  // The collection's `errors` array enforces a non-empty `error` text per
  // entry (required: true). Keep stored messages short and sanitized so a
  // giant database wrapper error cannot make the error persistence itself
  // fail and retry forever.
  const errorsToStore = errors
    .slice(0, remaining)
    .map(({ row, error }) => ({ row, error: normalizeIngestErrorMessage(error) }));

  // Re-read current errors from DB to merge correctly
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
  const existingErrors = currentJob.errors ?? [];

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { errors: [...existingErrors, ...errorsToStore] },
  });

  return storedErrorCount + errorsToStore.length;
};

export const checkEventQuotaBeforeProcessing = async (
  payload: Payload,
  ingestFile: IngestFile,
  job: IngestJob
): Promise<number> => {
  if (!ingestFile?.user) {
    return 0;
  }

  const userId = requireRelationId(ingestFile.user, "ingestFile.user");
  const user =
    typeof ingestFile.user === "object" ? ingestFile.user : await payload.findByID({ collection: "users", id: userId });

  if (!user) {
    return 0;
  }

  // Quota phase 2 of 3: re-check per-import quota and atomically reserve
  // TOTAL_EVENTS before the raw Drizzle bulk insert bypasses Payload hooks.
  // See also: phase 1 (gate) in workflows/review-checks.ts, phase 3
  // reconciliation in markJobCompleted.
  const quotaService = createQuotaService(payload);

  // Per-import gate counts every row that will be written, including in-place
  // updates of existing events under the "update" strategy.
  const uniqueRows = getUniqueRowsForQuota(job);

  // Check if this import would exceed the per-import limit
  const quotaCheck = await quotaService.checkQuota(user, "EVENTS_PER_IMPORT", uniqueRows);

  if (!quotaCheck.allowed) {
    throw new Error(
      `Import exceeds maximum events per import (${uniqueRows} > ${quotaCheck.limit}). ` +
        `Please split your data into smaller files.`
    );
  }

  // TOTAL_EVENTS is a lifetime count of events that EXIST — reserve only for
  // newly-created events, never in-place updates. Reserving `uniqueRows` here
  // would over-charge "update"-strategy re-imports that re-process the same rows.
  const newEvents = getNewEventCountForQuota(job);
  if (newEvents <= 0) return 0;

  await quotaService.checkAndIncrementUsage(user, "TOTAL_EVENTS", newEvents);
  return newEvents;
};

/** Delete events and their versions left by a prior failed attempt, in small chunks to avoid table locks. */
export const cleanupPriorAttempt = async (
  payload: Payload,
  ingestJobId: string | number,
  log: ReturnType<typeof createJobLogger>
): Promise<void> => {
  const DELETE_CHUNK_SIZE = 5000;
  const db = payload.db.drizzle;

  // Revert in-place updates from any prior attempt (or this attempt, when called
  // from onFail) to their captured originals FIRST — `cleanupPriorAttempt` only
  // deletes fresh inserts, so without this an "update"-strategy import that
  // failed permanently would leave the pre-existing events it overwrote mutated
  // and their originals lost. No-op when no snapshot sidecar exists.
  const { failures: restoreFailures } = await EventSnapshotStore.restoreAndClear(payload, ingestJobId, log);

  // If any restore failed, the sidecar is kept and some updated event still
  // carries `ingestJob = thisJob` with `created_at >= job.createdAt` — i.e. it
  // looks EXACTLY like a fresh insert to the delete filter below. Deleting now
  // could destroy a concurrently-created foreign event we failed to revert, so
  // skip the delete entirely and let the next attempt / onFail retry the restore
  // first. (An orphaned fresh insert is recoverable; deleting real data is not.)
  if (restoreFailures > 0) {
    log.warn("Skipping prior-attempt insert cleanup until all snapshots restore", { ingestJobId, restoreFailures });
    return;
  }

  // Only delete events this job actually CREATED in a prior attempt — never the
  // pre-existing events it updated in place. Under `duplicateStrategy: "update"`,
  // `tryUpdateExistingEvent` reassigns an existing event's `ingestJob` to this
  // job (so the completion count includes updates), which means a bare
  // `ingestJob = thisJob` delete would wipe real, previously-imported data when
  // a mid-stream failure triggers a retry. Fresh inserts are stamped with
  // `createdAt = now` during create-events (several stages after the job row is
  // created), whereas in-place updates leave `created_at` untouched (Payload
  // only bumps `updated_at`). So `created_at >= job.createdAt` keeps the updated
  // originals and removes only this attempt's inserts. The restore above already
  // reverted (and un-stamped `ingestJob` on) every updated event, so only true
  // fresh inserts remain matching.
  const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
  const jobCreatedAt = typeof job?.createdAt === "string" ? job.createdAt : null;
  if (!jobCreatedAt) {
    // createdAt is always set on a persisted job; if it is somehow missing we
    // cannot safely scope the delete, so skip cleanup rather than risk deleting
    // updated originals. A duplicate-key error on retry is recoverable; data
    // loss is not.
    log.warn("Skipping prior-attempt cleanup: job has no createdAt", { ingestJobId });
    return;
  }
  const ingestJobMatch = and(eq(eventsTable.ingestJob, Number(ingestJobId)), gte(eventsTable.createdAt, jobCreatedAt));

  // Select + delete each chunk inside ONE transaction with `FOR UPDATE`: without
  // the lock a concurrent import could re-claim a selected event (`ingestJob = B`)
  // between the select and the id-based delete, and we'd delete its committed
  // row. The lock blocks that import until we commit, so every row we delete
  // still matches the ownership predicate.
  let deletedTotal = 0;
  let deletedThisChunk: number;
  do {
    deletedThisChunk = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(ingestJobMatch)
        .limit(DELETE_CHUNK_SIZE)
        .for("update");
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return 0;
      // Delete versions first (FK references events.id), then the events.
      await tx.delete(_events_v).where(inArray(_events_v.parent, ids));
      await tx.delete(eventsTable).where(inArray(eventsTable.id, ids));
      return ids.length;
    });
    deletedTotal += deletedThisChunk;
  } while (deletedThisChunk >= DELETE_CHUNK_SIZE);

  if (deletedTotal > 0) {
    log.info("Cleaned up events from prior attempt", { ingestJobId, deletedTotal });
  }
};
