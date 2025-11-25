/**
 * This file defines the API route for clustering events on the map.
 *
 * It uses a custom PostgreSQL function (`cluster_events`) to perform server-side clustering
 * of events based on the current map viewport (bounds and zoom level). This is a highly
 * performant way to visualize large numbers of points on a map, as it offloads the
 * clustering work to the database and only sends the aggregated cluster information to the client.
 * The endpoint returns a GeoJSON FeatureCollection that can be directly consumed by map libraries.
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { isValidBounds, type MapBounds } from "@/lib/geospatial";
import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { badRequest, createErrorHandler } from "@/lib/utils/api-response";
import { buildMapClusterFilters } from "@/lib/utils/event-filters";
import { extractMapClusterParameters } from "@/lib/utils/event-params";
import config from "@/payload.config";

const handleError = createErrorHandler("fetching map clusters", logger);

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown) => {
  try {
    const payload = await getPayload({ config });

    const parameters = extractMapClusterParameters(request.nextUrl.searchParams);

    const boundsResult = parseBounds(parameters.boundsParam);
    if ("error" in boundsResult) {
      return boundsResult.error;
    }

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && !parameters.catalog) {
      return NextResponse.json({
        type: "FeatureCollection",
        features: [],
      });
    }

    const filters = buildMapClusterFilters(parameters, accessibleCatalogIds);

    const result = await executeClusteringQuery(payload, boundsResult.bounds, parameters.zoom, filters);
    const clusters = transformResultToClusters(result.rows);

    return NextResponse.json({
      type: "FeatureCollection",
      features: clusters,
    });
  } catch (error) {
    return handleError(error);
  }
});

const parseBounds = (boundsParam: string | null): { bounds: MapBounds } | { error: NextResponse } => {
  if (boundsParam == null) {
    return {
      error: badRequest("Missing bounds parameter"),
    };
  }

  try {
    const parsedBounds = JSON.parse(boundsParam) as unknown;
    if (!isValidBounds(parsedBounds)) {
      throw new Error("Invalid bounds format");
    }
    return { bounds: parsedBounds };
  } catch {
    return {
      error: NextResponse.json(
        {
          error: "Invalid bounds format. Expected: {north, south, east, west}",
        },
        { status: 400 }
      ),
    };
  }
};

const executeClusteringQuery = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  bounds: MapBounds,
  zoom: number,
  filters: Record<string, unknown>
) => {
  const { catalog, datasets, startDate, endDate, accessibleCatalogIds } = filters;

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM cluster_events(
      ${bounds.west}::double precision,
      ${bounds.south}::double precision,
      ${bounds.east}::double precision,
      ${bounds.north}::double precision,
      ${zoom}::integer,
      ${JSON.stringify({
        catalogId: catalog != null ? parseInt(catalog as string) : undefined,
        catalogIds: Array.isArray(accessibleCatalogIds) ? accessibleCatalogIds : undefined,
        datasetId:
          Array.isArray(datasets) && datasets.length === 1 && datasets[0] != undefined
            ? parseInt(datasets[0] as string)
            : undefined,
        startDate,
        endDate,
      })}::jsonb
    )
  `)) as { rows: Array<Record<string, unknown>> };
};

const transformResultToClusters = (rows: Array<Record<string, unknown>>) =>
  rows.map((row: Record<string, unknown>) => {
    const isCluster = Number(row.event_count) > 1;
    const featureId = row.cluster_id ?? row.event_id;

    return {
      type: "Feature",
      id: featureId, // Root-level ID for MapLibre feature tracking
      geometry: {
        type: "Point",
        coordinates: [
          Number.parseFloat(
            typeof row.longitude === "string" || typeof row.longitude === "number" ? String(row.longitude) : "0"
          ),
          Number.parseFloat(
            typeof row.latitude === "string" || typeof row.latitude === "number" ? String(row.latitude) : "0"
          ),
        ],
      },
      properties: {
        type: isCluster ? "event-cluster" : "event-point",
        ...(isCluster ? { count: Number(row.event_count) } : {}),
        ...(row.event_title != null && typeof row.event_title === "string" ? { title: row.event_title } : {}),
      },
    };
  });
