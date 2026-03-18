/**
 * API route for fetching geographic bounds of filtered events.
 *
 * Returns the bounding box containing all events matching the specified filters,
 * with access control applied. This is used to fit the map to show all relevant
 * events on initial load or after filter changes.
 *
 * **Architecture note:** Uses raw SQL with PostGIS functions instead of Payload's
 * query API for performance. Access control is enforced via `resolveEventQueryContext()`
 * which filters by catalog visibility and user ownership, ensuring equivalent
 * security to Payload's built-in access control.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";

import { apiRoute } from "@/lib/api";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { logger } from "@/lib/logger";
import { EventFiltersSchema } from "@/lib/schemas/events";
import type { BoundsResponse } from "@/lib/types/event-bounds";

export type { BoundsResponse } from "@/lib/types/event-bounds";

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
    const ctx = await resolveEventQueryContext({ payload, user, query });
    if (ctx.denied) {
      return { bounds: null, count: 0 } satisfies BoundsResponse;
    }

    const { filters } = ctx;

    // Build SQL WHERE clause from canonical filters
    const filterWhereClause = toSqlWhereClause(filters);
    const whereClause = sql`e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL AND ${filterWhereClause}`;

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
      return { bounds: null, count: 0 } satisfies BoundsResponse;
    }

    logger.debug(
      { count: row.count, bounds: { west: row.west, south: row.south, east: row.east, north: row.north } },
      "Computed event bounds"
    );

    return {
      bounds: {
        north: Number.parseFloat(row.north),
        south: Number.parseFloat(row.south),
        east: Number.parseFloat(row.east),
        west: Number.parseFloat(row.west),
      },
      count: row.count,
    } satisfies BoundsResponse;
  },
});
