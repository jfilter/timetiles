/**
 * Batch processing helpers for create-events-batch.
 *
 * Transforms rows into event data, applies ingest transforms,
 * and performs bulk insertion of events.
 *
 * @module
 * @category Jobs
 */
import { and, eq, inArray } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { applyTransforms } from "@/lib/ingest/transforms";
import { getIngestGeocodingResults } from "@/lib/ingest/types/geocoding";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { createJobLogger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import { events as eventsTable } from "@/payload-generated-schema";
import type { Dataset, Event, IngestJob } from "@/payload-types";

import type { BulkEventData } from "../../utils/bulk-event-insert";
import { bulkInsertEvents } from "../../utils/bulk-event-insert";
import { createEventData, EventPayloadTooLargeError } from "../../utils/event-creation-helpers";
import { extractDuplicateRows, readDuplicateStrategy } from "../../utils/resource-loading";
import { buildTransformsFromDataset } from "../../utils/transform-builders";

const getTransformPath = (t: IngestTransform): string => {
  if ("from" in t) return t.from;
  if ("fromFields" in t) return String(t.fromFields);
  return "";
};

/** For rename transforms the source key is deleted, so newValue must read
 *  from the destination path (t.to). For all other transforms the value
 *  stays at t.from. */
const getNewValuePath = (t: IngestTransform): string => {
  if (t.type === "rename" && "to" in t) return t.to;
  if ("from" in t) return t.from;
  if ("fromFields" in t) return String(t.fromFields);
  return "";
};

/** Denormalized access fields computed once per job. */
export interface AccessFields {
  datasetIsPublic: boolean;
  catalogOwnerId: number | undefined;
}

export interface ProcessBatchContext {
  payload: Payload;
  job: IngestJob;
  dataset: Dataset;
  ingestJobId: string | number;
  accessFields: AccessFields;
  logger: ReturnType<typeof createJobLogger>;
}

/** Apply transforms to a row and build the corresponding BulkEventData. */
const buildBulkEventFromRow = (
  row: Record<string, unknown>,
  transforms: IngestTransform[],
  ctx: ProcessBatchContext,
  geocodingResults: ReturnType<typeof getIngestGeocodingResults>
): BulkEventData => {
  const { dataset, ingestJobId, accessFields, logger: log } = ctx;

  const transformedRow = transforms.length > 0 ? applyTransforms(row, transforms) : row;

  // Emit only transforms that actually fired on this row. A rename whose `from`
  // field is absent (or any transform whose inputs are missing) leaves both
  // `oldValue` and `newValue` as null — persisting those is noise on the event's
  // `transformations` audit trail and misrepresents `validationStatus`.
  const rawTransformationChanges =
    transforms.length > 0
      ? transforms.map((t) => ({
          path: getTransformPath(t),
          oldValue: "from" in t ? (row[t.from] ?? null) : (null as unknown),
          newValue: (transformedRow[getNewValuePath(t)] ?? null) as unknown,
        }))
      : null;
  const transformationChanges =
    rawTransformationChanges?.filter((c) => !(c.oldValue === null && c.newValue === null)) ?? null;

  if (transformationChanges) {
    log.debug("Applied transforms", { transformCount: transforms.length });
  }

  const eventData = createEventData(
    transformedRow,
    row,
    dataset,
    ingestJobId,
    ctx.job,
    geocodingResults,
    transformationChanges
  );

  return { ...eventData, datasetIsPublic: accessFields.datasetIsPublic, catalogOwnerId: accessFields.catalogOwnerId };
};

/**
 * SELECT-and-filter candidate update IDs to those that belong to the target
 * dataset. One query per batch regardless of batch size.
 *
 * Defence in depth: `analyze-duplicates` already scopes the lookup to the
 * same dataset, but the import pipeline persists `existingEventId` in the
 * job record and feeds it back here. If that record is ever tampered with
 * or the duplicate lookup is widened later, this guard stops cross-dataset
 * writes from slipping through.
 */
const validateUpdateIdsInDataset = async (
  payload: Payload,
  datasetId: number,
  candidateIds: Array<string | number>
): Promise<Set<number>> => {
  const numericIds = candidateIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  if (numericIds.length === 0) return new Set();

  const inDataset = (await payload.db.drizzle
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.dataset, datasetId), inArray(eventsTable.id, numericIds)))) as Array<{ id: number }>;

  return new Set(inDataset.map((r) => r.id));
};

