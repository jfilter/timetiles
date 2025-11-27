/**
 * API route for fetching geographic bounds of filtered events.
 *
 * Returns the bounding box containing all events matching the specified filters,
 * with access control applied. This is used to fit the map to show all relevant
 * events on initial load or after filter changes.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { createErrorHandler } from "@/lib/utils/api-response";
import { extractBaseEventParameters } from "@/lib/utils/event-params";
import config from "@/payload.config";

/**
 * Response format for the bounds endpoint.
 */
export interface BoundsResponse {
  /** Geographic bounds of matching events, or null if no events match */
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  /** Total count of events within bounds */
  count: number;
}

const handleError = createErrorHandler("fetching event bounds", logger);

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
export const GET = withOptionalAuth(async (request: AuthenticatedRequest) => {
  try {
    const payload = await getPayload({ config });
    const parameters = extractBaseEventParameters(request.nextUrl.searchParams);

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && parameters.catalog == null) {
      return NextResponse.json<BoundsResponse>({
        bounds: null,
        count: 0,
      });
    }

    // Build SQL conditions
    const conditions: ReturnType<typeof sql>[] = [
      sql`e.location_longitude IS NOT NULL`,
      sql`e.location_latitude IS NOT NULL`,
    ];

    // Apply catalog access control
    // Note: Arrays must be formatted as PostgreSQL array literals for raw SQL
    if (parameters.catalog != null && parameters.catalog !== "") {
      const catalogId = parseInt(parameters.catalog);
      // Only include if user has access to this catalog
      if (accessibleCatalogIds.includes(catalogId)) {
        conditions.push(sql`d.catalog_id = ${catalogId}`);
      } else {
        // User trying to access catalog they don't have permission for
        const catalogArray = `{${accessibleCatalogIds.join(",")}}`;
        conditions.push(sql`d.catalog_id = ANY(${catalogArray}::int[])`);
      }
    } else {
      // No specific catalog requested, filter by all accessible catalogs
      const catalogArray = `{${accessibleCatalogIds.join(",")}}`;
      conditions.push(sql`d.catalog_id = ANY(${catalogArray}::int[])`);
    }

    // Apply dataset filter
    if (parameters.datasets.length > 0 && parameters.datasets[0] !== "") {
      const datasetIds = parameters.datasets.map((d) => parseInt(d)).filter((id) => !isNaN(id));
      if (datasetIds.length > 0) {
        const datasetArray = `{${datasetIds.join(",")}}`;
        conditions.push(sql`e.dataset_id = ANY(${datasetArray}::int[])`);
      }
    }

    // Apply date filters
    if (parameters.startDate != null) {
      conditions.push(sql`e.event_timestamp >= ${parameters.startDate}::timestamptz`);
    }
    if (parameters.endDate != null) {
      conditions.push(sql`e.event_timestamp <= ${parameters.endDate}::timestamptz`);
    }

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
      return NextResponse.json<BoundsResponse>({
        bounds: null,
        count: 0,
      });
    }

    logger.debug("Computed event bounds", {
      count: row.count,
      bounds: { west: row.west, south: row.south, east: row.east, north: row.north },
    });

    return NextResponse.json<BoundsResponse>({
      bounds: {
        north: parseFloat(row.north),
        south: parseFloat(row.south),
        east: parseFloat(row.east),
        west: parseFloat(row.west),
      },
      count: row.count,
    });
  } catch (error) {
    return handleError(error);
  }
});
