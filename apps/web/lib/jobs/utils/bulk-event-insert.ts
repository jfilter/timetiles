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
  originalData: Record<string, unknown>;
  uniqueId: string;
  eventTimestamp: string;
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
  originalData: event.originalData,
  uniqueId: event.uniqueId,
  eventTimestamp: event.eventTimestamp,
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
  version_originalData: event.originalData,
  version_location_latitude: event.location?.latitude ?? null,
  version_location_longitude: event.location?.longitude ?? null,
  version_coordinateSource_type: event.coordinateSource
    .type as typeof _events_v.$inferInsert.version_coordinateSource_type,
  version_coordinateSource_confidence: event.coordinateSource.confidence ?? null,
  version_coordinateSource_normalizedAddress: event.coordinateSource.normalizedAddress ?? null,
  version_eventTimestamp: event.eventTimestamp,
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
 */
const insertBatch = async (payload: Payload, batch: BulkEventData[], now: string): Promise<number> => {
  if (batch.length === 0) return 0;

  const db = payload.db.drizzle;

  // Insert into events, returning generated IDs.
  // ON CONFLICT DO NOTHING on the unique uniqueId index prevents duplicate events
  // when two concurrent imports target the same dataset with overlapping data.
  // Return uniqueId alongside id so we can match back to the batch for version rows.
  const inserted = await db
    .insert(events)
    .values(batch.map((e) => toEventsRow(e, now)))
    .onConflictDoNothing({ target: events.uniqueId })
    .returning({ id: events.id, uniqueId: events.uniqueId });

  // Populate _events_v so Payload's draft/publish system stays consistent.
  // With ON CONFLICT DO NOTHING, inserted may be shorter than batch,
  // so look up each inserted row's source data by uniqueId.
  if (inserted.length > 0) {
    const batchByUniqueId = new Map(batch.map((e) => [e.uniqueId, e]));
    await db
      .insert(_events_v)
      .values(inserted.map((row) => toVersionRow(row.id, batchByUniqueId.get(row.uniqueId!)!, now)));
  }

  return inserted.length;
};

/**
 * Bulk-insert events into the `events` and `_events_v` tables,
 * bypassing Payload hooks.
 *
 * Splits the input into batches of {@link BATCH_SIZE} rows and executes
 * typed Drizzle INSERT statements. This is orders of magnitude faster
 * than calling `payload.create()` per row.
 *
 * @returns The total number of inserted rows.
 */
export const bulkInsertEvents = async (payload: Payload, allEvents: BulkEventData[]): Promise<number> => {
  if (allEvents.length === 0) return 0;

  const now = new Date().toISOString();
  let totalInserted = 0;

  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE);
    const inserted = await insertBatch(payload, batch, now);
    totalInserted += inserted;
  }

  logger.debug({ totalInserted, totalRequested: allEvents.length }, "Bulk insert complete");

  return totalInserted;
};
