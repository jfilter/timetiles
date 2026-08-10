/**
 * Provides utilities for determining if a dataset's schema is up-to-date.
 *
 * This service compares the current event count with the count when the schema
 * was generated. Event counts are queried directly from the database on-demand,
 * not cached, for accuracy.
 *
 * @module
 * @category Services
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { fetchDatasetEventCounts } from "@/lib/database/filtered-events-query";
import type { DatasetSchema } from "@/payload-types";

export type StalenessReason = "added" | "deleted" | "no_schema";

export interface SchemaFreshnessResult {
  /** Whether the schema is stale and should be regenerated */
  stale: boolean;
  /** The reason for staleness, if stale */
  reason?: StalenessReason;
  /** Current number of events in the dataset */
  currentEventCount: number;
  /** Number of events when the schema was generated */
  schemaEventCount: number | null;
  /** When the schema was created */
  schemaCreatedAt: string | null;
}

const countEventsFor = async (payload: Payload, datasetId: number, req?: PayloadRequest): Promise<number> => {
  const eventCountResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { dataset: { equals: datasetId } },
    overrideAccess: true,
    req,
  });
  return eventCountResult.totalDocs;
};

/**
 * Event counts for many datasets in one query.
 *
 * The maintenance job checks every dataset for staleness, and one `payload.count` per dataset
 * turns that scan into 1 round trip per dataset against a fixed job timeout. Datasets with no
 * events are absent from the result — read them as 0.
 *
 * `datasetIds` scopes the aggregate. A targeted run over one dataset must not degrade an
 * indexable count into a GROUP BY over the whole events table.
 */
export const countEventsByDataset = (payload: Payload, datasetIds: number[]): Promise<Map<number, number>> =>
  fetchDatasetEventCounts(payload, datasetIds);

/**
 * Check if a dataset's schema is stale by querying the actual event count.
 *
 * @param payload - Payload instance
 * @param datasetId - ID of the dataset to check
 * @param schema - The current schema version (or null if no schema exists)
 * @param req - Optional request for context
 * @param knownEventCount - Count already fetched by the caller (see countEventsByDataset).
 *   Skips the per-dataset count query without introducing a second staleness rule.
 * @returns Freshness result with staleness status and reason
 */
export const getSchemaFreshness = async (
  payload: Payload,
  datasetId: number,
  schema: DatasetSchema | null,
  req?: PayloadRequest,
  knownEventCount?: number
): Promise<SchemaFreshnessResult> => {
  const currentEventCount = knownEventCount ?? (await countEventsFor(payload, datasetId, req));

  // No schema exists - stale if there are events
  if (!schema) {
    return {
      stale: currentEventCount > 0,
      reason: currentEventCount > 0 ? "no_schema" : undefined,
      currentEventCount,
      schemaEventCount: null,
      schemaCreatedAt: null,
    };
  }

  const schemaEventCount = schema.eventCountAtCreation ?? 0;
  const schemaCreatedAt = schema.createdAt;

  // Check for added events
  if (currentEventCount > schemaEventCount) {
    return { stale: true, reason: "added", currentEventCount, schemaEventCount, schemaCreatedAt };
  }

  // Check for deleted events
  if (currentEventCount < schemaEventCount) {
    return { stale: true, reason: "deleted", currentEventCount, schemaEventCount, schemaCreatedAt };
  }

  // Schema is fresh (event count matches)
  return { stale: false, currentEventCount, schemaEventCount, schemaCreatedAt };
};
