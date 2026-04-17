/**
 * Batch processing helpers for create-events-batch.
 *
 * Transforms rows into event data, applies ingest transforms,
 * and performs bulk insertion of events.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { applyTransforms } from "@/lib/ingest/transforms";
import type { createJobLogger } from "@/lib/logger";
import { getImportGeocodingResults } from "@/lib/types/geocoding";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import type { Dataset, IngestJob } from "@/payload-types";

import type { BulkEventData } from "../../utils/bulk-event-insert";
import { bulkInsertEvents } from "../../utils/bulk-event-insert";
import { createEventData } from "../../utils/event-creation-helpers";
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
  geocodingResults: ReturnType<typeof getImportGeocodingResults>
): BulkEventData => {
  const { dataset, ingestJobId, accessFields, logger: log } = ctx;

  const transformedRow = transforms.length > 0 ? applyTransforms(row, transforms) : row;

  const transformationChanges =
    transforms.length > 0
      ? transforms.map((t) => ({
          path: getTransformPath(t),
          oldValue: "from" in t ? (row[t.from] ?? null) : (null as unknown),
          newValue: (transformedRow[getNewValuePath(t)] ?? null) as unknown,
        }))
      : null;

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

export const processEventBatch = async (
  ctx: ProcessBatchContext,
  rows: Record<string, unknown>[],
  globalRowOffset: number
) => {
  const { payload, job, dataset, logger: log } = ctx;
  const duplicateStrategy = readDuplicateStrategy(job);
  const { skipRows, updateRows } = extractDuplicateRows(job, duplicateStrategy);
  const geocodingResults = getImportGeocodingResults(job);
  const transforms = buildTransformsFromDataset(dataset);

  let eventsSkipped = 0;
  let eventsUpdated = 0;
  const eventsToInsert: BulkEventData[] = [];
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
        await payload.update({
          collection: "events",
          id: existingEventId,
          data: {
            transformedData: eventData.transformedData,
            sourceData: eventData.sourceData,
            location: eventData.location,
            eventTimestamp: eventData.eventTimestamp,
            eventEndTimestamp: eventData.eventEndTimestamp,
            ingestJob: eventData.ingestJob,
          },
          overrideAccess: true,
        });
        eventsUpdated++;
        continue;
      }

      eventsToInsert.push(eventData);
    } catch (error) {
      log.warn("Failed to process event", { rowNumber, error });
      errors.push({ row: rowNumber, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  // Bulk insert new events
  let eventsCreated = 0;
  if (eventsToInsert.length > 0) {
    try {
      eventsCreated = await bulkInsertEvents(payload, eventsToInsert);
    } catch (error) {
      log.error("Bulk insert failed for batch", { globalRowOffset, count: eventsToInsert.length, error });
      const msg = error instanceof Error ? error.message : "Bulk insert failed";
      for (let i = 0; i < eventsToInsert.length; i++) {
        errors.push({ row: globalRowOffset + i, error: msg });
      }
    }
  }

  return { eventsCreated: eventsCreated + eventsUpdated, eventsSkipped, eventsUpdated, errors };
};
