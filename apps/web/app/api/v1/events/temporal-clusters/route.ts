/**
 * Adaptive temporal clustering for the beeswarm chart.
 *
 * Returns individual events when the total count is below the threshold,
 * or per-dataset-per-bucket clusters when above. This allows the chart
 * to scale from 12 to 100k+ events with a single API call.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { toHistogramJsonb } from "@/lib/filters/to-jsonb-payload";
import type { TemporalClustersQuery, TemporalClustersResponse } from "@/lib/schemas/events";
import { TemporalClustersQuerySchema } from "@/lib/schemas/events";

interface TemporalClusterRow {
  bucket_start: string;
  bucket_end: string;
  bucket_size_seconds: number;
  dataset_id: number;
  dataset_name: string;
  event_count: number;
  event_id: number | null;
  event_title: string | null;
  event_timestamp_val: string | null;
}

export const GET = apiRoute({
  auth: "optional",
  query: TemporalClustersQuerySchema,
  handler: async ({ query, user, payload }) => {
    const ctx = await resolveEventQueryContext({ payload, user, query });
    if (ctx.denied) {
      return buildEmptyResponse();
    }

    const rows = await executeTemporalClusters(payload, query, ctx.filters);
    return buildResponse(rows);
  },
});

const executeTemporalClusters = async (
  payload: Payload,
  query: TemporalClustersQuery,
  filters: CanonicalEventFilters
): Promise<TemporalClusterRow[]> => {
  const result = (await payload.db.drizzle.execute(sql`
    SELECT * FROM cluster_events_temporal(
      ${toHistogramJsonb(filters)}::jsonb,
      ${query.targetBuckets}::integer,
      ${query.individualThreshold}::integer
    )
  `)) as unknown as { rows: TemporalClusterRow[] };
  return result.rows;
};

const buildEmptyResponse = (): TemporalClustersResponse => ({
  items: [],
  metadata: {
    total: 0,
    mode: "individual",
    bucketSizeSeconds: null,
    bucketCount: 0,
    dateRange: { min: null, max: null },
  },
});

const buildResponse = (rows: TemporalClusterRow[]): TemporalClustersResponse => {
  if (rows.length === 0) return buildEmptyResponse();

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
      datasetId: Number(row.dataset_id),
      datasetName: row.dataset_name,
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

  return {
    items,
    metadata: {
      total,
      mode: isIndividual ? "individual" : "clustered",
      bucketSizeSeconds: rows[0]!.bucket_size_seconds ?? null,
      bucketCount: bucketStarts.size,
      dateRange: {
        min: rows[0]?.bucket_start ? new Date(rows[0].bucket_start).toISOString() : null,
        max: rows.at(-1)?.bucket_end ? new Date(rows.at(-1)!.bucket_end).toISOString() : null,
      },
    },
  };
};
