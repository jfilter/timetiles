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
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import {
  type AggregationFilters,
  buildAggregationWhereClause,
  normalizeEndDate,
  parseDatasetIds,
} from "@/lib/services/aggregation-filters";
import { parseBoundsParameter } from "@/lib/types/geo";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

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
export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });
    const { searchParams } = request.nextUrl;

    // Parse groupBy parameter (required)
    const groupBy = searchParams.get("groupBy") as GroupByField | null;
    if (!groupBy) {
      return NextResponse.json({ error: "Missing required parameter: groupBy" }, { status: 400 });
    }

    // Validate groupBy value
    if (!["catalog", "dataset"].includes(groupBy)) {
      return NextResponse.json(
        { error: `Invalid groupBy value: ${groupBy}. Must be one of: catalog, dataset` },
        { status: 400 }
      );
    }

    // Parse filter parameters
    const catalog = searchParams.get("catalog");
    const datasetsParam = searchParams.get("datasets");
    const datasets = parseDatasetIds(datasetsParam);
    const startDate = searchParams.get("startDate");
    const endDate = normalizeEndDate(searchParams.get("endDate"));

    // Parse geographic bounds
    const boundsParam = searchParams.get("bounds");
    const boundsResult = parseBoundsParameter(boundsParam);
    if (boundsResult.error) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    // Get accessible catalog IDs for access control
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user ?? null);

    // If no accessible catalogs, return empty result
    if (accessibleCatalogIds.length === 0 && !catalog) {
      logger.info("No accessible catalogs for user", {
        user: request.user?.email ?? "anonymous",
      });
      return NextResponse.json({
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
    };

    // Execute aggregation query
    const result = await executeAggregationQuery(payload, groupBy, filters, accessibleCatalogIds);

    return NextResponse.json(result);
  } catch (error) {
    logError(error, "Failed to aggregate events");
    return internalError("Failed to aggregate events");
  }
});

/**
 * Execute PostgreSQL aggregation query.
 *
 * Uses GROUP BY to aggregate event counts by the specified field,
 * applying all filters in the WHERE clause for optimal performance.
 */
const executeAggregationQuery = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
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

  // Transform results
  const items: AggregationItem[] = queryResult.rows.map((row) => ({
    id: row.id,
    name: row.name ?? `${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} ${row.id}`,
    count: row.count,
  }));

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
