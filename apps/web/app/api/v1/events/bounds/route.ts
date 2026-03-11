/**
 * API route for fetching geographic bounds of filtered events.
 *
 * Returns the bounding box containing all events matching the specified filters,
 * with access control applied. This is used to fit the map to show all relevant
 * events on initial load or after filter changes.
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

import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { EventFiltersSchema } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { normalizeEndDate } from "@/lib/services/aggregation-filters";
import {
  buildCatalogSqlCondition,
  buildDatasetSqlCondition,
  buildDateSqlConditions,
  buildFieldFilterSqlConditions,
} from "@/lib/utils/event-sql-filters";

/**
 * Response format for the bounds endpoint.
 */
export interface BoundsResponse {
  /** Geographic bounds of matching events, or null if no events match */
  bounds: { north: number; south: number; east: number; west: number } | null;
  /** Total count of events within bounds */
  count: number;
}

/**
 * GET /api/v1/events/bounds
 *
 * Returns the geographic bounding box of all events matching the specified filters.
 *
 * Query Parameters:
 * - catalog (optional): Filter by catalog ID
 * - datasets (optional): Filter by dataset IDs (comma-separated or multiple params)
 * - startDate (optional): Filter events after this date (ISO 8601)
 * - endDate (optional): Filter events before this date (ISO 8601)
 *
 * Response:
 * - bounds: { north, south, east, west } or null if no events
 * - count: number of events
 */
export const GET = apiRoute({
  auth: "optional",
  query: EventFiltersSchema,
  handler: async ({ query, user, payload }) => {
    const endDate = normalizeEndDate(query.endDate ?? null);
    const hasCatalogFilter = query.catalog != null;

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && !hasCatalogFilter) {
      return Response.json({ bounds: null, count: 0 } satisfies BoundsResponse);
    }

    // Build SQL conditions
    const conditions: ReturnType<typeof sql>[] = [
      sql`e.location_longitude IS NOT NULL`,
      sql`e.location_latitude IS NOT NULL`,
    ];

    // Apply catalog access control
    if (hasCatalogFilter) {
      if (accessibleCatalogIds.includes(query.catalog!)) {
        conditions.push(buildCatalogSqlCondition(query.catalog));
      } else {
        return Response.json({ bounds: null, count: 0 } satisfies BoundsResponse);
      }
    } else {
      conditions.push(buildCatalogSqlCondition(undefined, accessibleCatalogIds));
    }

    // Apply dataset filter
    if (query.datasets != null && query.datasets.length > 0) {
      const datasetCondition = buildDatasetSqlCondition(query.datasets);
      conditions.push(datasetCondition ?? sql`FALSE`);
    }

    // Apply date and field filters
    conditions.push(
      ...buildDateSqlConditions(query.startDate ?? null, endDate),
      ...buildFieldFilterSqlConditions(query.ff)
    );

    // Combine conditions using reduce with initial value
    const whereClause = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`, sql`TRUE`);

    // Execute bounds query using MIN/MAX for efficient computation
    type BoundsRow = {
      west: string | null;
      south: string | null;
      east: string | null;
      north: string | null;
      count: number;
    };

    const result = (await payload.db.drizzle.execute(sql`
      SELECT
        MIN(e.location_longitude) as west,
        MIN(e.location_latitude) as south,
        MAX(e.location_longitude) as east,
        MAX(e.location_latitude) as north,
        COUNT(*)::integer as count
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${whereClause}
    `)) as { rows: BoundsRow[] };

    const row = result.rows[0];

    // Check if we have any results with valid bounds
    if (!row || row.count === 0 || row.west == null || row.south == null || row.east == null || row.north == null) {
      return Response.json({ bounds: null, count: 0 } satisfies BoundsResponse);
    }

    logger.debug(
      { count: row.count, bounds: { west: row.west, south: row.south, east: row.east, north: row.north } },
      "Computed event bounds"
    );

    return Response.json({
      bounds: {
        north: Number.parseFloat(row.north),
        south: Number.parseFloat(row.south),
        east: Number.parseFloat(row.east),
        west: Number.parseFloat(row.west),
      },
      count: row.count,
    } satisfies BoundsResponse);
  },
});
