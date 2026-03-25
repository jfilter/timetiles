/**
 * Job completion, error handling, and quota helpers for create-events-batch.
 *
 * Handles marking jobs as completed, persisting errors, cleaning up
 * sidecar files, checking event quotas, and cleaning up prior attempts.
 *
 * @module
 * @category Jobs
 */
import { eq, inArray } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles } from "@/lib/ingest/file-readers";
import { createJobLogger, logError, logger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { getImportGeocodingResults } from "@/lib/types/geocoding";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import { _events_v, events as eventsTable } from "@/payload-generated-schema";
import type { IngestFile, IngestJob } from "@/payload-types";

/** Maximum number of individual errors stored on an import job. */
export const MAX_STORED_ERRORS = 500;

export const markJobCompleted = async (
  payload: Payload,
  ingestJobId: string | number,
  filePath: string,
  sheetIndex: number
) => {
  // Re-query job for current state (errors may have accumulated across batches)
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  // Count actual events created for this import job (reliable source of truth)
  const eventsResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { ingestJob: { equals: ingestJobId } },
  });
  const totalEventsCreated = eventsResult.totalDocs;

  const duplicatesSkipped =
    (currentJob.duplicates?.summary?.internalDuplicates ?? 0) +
    (currentJob.duplicates?.summary?.externalDuplicates ?? 0);

  // Store results and mark job as COMPLETED
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      results: {
        totalEvents: totalEventsCreated,
        duplicatesSkipped,
        geocoded: Object.keys(getImportGeocodingResults(currentJob)).length,
        errors: currentJob.errors?.length ?? 0,
      },
    },
  });

  // Clean up sidecar CSV files
  cleanupSidecarFiles(filePath, sheetIndex);

  // Quota phase 3 of 3: authoritative usage tracking after events are created.
  // See also: phase 1 (gate) in workflows/review-checks.ts, phase 2 (re-check) below in checkEventQuotaBeforeProcessing.
  try {
    const ingestJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

    if (ingestJob?.ingestFile) {
      const ingestFileId = requireRelationId(ingestJob.ingestFile, "ingestJob.ingestFile");
      const ingestFile = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId });

      if (ingestFile?.user) {
        const log = createJobLogger(String(ingestJobId), "create-events-batch");

        const userId = extractRelationId(ingestFile.user);

        const quotaService = createQuotaService(payload);
        await quotaService.incrementUsage(userId, "TOTAL_EVENTS", totalEventsCreated);

        log.info("Event creation tracked for quota", { userId, eventsCreated: totalEventsCreated, ingestJobId });
      }
    }
  } catch (error) {
    // Don't fail the job if quota tracking fails
    logError(error, "Failed to track event creation quota", { ingestJobId });
  }
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
  const errorsToStore = errors.slice(0, remaining);

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
): Promise<void> => {
  if (!ingestFile?.user) {
    return;
  }

  const userId = requireRelationId(ingestFile.user, "ingestFile.user");
  const user =
    typeof ingestFile.user === "object" ? ingestFile.user : await payload.findByID({ collection: "users", id: userId });

  if (!user) {
    return;
  }

  // Quota phase 2 of 3: re-check before processing (TOCTOU mitigation).
  // See also: phase 1 (gate) in workflows/review-checks.ts, phase 3 (increment) above in markJobCompleted.
  const quotaService = createQuotaService(payload);

  // Use uniqueRows from deduplication summary -- this is the actual number of events
  // that will be created, not the total file rows (which includes duplicates).
  const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;

  // Check if this import would exceed the per-import limit
  const quotaCheck = await quotaService.checkQuota(user, "EVENTS_PER_IMPORT", uniqueRows);

  if (!quotaCheck.allowed) {
    throw new Error(
      `Import exceeds maximum events per import (${uniqueRows} > ${quotaCheck.limit}). ` +
        `Please split your data into smaller files.`
    );
  }
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
