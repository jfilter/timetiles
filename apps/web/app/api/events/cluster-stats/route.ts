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

import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import config from "@/payload.config";
import type { User } from "@/payload-types";

/**
 * Get catalog IDs that the user has access to
 */
const getAccessibleCatalogIds = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  user?: User | null
): Promise<number[]> => {
  const { getAllAccessibleCatalogIds } = await import("@/lib/services/access-control");
  return getAllAccessibleCatalogIds(payload, user);
};

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown) => {
  try {
    const payload = await getPayload({ config });

    const parameters = extractRequestParameters(request.nextUrl.searchParams);

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAccessibleCatalogIds(payload, request.user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && !parameters.catalog) {
      return NextResponse.json({
        p20: 2,
        p40: 5,
        p60: 10,
        p80: 20,
        p100: 50,
      });
    }

    const filters = buildFilters(parameters, accessibleCatalogIds);
    const stats = await calculateGlobalStats(payload, filters);

    return NextResponse.json(stats);
  } catch (error) {
    return handleError(error);
  }
});

const extractRequestParameters = (searchParams: URLSearchParams) => ({
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
});

const buildFilters = (
  parameters: ReturnType<typeof extractRequestParameters>,
  accessibleCatalogIds: number[]
): Record<string, unknown> => {
  const filters: Record<string, unknown> = {};

  // Apply catalog access control
  if (parameters.catalog != null) {
    const catalogId = parseInt(parameters.catalog);
    // Only include if user has access to this catalog
    if (accessibleCatalogIds.includes(catalogId)) {
      filters.catalog = parameters.catalog;
    } else {
      // User trying to access catalog they don't have permission for
      filters.accessibleCatalogIds = accessibleCatalogIds;
    }
  } else {
    // No specific catalog requested, filter by all accessible catalogs
    filters.accessibleCatalogIds = accessibleCatalogIds;
  }

  if (parameters.datasets.length > 0 && parameters.datasets[0] !== "") filters.datasets = parameters.datasets;
  if (parameters.startDate != null) filters.startDate = parameters.startDate;
  if (parameters.endDate != null) filters.endDate = parameters.endDate;
  return filters;
};

const calculateGlobalStats = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  filters: Record<string, unknown>
) => {
  const { catalog, datasets, startDate, endDate, accessibleCatalogIds } = filters;

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
        ${
          catalog != null
            ? sql`AND d.catalog_id = ${parseInt(catalog as string)}`
            : accessibleCatalogIds != null && Array.isArray(accessibleCatalogIds) && accessibleCatalogIds.length > 0
              ? sql`AND d.catalog_id IN (${sql.join(
                  accessibleCatalogIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              : sql``
        }
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
    return { p20: 2, p40: 5, p60: 10, p80: 20, p100: 50 };
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

const handleError = (error: unknown): NextResponse => {
  logger.error("Error calculating cluster stats:", {
    error: error as Error,
    message: (error as Error).message,
    stack: (error as Error).stack,
  });
  return NextResponse.json(
    {
      error: "Failed to calculate cluster stats",
      details: (error as Error).message,
    },
    { status: 500 }
  );
};
