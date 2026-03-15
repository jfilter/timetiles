/**
 * API route for calculating global cluster statistics (percentiles).
 *
 * Returns percentile breakpoints (p20, p40, p60, p80, p100) calculated from
 * the entire dataset (with filters applied). These stats are used to maintain
 * consistent cluster visualization across all zoom levels and viewports.
 *
 * **Architecture note:** Uses raw SQL with PostGIS functions instead of Payload's
 * query API for performance. Access control is enforced via `getAllAccessibleCatalogIds()`
 * which filters by catalog visibility and user ownership, ensuring equivalent
 * security to Payload's built-in access control.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import { DEFAULT_CLUSTER_STATS } from "@/lib/constants/map";
import { buildCanonicalFilters } from "@/lib/filters/build-canonical-filters";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { toSqlConditions } from "@/lib/filters/to-sql-conditions";
import { logger } from "@/lib/logger";
import { ClusterStatsQuerySchema } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";

export const GET = apiRoute({
  auth: "optional",
  query: ClusterStatsQuerySchema,
  handler: async ({ query, user, payload }) => {
    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && query.catalog == null) {
      return { ...DEFAULT_CLUSTER_STATS };
    }

    const filters = buildCanonicalFilters({ parameters: query, accessibleCatalogIds, requireLocation: true });

    // If user doesn't have access to the requested catalog, return default stats
    if (filters.denyResults) {
      return { ...DEFAULT_CLUSTER_STATS };
    }

    const stats = await calculateGlobalStats(payload, filters);

    return stats;
  },
});

const calculateGlobalStats = async (payload: Payload, filters: CanonicalEventFilters) => {
  const filterConditions = toSqlConditions(filters);

  const extraConditions =
    filterConditions.length > 0
      ? filterConditions.reduce(
          (acc: ReturnType<typeof sql>, cond: ReturnType<typeof sql>) => sql`${acc} AND ${cond}`,
          sql``
        )
      : sql``;

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
        ${extraConditions}
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

  logger.debug({ totalClusters: Number(row.total_clusters), stats }, "Global cluster stats calculated");

  return stats;
};
