/**
 * Service for executing event aggregation queries.
 *
 * Uses PostgreSQL GROUP BY aggregation for high-performance event counting
 * by catalog or dataset, with support for temporal, spatial, and field filters.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { logger } from "@/lib/logger";

/**
 * Aggregated item in response.
 */
export interface AggregationItem {
  id: number | string;
  name: string;
  count: number;
}

/**
 * Response format for aggregation endpoint.
 */
export interface AggregationResponse {
  items: AggregationItem[];
  total: number;
  groupedBy: string;
}

/**
 * Supported groupBy field types.
 */
export type GroupByField = "catalog" | "dataset";

/**
 * Execute PostgreSQL aggregation query.
 *
 * Uses GROUP BY to aggregate event counts by the specified field,
 * applying all filters in the WHERE clause for optimal performance.
 *
 * When datasets are explicitly filtered, ensures all selected datasets
 * appear in results (with 0 count if no events match in viewport).
 */
export const executeAggregationQuery = async (
  payload: Payload,
  groupBy: GroupByField,
  filters: CanonicalEventFilters,
  accessibleCatalogIds: number[]
): Promise<AggregationResponse> => {
  // Build WHERE clause from canonical filters
  const whereClause = toSqlWhereClause(filters);

  // Build SELECT and GROUP BY clauses based on groupBy field
  let selectClause;
  let joinClause;
  let groupByClause;

  if (groupBy === "catalog") {
    selectClause = sql`
      d.catalog_id as id,
      c.name as name,
      COUNT(*)::integer as count
    `;
    joinClause = sql`
      JOIN payload.datasets d ON e.dataset_id = d.id
      JOIN payload.catalogs c ON d.catalog_id = c.id
    `;
    groupByClause = sql`d.catalog_id, c.name`;
  } else {
    // groupBy === "dataset"
    selectClause = sql`
      e.dataset_id as id,
      d.name as name,
      COUNT(*)::integer as count
    `;
    joinClause = sql`
      JOIN payload.datasets d ON e.dataset_id = d.id
    `;
    groupByClause = sql`e.dataset_id, d.name`;
  }

  // Execute query
  const queryResult = (await payload.db.drizzle.execute(sql`
    SELECT ${selectClause}
    FROM payload.events e
    ${joinClause}
    WHERE ${whereClause}
    GROUP BY ${groupByClause}
    ORDER BY count DESC
  `)) as { rows: Array<{ id: number; name: string | null; count: number }> };

  // Transform results into a map for easy lookup
  const resultMap = new Map<number, AggregationItem>();
  for (const row of queryResult.rows) {
    resultMap.set(row.id, {
      id: row.id,
      name: row.name ?? `${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} ${row.id}`,
      count: row.count,
    });
  }

  // If datasets are explicitly filtered, ensure all selected datasets appear in results
  // (even with 0 count if they have no events in viewport)
  if (groupBy === "dataset" && filters.datasets && filters.datasets.length > 0) {
    const selectedDatasetIds = filters.datasets;

    // Fetch dataset names for any missing datasets
    const missingDatasetIds = selectedDatasetIds.filter((id) => !resultMap.has(id));

    if (missingDatasetIds.length > 0 && accessibleCatalogIds.length > 0) {
      const missingDatasetsResult = (await payload.db.drizzle.execute(sql`
        SELECT d.id, d.name FROM payload.datasets d
        WHERE d.id IN (${sql.join(
          missingDatasetIds.map((id) => sql`${id}`),
          sql`, `
        )})
        AND d.catalog_id IN (${sql.join(
          accessibleCatalogIds.map((id) => sql`${id}`),
          sql`, `
        )})
      `)) as { rows: Array<{ id: number; name: string | null }> };

      // Add missing datasets with 0 count
      for (const row of missingDatasetsResult.rows) {
        resultMap.set(row.id, { id: row.id, name: row.name ?? `Dataset ${row.id}`, count: 0 });
      }
    }
  }

  // Convert map to array, sorted by count descending (0-count items at the end)
  const items = Array.from(resultMap.values()).sort((a, b) => b.count - a.count);

  // Calculate total events
  const total = items.reduce((sum, item) => sum + item.count, 0);

  logger.info({ groupBy, itemCount: items.length, totalEvents: total }, "Aggregation query executed");

  return { items, total, groupedBy: groupBy };
};
