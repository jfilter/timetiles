/**
 * Job completion, error handling, and quota helpers for create-events-batch.
 *
 * Handles marking jobs as completed, persisting errors, cleaning up
 * checking event quotas, and cleaning up prior attempts.
 *
 * @module
 * @category Jobs
 */
import { eq, inArray } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { getIngestGeocodingResults } from "@/lib/ingest/types/geocoding";
import { createJobLogger, logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { requireRelationId } from "@/lib/utils/relation-id";
import { _events_v, events as eventsTable } from "@/payload-generated-schema";
import type { IngestFile, IngestJob, User } from "@/payload-types";

import { getDuplicateSummary, getUniqueRowsForQuota } from "../../utils/resource-loading";
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

export const markJobCompleted = async (payload: Payload, ingestJobId: string | number, reservedEventQuota = 0) => {
  // Re-query job for current state (errors may have accumulated across batches)
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  // Count actual events created for this import job (reliable source of truth)
  const eventsResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { ingestJob: { equals: ingestJobId } },
  });
  const totalEventsCreated = eventsResult.totalDocs;

  const { internalCount, externalCount } = getDuplicateSummary(currentJob);
  const duplicatesSkipped = internalCount + externalCount;

  // Store results and mark job as COMPLETED
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      results: {
        totalEvents: totalEventsCreated,
        duplicatesSkipped,
        geocoded: Object.keys(getIngestGeocodingResults(currentJob)).length,
        errors: currentJob.errors?.length ?? 0,
      },
    },
  });

  await reconcileReservedEventQuota(payload, ingestJobId, reservedEventQuota, totalEventsCreated);
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

  // Use uniqueRows from deduplication summary -- this is the actual number of events
  // that will be created, not the total file rows (which includes duplicates).
  const uniqueRows = getUniqueRowsForQuota(job);

  // Check if this import would exceed the per-import limit
  const quotaCheck = await quotaService.checkQuota(user, "EVENTS_PER_IMPORT", uniqueRows);

  if (!quotaCheck.allowed) {
    throw new Error(
      `Import exceeds maximum events per import (${uniqueRows} > ${quotaCheck.limit}). ` +
        `Please split your data into smaller files.`
    );
  }

  if (uniqueRows <= 0) return 0;

  await quotaService.checkAndIncrementUsage(user, "TOTAL_EVENTS", uniqueRows);
  return uniqueRows;
};

/** Delete events and their versions left by a prior failed attempt, in small chunks to avoid table locks. */
export const cleanupPriorAttempt = async (
  payload: Payload,
  ingestJobId: string | number,
  log: ReturnType<typeof createJobLogger>
): Promise<void> => {
  const DELETE_CHUNK_SIZE = 5000;
  const db = payload.db.drizzle;

  // Gather IDs of events to delete, then remove versions + events in chunks
  let deletedTotal = 0;
  let idsToDelete: number[];
  do {
    const rows = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.ingestJob, Number(ingestJobId)))
      .limit(DELETE_CHUNK_SIZE);
    idsToDelete = rows.map((r) => r.id);

    if (idsToDelete.length > 0) {
      // Delete versions first (FK references events.id)
      await db.delete(_events_v).where(inArray(_events_v.parent, idsToDelete));
      // Then events
      await db.delete(eventsTable).where(inArray(eventsTable.id, idsToDelete));
      deletedTotal += idsToDelete.length;
    }
  } while (idsToDelete.length >= DELETE_CHUNK_SIZE);

  if (deletedTotal > 0) {
    log.info("Cleaned up events from prior attempt", { ingestJobId, deletedTotal });
  }
};
