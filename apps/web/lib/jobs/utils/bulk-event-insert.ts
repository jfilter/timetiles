/**
 * Bulk INSERT utility for event creation during imports.
 *
 * Uses Drizzle's typed table API (`payload-generated-schema`) to insert
 * events directly into PostgreSQL, bypassing Payload hooks for throughput.
 * Also populates the `_events_v` versions table to keep Payload's
 * draft/publish system consistent.
 *
 * Only used by the import pipeline where hooks are redundant (quota and
 * access fields are handled at the job level).
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { _events_v, events } from "@/payload-generated-schema";

const logger = createLogger("bulk-event-insert");

/**
 * Shape of a single event to be bulk-inserted.
 *
 * Maps 1:1 to the output of {@link createEventData} plus the denormalized
 * access fields that the import job pre-computes once.
 */
export interface BulkEventData {
  dataset: number;
  ingestJob?: number;
  /** May be `undefined` when sourceData matches transformedData (dedup optimization). */
  sourceData?: Record<string, unknown>;
  transformedData: Record<string, unknown>;
  uniqueId: string;
  eventTimestamp: string | null;
  eventEndTimestamp?: string | null;
  location?: { latitude: number; longitude: number };
  locationName?: string | null;
  coordinateSource: { type: string; confidence?: number; normalizedAddress?: string };
  validationStatus: string;
  transformations?: unknown;
  schemaVersionNumber?: number;
  contentHash?: string;
  datasetIsPublic?: boolean;
  catalogOwnerId?: number;
}

/**
 * Drizzle's typed insert handles parameterisation automatically.
 * 250 rows per batch keeps us well under PostgreSQL's 65535 param limit.
 */
const BATCH_SIZE = 250;

/** Map a BulkEventData into the shape Drizzle expects for the events table. */
const toEventsRow = (event: BulkEventData, now: string): typeof events.$inferInsert => ({
  dataset: event.dataset,
  ingestJob: event.ingestJob ?? null,
  sourceData: event.sourceData ?? null,
  transformedData: event.transformedData,
  uniqueId: event.uniqueId,
  eventTimestamp: event.eventTimestamp,
  eventEndTimestamp: event.eventEndTimestamp ?? null,
  location_latitude: event.location?.latitude ?? null,
  location_longitude: event.location?.longitude ?? null,
  locationName: event.locationName ?? null,
  coordinateSource_type: event.coordinateSource.type as typeof events.$inferInsert.coordinateSource_type,
  coordinateSource_confidence: event.coordinateSource.confidence ?? null,
  coordinateSource_normalizedAddress: event.coordinateSource.normalizedAddress ?? null,
  validationStatus: event.validationStatus as typeof events.$inferInsert.validationStatus,
  transformations: event.transformations ?? null,
  schemaVersionNumber: event.schemaVersionNumber ?? null,
  contentHash: event.contentHash ?? null,
  datasetIsPublic: event.datasetIsPublic ?? false,
  catalogOwnerId: event.catalogOwnerId ?? null,
  _status: "published" as const,
  updatedAt: now,
  createdAt: now,
});

/** Map event data + parent id into the shape for the _events_v table. */
const toVersionRow = (parentId: number, event: BulkEventData, now: string): typeof _events_v.$inferInsert => ({
  parent: parentId,
  version_dataset: event.dataset,
  version_datasetIsPublic: event.datasetIsPublic ?? false,
  version_catalogOwnerId: event.catalogOwnerId ?? null,
  version_ingestJob: event.ingestJob ?? null,
  version_sourceData: event.sourceData ?? null,
  version_transformedData: event.transformedData,
  version_location_latitude: event.location?.latitude ?? null,
  version_location_longitude: event.location?.longitude ?? null,
  version_coordinateSource_type: event.coordinateSource
    .type as typeof _events_v.$inferInsert.version_coordinateSource_type,
  version_coordinateSource_confidence: event.coordinateSource.confidence ?? null,
  version_coordinateSource_normalizedAddress: event.coordinateSource.normalizedAddress ?? null,
  version_eventTimestamp: event.eventTimestamp,
  version_eventEndTimestamp: event.eventEndTimestamp ?? null,
  version_locationName: event.locationName ?? null,
  version_uniqueId: event.uniqueId,
  version_contentHash: event.contentHash ?? null,
  version_schemaVersionNumber: event.schemaVersionNumber ?? null,
  version_validationStatus: event.validationStatus as typeof _events_v.$inferInsert.version_validationStatus,
  version_transformations: event.transformations ?? null,
  version_updatedAt: now,
  version_createdAt: now,
  version__status: "published" as const,
  updatedAt: now,
  createdAt: now,
  latest: true,
  autosave: false,
});

/**
 * Insert a batch of events into both `events` and `_events_v` tables.
 * Returns the number of successfully inserted rows.
 *
 * Runs both inserts inside a single Drizzle transaction so that a failure on
 * `_events_v` rolls back the matching `events` rows. Without this, a failed
 * version insert would leave orphaned event rows (no version row, `latest`
 * unset) that Payload's standard query path cannot surface or update.
 */
