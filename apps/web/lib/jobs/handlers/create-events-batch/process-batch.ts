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
import { getByPathOrKey } from "@/lib/utils/object-path";
import { events as eventsTable } from "@/payload-generated-schema";
import type { Dataset, Event, IngestJob } from "@/payload-types";

import type { BulkEventData } from "../../utils/bulk-event-insert";
import { bulkInsertEvents } from "../../utils/bulk-event-insert";
import { createEventData, EventPayloadTooLargeError } from "../../utils/event-creation-helpers";
import { getEventCreationDuplicates } from "../../utils/resource-loading";
import { buildTransformsFromDataset } from "../../utils/transform-builders";

type TransformationChange = { path: string; oldValue: unknown; newValue: unknown };

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  return JSON.stringify(left) === JSON.stringify(right);
};

const getTransformOutputPaths = (t: IngestTransform): string[] => {
  switch (t.type) {
    case "rename":
      return [t.to];
    case "date-parse":
      return [t.from];
    case "string-op":
      return [t.to ?? t.from];
    case "concatenate":
      return [t.to];
    case "split":
      return t.toFields;
    case "parse-json-array":
      return [t.to ?? t.from];
    case "split-to-array":
      return [t.to ?? t.from];
    case "extract":
      return [t.to];
  }
};

const getTransformInputValue = (t: IngestTransform, row: Record<string, unknown>): unknown => {
  if (t.type === "concatenate") {
    const values = Object.fromEntries(
      t.fromFields
        .map((field) => [field, getByPathOrKey(row, field)] as const)
        .filter(([, value]) => value !== undefined)
    );
    return Object.keys(values).length > 0 ? values : undefined;
  }

  return "from" in t ? getByPathOrKey(row, t.from) : undefined;
};

const getTransformOutputValue = (t: IngestTransform, row: Record<string, unknown>): unknown => {
  const outputPaths = getTransformOutputPaths(t);

  if (outputPaths.length === 1) {
    return getByPathOrKey(row, outputPaths[0]!);
  }

  const values = Object.fromEntries(
    outputPaths.map((path) => [path, getByPathOrKey(row, path)] as const).filter(([, value]) => value !== undefined)
  );
  return Object.keys(values).length > 0 ? values : undefined;
};

const didMoveSource = (t: IngestTransform, row: Record<string, unknown>, transformedRow: Record<string, unknown>) => {
  if (!(t.type === "rename" || t.type === "string-op")) return false;
  const target = t.type === "rename" ? t.to : (t.to ?? t.from);
  if (target === t.from) return false;
  return getByPathOrKey(row, t.from) !== undefined && getByPathOrKey(transformedRow, t.from) === undefined;
};

const buildTransformationChange = (
  t: IngestTransform,
  row: Record<string, unknown>,
  transformedRow: Record<string, unknown>
): TransformationChange | null => {
  const outputPaths = getTransformOutputPaths(t);
  const oldValue = getTransformInputValue(t, row);
  const previousOutputValue = getTransformOutputValue(t, row);
  const newValue = getTransformOutputValue(t, transformedRow);

  if (newValue === undefined) return null;
  if (!didMoveSource(t, row, transformedRow) && valuesEqual(previousOutputValue, newValue)) return null;

  return { path: outputPaths.join(","), oldValue: oldValue ?? null, newValue: newValue ?? null };
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

  // Emit only transforms that changed this row, reading both source and target
  // fields with the same dotted-path semantics as the transform engine.
  const transformationChanges =
    transforms.length > 0
      ? transforms
          .map((t) => buildTransformationChange(t, row, transformedRow))
          .filter((change): change is TransformationChange => change !== null)
      : null;
  const appliedTransformationChanges =
    transformationChanges && transformationChanges.length > 0 ? transformationChanges : null;

  if (appliedTransformationChanges) {
    log.debug("Applied transforms", { transformCount: appliedTransformationChanges.length });
  }

  const eventData = createEventData(
    transformedRow,
    row,
    dataset,
    ingestJobId,
    ctx.job,
    geocodingResults,
    appliedTransformationChanges
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
  const { skipRows, updateRows } = getEventCreationDuplicates(job);
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