/** Try to update an existing event; returns `true` if handled (updated or blocked). */
const tryUpdateExistingEvent = async (
  payload: Payload,
  eventData: BulkEventData,
  existingEventId: string | number,
  updateIdsInDataset: Set<number>,
  datasetId: number,
  log: ReturnType<typeof createJobLogger>
): Promise<{ updated: boolean; blocked: boolean }> => {
  if (!updateIdsInDataset.has(Number(existingEventId))) {
    log.warn("Refusing cross-dataset event update", { existingEventId, datasetId });
    return { updated: false, blocked: true };
  }
  await asSystem(payload).update({
    collection: "events",
    id: existingEventId,
    data: {
      dataset: eventData.dataset,
      datasetIsPublic: eventData.datasetIsPublic,
      catalogOwnerId: eventData.catalogOwnerId,
      uniqueId: eventData.uniqueId,
      transformedData: eventData.transformedData,
      sourceData: eventData.sourceData,
      location: eventData.location,
      locationName: eventData.locationName,
      coordinateSource: {
        type: eventData.coordinateSource.type as NonNullable<Event["coordinateSource"]>["type"],
        confidence: eventData.coordinateSource.confidence ?? null,
        normalizedAddress: eventData.coordinateSource.normalizedAddress ?? null,
      },
      eventTimestamp: eventData.eventTimestamp,
      eventEndTimestamp: eventData.eventEndTimestamp,
      validationStatus: eventData.validationStatus as Event["validationStatus"],
      transformations: eventData.transformations as Event["transformations"],
      schemaVersionNumber: eventData.schemaVersionNumber,
      contentHash: eventData.contentHash,
      ingestJob: eventData.ingestJob,
    },
  });
  return { updated: true, blocked: false };
};

const bulkInsertNewEvents = async (
  payload: Payload,
  eventsToInsert: BulkEventData[],
  insertRowNumbers: number[],
  log: ReturnType<typeof createJobLogger>
): Promise<{ created: number; errors: Array<{ row: number; error: string }> }> => {
  if (eventsToInsert.length === 0) return { created: 0, errors: [] };
  try {
    const created = await bulkInsertEvents(payload, eventsToInsert);
    return { created, errors: [] };
  } catch (error) {
    log.error("Bulk insert failed for batch", { count: eventsToInsert.length, error });
    const msg = error instanceof Error ? error.message : "Bulk insert failed";
    // Report the actual source row numbers rather than positions in the
    // filtered `eventsToInsert` array — callers scanning error CSVs would
    // otherwise be pointed at the wrong rows whenever the batch contained
    // skipped or updated duplicates.
    const errors = insertRowNumbers.map((row) => ({ row, error: msg }));
    return { created: 0, errors };
  }
};

export const processEventBatch = async (
  ctx: ProcessBatchContext,
  rows: Record<string, unknown>[],
  globalRowOffset: number
) => {
  const { payload, job, dataset, logger: log } = ctx;
  const duplicateStrategy = readDuplicateStrategy(job);
  const { skipRows, updateRows } = extractDuplicateRows(job, duplicateStrategy);
  const geocodingResults = getIngestGeocodingResults(job);
  const transforms = buildTransformsFromDataset(dataset);

  // Dataset-scope guard: `analyze-duplicates` already filters candidates by
  // dataset, but we re-verify at the write site. If ever anyone widens the
  // duplicate-lookup query, a malformed `updateRows` entry cannot bleed across
  // datasets — the update is refused with a recorded error instead.
  const updateIdsInDataset = await validateUpdateIdsInDataset(payload, dataset.id, Array.from(updateRows.values()));

  let eventsSkipped = 0;
  let eventsUpdated = 0;
  const eventsToInsert: BulkEventData[] = [];
  const insertRowNumbers: number[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = globalRowOffset + index;

    if (skipRows.has(rowNumber)) {
      eventsSkipped++;
      continue;
    }

    try {
      const eventData = buildBulkEventFromRow(row, transforms, ctx, geocodingResults);

      // External duplicates with "update" strategy: update existing event via Payload API
      const existingEventId = updateRows.get(rowNumber);
      if (existingEventId != null) {
        const result = await tryUpdateExistingEvent(
          payload,
          eventData,
          existingEventId,
          updateIdsInDataset,
          dataset.id,
          log
        );
        if (result.blocked) {
          errors.push({
            row: rowNumber,
            error: `update blocked: event ${existingEventId} is not in dataset ${dataset.id}`,
          });
        }
        if (result.updated) eventsUpdated++;
        continue;
      }

      eventsToInsert.push(eventData);
      insertRowNumbers.push(rowNumber);
    } catch (error) {
      // Oversize rows are surfaced per-row (batch continues). Other failures
      // also become per-row entries so a single bad row doesn't poison the
      // rest of the batch.
      if (error instanceof EventPayloadTooLargeError) {
        log.warn("Row exceeds per-event payload cap; skipping", { rowNumber, bytes: error.bytes, limit: error.limit });
      } else {
        log.warn("Failed to process event", { rowNumber, error });
      }
      errors.push({ row: rowNumber, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  const { created: eventsCreated, errors: bulkErrors } = await bulkInsertNewEvents(
    payload,
    eventsToInsert,
    insertRowNumbers,
    log
  );
  errors.push(...bulkErrors);

  return { eventsCreated: eventsCreated + eventsUpdated, eventsSkipped, eventsUpdated, errors };
};
