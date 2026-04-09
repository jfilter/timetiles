/**
 * API route returning a summary for events within specific H3 cells.
 *
 * Used by the cluster focus panel to show a mini dashboard: dataset/catalog
 * breakdown, temporal range, category facets, and event preview list.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute, ValidationError } from "@/lib/api";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { h3ColumnName, isValidH3CellId, toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { ClusterSummaryQuerySchema, type ClusterSummaryResponse } from "@/lib/schemas/events";

export const GET = apiRoute({
  auth: "optional",
  query: ClusterSummaryQuerySchema,
  handler: async ({ query, user, payload }) => {
    const cells = query.cells.split(",").filter(Boolean);
    if (cells.length === 0) {
      throw new ValidationError("Missing required parameter: cells");
    }
    const h3Resolution = query.h3Resolution;

    const ctx = await resolveEventQueryContext({ payload, user, query });
    if (ctx.denied) {
      return emptyResponse();
    }

    return executeClusterSummary(payload, cells, h3Resolution, ctx.filters);
  },
});

const emptyResponse = (): ClusterSummaryResponse => ({
  totalCount: 0,
  locationCount: 0,
  temporalRange: null,
  datasets: [],
  catalogs: [],
  categories: [],
  preview: [],
});

/** Build the H3 cell filter condition for a given resolution. */
const buildH3CellCondition = (cells: string[], resolution: number) => {
  const col = h3ColumnName(resolution);
  const validCells = cells.filter(isValidH3CellId);
  if (validCells.length === 0) return sql.raw("FALSE");
  return sql`${sql.raw(col)}::text IN (${sql.join(
    validCells.map((c) => sql`${c}`),
    sql`, `
  )})`;
};

const executeClusterSummary = async (
  payload: Payload,
  cells: string[],
  h3Resolution: number,
  filters: CanonicalEventFilters
): Promise<ClusterSummaryResponse> => {
  const whereClause = toSqlWhereClause(filters);
  const cellCondition = buildH3CellCondition(cells, h3Resolution);

  // Run all queries in parallel
  const [summaryResult, datasetsResult, catalogsResult, previewResult] = await Promise.all([
    // 1. Total count + temporal range + unique locations
    payload.db.drizzle.execute(sql`
      SELECT
        COUNT(*)::integer as total_count,
        COUNT(DISTINCT e.h3_r15)::integer as location_count,
        MIN(e.event_timestamp) as earliest,
        MAX(e.event_timestamp) as latest
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
        AND e.location_longitude IS NOT NULL
        AND ${cellCondition}
    `) as Promise<{
      rows: Array<{ total_count: number; location_count: number; earliest: string | null; latest: string | null }>;
    }>,

    // 2. Dataset breakdown
    payload.db.drizzle.execute(sql`
      SELECT d.id, d.name, COUNT(*)::integer as count
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
        AND e.location_longitude IS NOT NULL
        AND ${cellCondition}
      GROUP BY d.id, d.name
      ORDER BY count DESC
      LIMIT 10
    `) as Promise<{ rows: Array<{ id: number; name: string; count: number }> }>,

    // 3. Catalog breakdown
    payload.db.drizzle.execute(sql`
      SELECT c.id, c.name, COUNT(*)::integer as count
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      JOIN payload.catalogs c ON d.catalog_id = c.id
      WHERE ${whereClause}
        AND e.location_longitude IS NOT NULL
        AND ${cellCondition}
      GROUP BY c.id, c.name
      ORDER BY count DESC
      LIMIT 10
    `) as Promise<{ rows: Array<{ id: number; name: string; count: number }> }>,

    // 4. Preview events
    payload.db.drizzle.execute(sql`
      SELECT
        e.id,
        (e.transformed_data->>'title')::text as title,
        e.event_timestamp as timestamp,
        d.name as dataset_name
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
        AND e.location_longitude IS NOT NULL
        AND ${cellCondition}
      ORDER BY e.event_timestamp DESC NULLS LAST
      LIMIT 8
    `) as Promise<{
      rows: Array<{ id: number; title: string | null; timestamp: string | null; dataset_name: string }>;
    }>,
  ]);

  const summary = summaryResult.rows[0];

  // 5. Category facets — get enum fields from the datasets in this cluster
  const datasetIds = datasetsResult.rows.map((d) => d.id);
  const categories =
    datasetIds.length > 0 ? await fetchCategoryFacets(payload, datasetIds, whereClause, cellCondition) : [];

  return {
    totalCount: summary?.total_count ?? 0,
    locationCount: summary?.location_count ?? 0,
    temporalRange:
      summary?.earliest != null ? { earliest: summary.earliest, latest: summary.latest ?? summary.earliest } : null,
    datasets: datasetsResult.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    catalogs: catalogsResult.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    categories,
    preview: previewResult.rows.map((r) => ({
      id: r.id,
      title: r.title ?? undefined,
      timestamp: r.timestamp ?? undefined,
      datasetName: r.dataset_name,
    })),
  };
};

/** Fetch top category values from enum fields across the cluster's datasets. */
const fetchCategoryFacets = async (
  payload: Payload,
  datasetIds: number[],
  whereClause: ReturnType<typeof sql>,
  cellCondition: ReturnType<typeof sql.raw>
): Promise<ClusterSummaryResponse["categories"]> => {
  // Find enum fields from dataset metadata
  const datasets = await payload.find({
    collection: "datasets",
    where: { id: { in: datasetIds } },
    select: { fieldTypes: true, fieldMetadata: true },
    limit: datasetIds.length,
  });

  // Collect unique enum fields across all datasets
  const enumFields = new Set<string>();
  for (const ds of datasets.docs) {
    const ft = ds.fieldTypes as { enum?: string[] } | null;
    if (ft?.enum) {
      for (const field of ft.enum) enumFields.add(field);
    }
  }

  if (enumFields.size === 0) return [];

  // Query top 5 values per field (limit to first 3 fields to keep it fast)
  const fields = [...enumFields].slice(0, 3);
  const categories: ClusterSummaryResponse["categories"] = [];

  for (const field of fields) {
    const result = (await payload.db.drizzle.execute(sql`
      SELECT (e.transformed_data ->> ${field})::text as value, COUNT(*)::integer as count
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
        AND e.location_longitude IS NOT NULL
        AND ${cellCondition}
        AND e.transformed_data ->> ${field} IS NOT NULL
      GROUP BY value
      ORDER BY count DESC
      LIMIT 5
    `)) as { rows: Array<{ value: string; count: number }> };

    if (result.rows.length > 0) {
      categories.push({ field, values: result.rows.map((r) => ({ value: r.value, count: r.count })) });
    }
  }

  return categories;
};
