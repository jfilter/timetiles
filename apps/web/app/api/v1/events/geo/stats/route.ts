/**
 * API route for calculating global cluster statistics (percentiles).
 *
 * Returns percentile breakpoints (p20, p40, p60, p80, p100) calculated from
 * the entire dataset (with filters applied). These stats are used to maintain
 * consistent cluster visualization across all zoom levels and viewports.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { DEFAULT_CLUSTER_STATS } from "@/lib/constants/map";
import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { createErrorHandler } from "@/lib/utils/api-response";
import { buildMapClusterFilters } from "@/lib/utils/event-filters";
import { extractClusterStatsParameters } from "@/lib/utils/event-params";
import config from "@/payload.config";

const handleError = createErrorHandler("calculating cluster stats", logger);

const buildCatalogFilterSql = (catalog: unknown, accessibleCatalogIds: unknown) => {
  if (catalog != null) {
    return sql`AND d.catalog_id = ${parseInt(catalog as string)}`;
  }
  if (accessibleCatalogIds != null && Array.isArray(accessibleCatalogIds) && accessibleCatalogIds.length > 0) {
    return sql`AND d.catalog_id IN (${sql.join(
      accessibleCatalogIds.map((id) => sql`${id}`),
      sql`, `
    )})`;
  }
  return sql``;
};

const buildFieldFiltersSql = (fieldFilters: unknown) => {
  if (fieldFilters != null && typeof fieldFilters === "object" && Object.keys(fieldFilters).length > 0) {
    const fieldConditions = Object.entries(fieldFilters as Record<string, string[]>).map(([fieldKey, values]) => {
      if (!Array.isArray(values) || values.length === 0) return sql`TRUE`;
      return sql`e.data->>${fieldKey} IN (${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `
      )})`;
    });
    const joinedConditions = sql.join(fieldConditions, sql` AND `);
    return sql`AND (${joinedConditions})`;
  }
  return sql``;
};

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown) => {
  try {
    const payload = await getPayload({ config });

    const parameters = extractClusterStatsParameters(request.nextUrl.searchParams);

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && !parameters.catalog) {
      return NextResponse.json(DEFAULT_CLUSTER_STATS);
    }

    const filters = buildMapClusterFilters(parameters, accessibleCatalogIds);

    // If user doesn't have access to the requested catalog, return default stats
    if (filters.denyAccess) {
      return NextResponse.json(DEFAULT_CLUSTER_STATS);
    }

    const stats = await calculateGlobalStats(payload, filters);

    return NextResponse.json(stats);
  } catch (error) {
    return handleError(error);
  }
});

const calculateGlobalStats = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  filters: Record<string, unknown>
) => {
  const { catalog, datasets, startDate, endDate, accessibleCatalogIds, fieldFilters } = filters;

  const catalogFilter = buildCatalogFilterSql(catalog, accessibleCatalogIds);
  const fieldFiltersSql = buildFieldFiltersSql(fieldFilters);

  // Query to get event counts grouped by location (simulating clustering at high zoom)
  const result = (await payload.db.drizzle.execute(sql`
    WITH filtered_events AS (
      SELECT
        e.id,
        e.location_longitude as lng,
        e.location_latitude as lat
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE
        e.location_longitude IS NOT NULL
        AND e.location_latitude IS NOT NULL
        ${catalogFilter}
        ${
          Array.isArray(datasets) && datasets.length > 0
            ? sql`AND e.dataset_id IN (${sql.join(
                datasets.map((d) => sql`${parseInt(d as string)}`),
                sql`, `
              )})`
            : sql``
        }
        ${startDate != null ? sql`AND e.event_timestamp >= ${startDate as string}::timestamp` : sql``}
        ${endDate != null ? sql`AND e.event_timestamp <= ${endDate as string}::timestamp` : sql``}
        ${fieldFiltersSql}
    ),
    location_clusters AS (
      SELECT
        ROUND(lng * 1000) as lng_key,
        ROUND(lat * 1000) as lat_key,
        COUNT(*) as count
      FROM filtered_events
      GROUP BY lng_key, lat_key
      HAVING COUNT(*) > 1
    ),
    sorted_counts AS (
      SELECT count FROM location_clusters ORDER BY count
    ),
    stats AS (
      SELECT
        COUNT(*) as total_clusters,
        PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY count) as p20,
        PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY count) as p40,
        PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY count) as p60,
        PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY count) as p80,
        MAX(count) as p100
      FROM sorted_counts
    )
    SELECT
      COALESCE(CEIL(p20), 2) as p20,
      COALESCE(CEIL(p40), 5) as p40,
      COALESCE(CEIL(p60), 10) as p60,
      COALESCE(CEIL(p80), 20) as p80,
      COALESCE(CEIL(p100), 50) as p100,
      COALESCE(total_clusters, 0) as total_clusters
    FROM stats
  `)) as { rows: Array<Record<string, unknown>> };

  const row = result.rows[0];

  if (!row || row.total_clusters === 0) {
    logger.debug("No clusters found, returning default stats");
    return DEFAULT_CLUSTER_STATS;
  }

  const stats = {
    p20: Number(row.p20),
    p40: Number(row.p40),
    p60: Number(row.p60),
    p80: Number(row.p80),
    p100: Number(row.p100),
  };

  logger.debug("Global cluster stats calculated", {
    totalClusters: Number(row.total_clusters),
    stats,
  });

  return stats;
};
