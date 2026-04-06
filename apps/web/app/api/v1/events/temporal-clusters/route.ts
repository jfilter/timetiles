/**
 * Adaptive temporal clustering for the beeswarm chart.
 *
 * Returns individual events when the total count is below the threshold,
 * or per-group-per-bucket clusters when above. Supports grouping by
 * dataset (default), catalog, or any arbitrary JSONB field.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { isValidFieldKey } from "@/lib/filters/field-validation";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { toHistogramJsonb } from "@/lib/filters/to-jsonb-payload";
import type { TemporalClustersQuery, TemporalClustersResponse } from "@/lib/schemas/events";
import { TemporalClustersQuerySchema } from "@/lib/schemas/events";

interface TemporalClusterRow {
  bucket_start: string;
  bucket_end: string;
  bucket_size_seconds: number;
  group_id: string;
  group_name: string;
  event_count: number;
  event_id: number | null;
  event_title: string | null;
  event_timestamp_val: string | null;
}

export const GET = apiRoute({
  auth: "optional",
  query: TemporalClustersQuerySchema,
  handler: async ({ query, user, payload }) => {
    // Validate groupBy field if it's a custom field path
    const groupBy = query.groupBy ?? "dataset";
    if (groupBy !== "dataset" && groupBy !== "catalog" && !isValidFieldKey(groupBy)) {
      return buildEmptyResponse(groupBy);
    }

    const ctx = await resolveEventQueryContext({ payload, user, query });
    if (ctx.denied) {
      return buildEmptyResponse(groupBy);
    }

    const rows = await executeTemporalClusters(payload, query, ctx.filters, groupBy);
    return buildResponse(rows, groupBy);
  },
});

const executeTemporalClusters = async (
  payload: Payload,
  query: TemporalClustersQuery,
  filters: CanonicalEventFilters,
  groupBy: string
): Promise<TemporalClusterRow[]> => {
  const result = (await payload.db.drizzle.execute(sql`
    SELECT * FROM cluster_events_temporal(
      ${toHistogramJsonb(filters)}::jsonb,
      ${query.targetBuckets}::integer,
      ${query.individualThreshold}::integer,
      ${groupBy}::text
    )
  `)) as unknown as { rows: TemporalClusterRow[] };
  return result.rows;
};

const buildEmptyResponse = (groupBy: string): TemporalClustersResponse => ({
  items: [],
  metadata: {
    total: 0,
    mode: "individual",
    groupBy,
    bucketSizeSeconds: null,
    bucketCount: 0,
    dateRange: { min: null, max: null },
  },
});

const buildResponse = (rows: TemporalClusterRow[], groupBy: string): TemporalClustersResponse => {
  if (rows.length === 0) return buildEmptyResponse(groupBy);

  const isIndividual = rows[0]!.event_id != null;
  const total = isIndividual ? rows.length : rows.reduce((sum, r) => sum + Number(r.event_count), 0);

  const bucketStarts = new Set<string>();
  const items = rows.map((row) => {
    const bucketStart = new Date(row.bucket_start).toISOString();
    const bucketEnd = new Date(row.bucket_end).toISOString();
    bucketStarts.add(bucketStart);

    return {
      bucketStart,
      bucketEnd,
      groupId: String(row.group_id),
      groupName: row.group_name,
      count: Number(row.event_count),
      ...(isIndividual
        ? {
            eventId: row.event_id!,
            eventTitle: row.event_title,
            eventTimestamp: row.event_timestamp_val ? new Date(row.event_timestamp_val).toISOString() : undefined,
          }
        : {}),
    };
  });

  const firstRow = rows[0];
  const lastRow = rows.at(-1);

  return {
    items,
    metadata: {
      total,
      mode: isIndividual ? "individual" : "clustered",
      groupBy,
      bucketSizeSeconds: firstRow!.bucket_size_seconds ?? null,
      bucketCount: bucketStarts.size,
      dateRange: {
        min: firstRow?.bucket_start ? new Date(firstRow.bucket_start).toISOString() : null,
        max: lastRow?.bucket_end ? new Date(lastRow.bucket_end).toISOString() : null,
      },
    },
  };
};
