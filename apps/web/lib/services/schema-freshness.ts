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

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
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

/**
 * Check if a dataset's schema is stale by querying the actual event count.
 *
 * @param payload - Payload instance
 * @param datasetId - ID of the dataset to check
 * @param schema - The current schema version (or null if no schema exists)
 * @param req - Optional request for context
 * @returns Freshness result with staleness status and reason
 */
export const getSchemaFreshness = async (
  payload: Payload,
  datasetId: number,
  schema: DatasetSchema | null,
  req?: PayloadRequest
): Promise<SchemaFreshnessResult> => {
  // Query actual event count from database
  const eventCountResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { dataset: { equals: datasetId } },
    overrideAccess: true,
    req,
  });
  const currentEventCount = eventCountResult.totalDocs;

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
    return {
      stale: true,
      reason: "added",
      currentEventCount,
      schemaEventCount,
      schemaCreatedAt,
    };
  }

  // Check for deleted events
  if (currentEventCount < schemaEventCount) {
    return {
      stale: true,
      reason: "deleted",
      currentEventCount,
      schemaEventCount,
      schemaCreatedAt,
    };
  }

  // Schema is fresh (event count matches)
  return {
    stale: false,
    currentEventCount,
    schemaEventCount,
    schemaCreatedAt,
  };
};

/**
 * Simple boolean check for schema staleness.
 *
 * @param payload - Payload instance
 * @param datasetId - ID of the dataset
 * @param schema - The current schema version (or null if no schema exists)
 * @returns true if schema is stale, false if fresh
 */
export const isSchemaStale = async (
  payload: Payload,
  datasetId: number,
  schema: DatasetSchema | null
): Promise<boolean> => (await getSchemaFreshness(payload, datasetId, schema)).stale;
