/**
 * Unified API route for aggregating event counts by various fields.
 *
 * Returns event counts grouped by a specified field (catalog, dataset, etc.)
 * with optional filtering by date range and geographic bounds. Uses PostgreSQL
 * GROUP BY aggregation for high performance.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute, ValidationError } from "@/lib/api";
import { parseBoundsParameter } from "@/lib/geospatial";
import { logger } from "@/lib/logger";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import {
  type AggregationFilters,
  buildAggregationWhereClause,
  normalizeEndDate,
} from "@/lib/services/aggregation-filters";
import { extractBaseEventParameters, normalizeStrictIntegerList } from "@/lib/utils/event-params";

/**
 * Aggregated item in response.
 */
interface AggregationItem {
  id: number | string;
  name: string;
  count: number;
}

/**
 * Response format for aggregation endpoint.
 */
interface AggregationResponse {
  items: AggregationItem[];
  total: number;
  groupedBy: string;
}

/**
 * Supported groupBy field types.
 */
type GroupByField = "catalog" | "dataset";

/**
 * GET handler for event aggregation.
 *
 * Query Parameters:
 * - groupBy (required): Field to group by ('catalog' | 'dataset')
 * - catalog (optional): Filter by catalog ID
 * - datasets (optional): Filter by dataset IDs (comma-separated)
 * - startDate (optional): Filter events >= this date
 * - endDate (optional): Filter events <= this date (inclusive)
 * - bounds (optional): Geographic bounding box (JSON string)
 */
export const GET = apiRoute({
  auth: "optional",
  handler: async ({ req, user, payload }) => {
    const { searchParams } = req.nextUrl;

    // Parse groupBy parameter (required)
    const groupBy = searchParams.get("groupBy") as GroupByField | null;
    if (!groupBy) {
      throw new ValidationError("Missing required parameter: groupBy");
    }

    // Validate groupBy value
    if (!["catalog", "dataset"].includes(groupBy)) {
      throw new ValidationError(`Invalid groupBy value: ${groupBy}. Must be one of: catalog, dataset`);
    }

    // Parse filter parameters using shared utility
    const baseParams = extractBaseEventParameters(searchParams);
    const catalog = baseParams.catalog;
    const datasets = baseParams.datasets;
    const startDate = baseParams.startDate;
    const endDate = normalizeEndDate(baseParams.endDate);

    // Parse geographic bounds
    const boundsParam = searchParams.get("bounds");
    const boundsResult = parseBoundsParameter(boundsParam);
    if (boundsResult.error) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    // Get accessible catalog IDs for access control
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user ?? null);

    // If no accessible catalogs, return empty result
    if (accessibleCatalogIds.length === 0 && !catalog) {
      logger.info("No accessible catalogs for user", {
        user: user?.email ?? "anonymous",
      });
      return Response.json({
        items: [],
        total: 0,
        groupedBy: groupBy,
      });
    }

    // Build filters object
    const filters: AggregationFilters = {
      catalog,
      datasets,
      startDate,
      endDate,
      bounds,
      fieldFilters: Object.keys(baseParams.fieldFilters).length > 0 ? baseParams.fieldFilters : null,
    };

    // Execute aggregation query
    const result = await executeAggregationQuery(payload, groupBy, filters, accessibleCatalogIds);

    return Response.json(result);
  },
});

/**
 * Execute PostgreSQL aggregation query.
 *
 * Uses GROUP BY to aggregate event counts by the specified field,
 * applying all filters in the WHERE clause for optimal performance.
 *
 * When datasets are explicitly filtered, ensures all selected datasets
 * appear in results (with 0 count if no events match in viewport).
 */
const executeAggregationQuery = async (
  payload: Payload,
  groupBy: GroupByField,
  filters: AggregationFilters,
  accessibleCatalogIds: number[]
): Promise<AggregationResponse> => {
  // Build WHERE clause from filters
  const whereClause = buildAggregationWhereClause(filters, accessibleCatalogIds);

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
  `)) as {
    rows: Array<{
      id: number;
      name: string | null;
      count: number;
    }>;
  };

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
    const selectedDatasetIds = normalizeStrictIntegerList(filters.datasets);

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
      `)) as {
        rows: Array<{ id: number; name: string | null }>;
      };

      // Add missing datasets with 0 count
      for (const row of missingDatasetsResult.rows) {
        resultMap.set(row.id, {
          id: row.id,
          name: row.name ?? `Dataset ${row.id}`,
          count: 0,
        });
      }
    }
  }

  // Convert map to array, sorted by count descending (0-count items at the end)
  const items = Array.from(resultMap.values()).sort((a, b) => b.count - a.count);

  // Calculate total events
  const total = items.reduce((sum, item) => sum + item.count, 0);

  logger.info("Aggregation query executed", {
    groupBy,
    itemCount: items.length,
    totalEvents: total,
  });

  return {
    items,
    total,
    groupedBy: groupBy,
  };
};
