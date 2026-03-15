/**
 * This file defines the API route for clustering events on the map.
 *
 * It uses a custom PostgreSQL function (`cluster_events`) to perform server-side clustering
 * of events based on the current map viewport (bounds and zoom level). This is a highly
 * performant way to visualize large numbers of points on a map, as it offloads the
 * clustering work to the database and only sends the aggregated cluster information to the client.
 * The endpoint returns a GeoJSON FeatureCollection that can be directly consumed by map libraries.
 *
 * **Architecture note:** Uses raw SQL with PostGIS functions instead of Payload's
 * query API for performance. Access control is enforced via `getAllAccessibleCatalogIds()`
 * which filters by catalog visibility and user ownership, ensuring equivalent
 * security to Payload's built-in access control.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute, ValidationError } from "@/lib/api";
import { buildCanonicalFilters } from "@/lib/filters/build-canonical-filters";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { toClusteringJsonb } from "@/lib/filters/to-jsonb-payload";
import type { MapBounds } from "@/lib/geospatial";
import { MapClustersQuerySchema } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";

export const GET = apiRoute({
  auth: "optional",
  query: MapClustersQuerySchema,
  handler: async ({ query, user, payload }) => {
    // Bounds is required for map clustering
    if (query.bounds == null) {
      throw new ValidationError("Missing required parameter: bounds");
    }

    const bounds: MapBounds = query.bounds;

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user);

    // If no accessible catalogs and no catalog filter specified, return empty result
    if (accessibleCatalogIds.length === 0 && query.catalog == null) {
      return { type: "FeatureCollection", features: [], clusters: [], totalCount: 0 };
    }

    const filters = buildCanonicalFilters({ parameters: query, accessibleCatalogIds, requireLocation: true });

    // If user doesn't have access to the requested catalog, return empty result
    if (filters.denyResults) {
      return { type: "FeatureCollection", features: [], clusters: [], totalCount: 0 };
    }

    const result = await executeClusteringQuery(payload, bounds, query.zoom, filters);
    const clusters = transformResultToClusters(result.rows);

    return { type: "FeatureCollection", features: clusters };
  },
});

const executeClusteringQuery = async (
  payload: Payload,
  bounds: MapBounds,
  zoom: number,
  filters: CanonicalEventFilters
) =>
  (await payload.db.drizzle.execute(sql`
    SELECT * FROM cluster_events(
      ${bounds.west}::double precision,
      ${bounds.south}::double precision,
      ${bounds.east}::double precision,
      ${bounds.north}::double precision,
      ${zoom}::integer,
      ${toClusteringJsonb(filters)}::jsonb
    )
  `)) as { rows: Array<Record<string, unknown>> };

const transformResultToClusters = (rows: Array<Record<string, unknown>>) =>
  rows
    .filter((row) => {
      // Skip rows with missing or non-numeric coordinates instead of defaulting to (0, 0)
      const hasLon = typeof row.longitude === "string" || typeof row.longitude === "number";
      const hasLat = typeof row.latitude === "string" || typeof row.latitude === "number";
      return hasLon && hasLat;
    })
    .map((row: Record<string, unknown>) => {
      const isCluster = Number(row.event_count) > 1;
      const featureId = row.cluster_id ?? row.event_id;

      return {
        type: "Feature",
        id: featureId, // Root-level ID for MapLibre feature tracking
        geometry: {
          type: "Point",
          coordinates: [Number.parseFloat(String(row.longitude)), Number.parseFloat(String(row.latitude))],
        },
        properties: {
          type: isCluster ? "event-cluster" : "event-point",
          ...(isCluster ? { count: Number(row.event_count) } : {}),
          ...(row.event_title != null && typeof row.event_title === "string" ? { title: row.event_title } : {}),
        },
      };
    });