const insertBatch = async (payload: Payload, batch: BulkEventData[], now: string): Promise<Set<string>> => {
  if (batch.length === 0) return new Set();

  return payload.db.drizzle.transaction(async (tx: typeof payload.db.drizzle) => {
    // Insert into events, returning generated IDs.
    // ON CONFLICT DO NOTHING on the unique uniqueId index prevents duplicate events
    // when two concurrent imports target the same dataset with overlapping data.
    // Return uniqueId alongside id so we can match back to the batch for version rows.
    const inserted = await tx
      .insert(events)
      .values(batch.map((e) => toEventsRow(e, now)))
      .onConflictDoNothing({ target: events.uniqueId })
      .returning({ id: events.id, uniqueId: events.uniqueId });

    // Populate _events_v so Payload's draft/publish system stays consistent.
    // With ON CONFLICT DO NOTHING, inserted may be shorter than batch,
    // so look up each inserted row's source data by uniqueId.
    if (inserted.length > 0) {
      const batchByUniqueId = new Map(batch.map((e) => [e.uniqueId, e]));
      const versionRows = inserted.map((row) => {
        const source = row.uniqueId != null ? batchByUniqueId.get(row.uniqueId) : undefined;
        if (!source) {
          // Unreachable by construction — `returning()` only yields rows we
          // just inserted from `batch`. Throwing aborts the transaction so
          // the events row rolls back rather than becoming an orphan.
          throw new Error(`bulk-event-insert: inserted event row ${row.id} missing source data for uniqueId`);
        }
        return toVersionRow(row.id, source, now);
      });
      await tx.insert(_events_v).values(versionRows);
    }

    // The uniqueIds actually inserted. Any batch row whose uniqueId is absent
    // here lost an ON CONFLICT race (the event already exists) — the caller
    // surfaces those as conflicts so an update-strategy import can reconcile
    // them instead of silently dropping its (possibly newer) data.
    return new Set(inserted.map((row) => row.uniqueId).filter((u): u is string => u != null));
  });
};

/** Outcome of a {@link bulkInsertEvents} call. */
export interface BulkInsertResult {
  /** Number of rows committed across all successful sub-batches. */
  created: number;
  /**
   * Rows whose sub-batch failed to commit. Each `index` points back into the
   * `allEvents` array passed in, so the caller can map it to a source row
   * number. All rows in a failed sub-batch share the same `error`.
   */
  failures: Array<{ index: number; error: unknown }>;
  /**
   * Rows that committed but did NOT insert because their uniqueId already
   * existed (ON CONFLICT DO NOTHING) — a concurrent import beat this one to the
   * row after dedup analysis classified it as new. Each `index` points back into
   * `allEvents`. Under the "update" strategy the caller reconciles these into
   * updates so the newer data is not silently lost; under "skip" they are
   * correctly dropped.
   */
  conflicts: Array<{ index: number; uniqueId: string }>;
}

/**
 * Bulk-insert events into the `events` and `_events_v` tables,
 * bypassing Payload hooks.
 *
 * Splits the input into sub-batches of `batchSize` rows, each committed in its
 * own transaction. A failure in one sub-batch rolls back only that sub-batch —
 * already-committed sub-batches are kept and counted. Failed rows are returned
 * in {@link BulkInsertResult.failures} rather than thrown, so a late failure
 * can't make the caller discard or mislabel rows that were actually written.
 *
 * @returns The committed count and the rows belonging to failed sub-batches.
 */
export const bulkInsertEvents = async (
  payload: Payload,
  allEvents: BulkEventData[],
  batchSize: number = BATCH_SIZE
): Promise<BulkInsertResult> => {
  if (allEvents.length === 0) return { created: 0, failures: [], conflicts: [] };

  const now = new Date().toISOString();
  let totalInserted = 0;
  const failures: Array<{ index: number; error: unknown }> = [];
  const conflicts: Array<{ index: number; uniqueId: string }> = [];

  for (let i = 0; i < allEvents.length; i += batchSize) {
    const batch = allEvents.slice(i, i + batchSize);
    try {
      const insertedUniqueIds = await insertBatch(payload, batch, now);
      totalInserted += insertedUniqueIds.size;
      // A committed sub-batch may still have dropped rows to ON CONFLICT: any
      // batch row whose uniqueId did not come back was beaten to the insert.
      batch.forEach((event, k) => {
        if (event.uniqueId != null && !insertedUniqueIds.has(event.uniqueId)) {
          conflicts.push({ index: i + k, uniqueId: event.uniqueId });
        }
      });
    } catch (error) {
      logger.error({ err: error, startIndex: i, count: batch.length }, "Bulk insert sub-batch failed");
      for (let j = i; j < i + batch.length; j++) {
        failures.push({ index: j, error });
      }
    }
  }

  logger.debug(
    { totalInserted, totalRequested: allEvents.length, failed: failures.length, conflicts: conflicts.length },
    "Bulk insert complete"
  );

  return { created: totalInserted, failures, conflicts };
};
