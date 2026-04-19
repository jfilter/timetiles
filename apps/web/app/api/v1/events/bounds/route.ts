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
import { and, count, eq, isNotNull, max, min } from "@payloadcms/db-postgres/drizzle";

import { apiRoute } from "@/lib/api";
import { createFilteredEventDatasetScope } from "@/lib/database/filtered-events-query";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
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

    logger.debug(
      { count: row.count, bounds: { west: row.west, south: row.south, east: row.east, north: row.north } },
      "Computed event bounds"
    );

    return {
      bounds: { north: Number(row.north), south: Number(row.south), east: Number(row.east), west: Number(row.west) },
      count: row.count,
    } satisfies BoundsResponse;
  },
});
