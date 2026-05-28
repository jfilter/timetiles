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
import { and, count, eq, isNotNull, max, min, sql } from "@payloadcms/db-postgres/drizzle";

import { apiRoute } from "@/lib/api";
import { createFilteredEventDatasetScope } from "@/lib/database/filtered-events-query";
import { logger } from "@/lib/logger";
import { EventFiltersSchema } from "@/lib/schemas/events";
import { resolveEventQueryContext } from "@/lib/services/resolve-event-query-context";
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
    const { eventTable, datasetTable, whereClause } = createFilteredEventDatasetScope(filters);

    // Execute bounds query using MIN/MAX for efficient computation
    type BoundsRow = {
      west: number | string | null;
      south: number | string | null;
      east: number | string | null;
      north: number | string | null;
      count: number;
    };

    const row = (
      await payload.db.drizzle
        .select({
          west: min(eventTable.location_longitude),
          south: min(eventTable.location_latitude),
          east: max(eventTable.location_longitude),
          north: max(eventTable.location_latitude),
          count: count(),
        })
        .from(eventTable)
        .innerJoin(datasetTable, eq(eventTable.dataset, datasetTable.id))
        .where(and(isNotNull(eventTable.location_longitude), isNotNull(eventTable.location_latitude), whereClause))
        .limit(1)
    )[0] as BoundsRow | undefined;

    // Check if we have any results with valid bounds
    if (!row || row.count === 0 || row.west == null || row.south == null || row.east == null || row.north == null) {
      return { bounds: null, count: 0 } satisfies BoundsResponse;
    }

    const south = Number(row.south);
    const north = Number(row.north);
    let west = Number(row.west);
    let east = Number(row.east);

    // Plain MIN/MAX returns a near-global longitude box for data clustered
    // around the ±180° antimeridian (e.g. points at 179 and -179 give
    // west=-179, east=179). When the span exceeds half the globe, recompute the
    // tightest longitude extent as the complement of the largest gap between
    // consecutive longitudes: if that interior gap is wider than the gap across
    // the antimeridian, the box crosses it and is returned as west > east.
    if (east - west > ANTIMERIDIAN_LON_SPAN_THRESHOLD) {
      const refined = await computeAntimeridianLongitude(payload, eventTable, datasetTable, whereClause);
      if (refined) {
        west = refined.west;
        east = refined.east;
      }
    }

    logger.debug({ count: row.count, bounds: { west, south, east, north } }, "Computed event bounds");

    return { bounds: { north, south, east, west }, count: row.count } satisfies BoundsResponse;
  },
});

/** Longitude span (degrees) above which the antimeridian-aware path engages. */
const ANTIMERIDIAN_LON_SPAN_THRESHOLD = 180;

/**
 * Compute the tightest longitude extent of the filtered, located events,
 * accounting for clusters that straddle the ±180° antimeridian. Returns
 * `west > east` when the minimal box crosses the dateline.
 */
const computeAntimeridianLongitude = async (
  payload: Parameters<Parameters<typeof apiRoute>[0]["handler"]>[0]["payload"],
  eventTable: ReturnType<typeof createFilteredEventDatasetScope>["eventTable"],
  datasetTable: ReturnType<typeof createFilteredEventDatasetScope>["datasetTable"],
  whereClause: ReturnType<typeof createFilteredEventDatasetScope>["whereClause"]
): Promise<{ west: number; east: number } | null> => {
  // Build the located-longitude set with the query builder so table aliases
  // (e/d) and schema qualification are emitted correctly, then embed it as a
  // CTE for the window-function gap analysis.
  const locatedQuery = payload.db.drizzle
    // Alias via sql so the emitted column is `lng` (a plain column select would
    // keep its real name and break the `lng` reference in the CTEs below).
    .select({ lng: sql<number>`${eventTable.location_longitude}`.as("lng") })
    .from(eventTable)
    .innerJoin(datasetTable, eq(eventTable.dataset, datasetTable.id))
    .where(and(isNotNull(eventTable.location_longitude), whereClause));

  const result = (await payload.db.drizzle.execute(sql`
    WITH located AS (${locatedQuery}),
    sorted AS (SELECT DISTINCT lng FROM located),
    gaps AS (SELECT lng, LEAD(lng) OVER (ORDER BY lng) - lng AS gap FROM sorted),
    agg AS (SELECT MIN(lng) AS lng_min, MAX(lng) AS lng_max FROM sorted),
    widest AS (
      SELECT lng AS gap_start, lng + gap AS gap_end, gap
      FROM gaps WHERE gap IS NOT NULL ORDER BY gap DESC LIMIT 1
    )
    SELECT
      CASE WHEN COALESCE(w.gap, 0) > (a.lng_min + 360 - a.lng_max) THEN w.gap_end ELSE a.lng_min END AS west,
      CASE WHEN COALESCE(w.gap, 0) > (a.lng_min + 360 - a.lng_max) THEN w.gap_start ELSE a.lng_max END AS east
    FROM agg a LEFT JOIN widest w ON true
  `)) as { rows: Array<{ west: number | string | null; east: number | string | null }> };

  const refined = result.rows[0];
  if (refined?.west == null || refined?.east == null) return null;
  return { west: Number(refined.west), east: Number(refined.east) };
};
