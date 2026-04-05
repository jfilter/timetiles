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
 * query API for performance. Access control is enforced via `resolveEventQueryContext()`
 * which filters by catalog visibility and user ownership, ensuring equivalent
 * security to Payload's built-in access control.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute, ValidationError } from "@/lib/api";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { resolveEventQueryContext } from "@/lib/filters/resolve-event-query-context";
import { toClusteringJsonb } from "@/lib/filters/to-jsonb-payload";
import type { MapBounds } from "@/lib/geospatial";
import { MapClustersQuerySchema } from "@/lib/schemas/events";

export const GET = apiRoute({
  auth: "optional",
  query: MapClustersQuerySchema,
  handler: async ({ query, user, payload }) => {
    // Bounds is required for map clustering
    if (query.bounds == null) {
      throw new ValidationError("Missing required parameter: bounds");
    }

    const bounds: MapBounds = query.bounds;

    const ctx = await resolveEventQueryContext({ payload, user, query, requireLocation: true });
    if (ctx.denied) {
      return { type: "FeatureCollection", features: [], clusters: [], totalCount: 0 };
    }

    const algorithm = query.clusterAlgorithm ?? "h3";
    const mergeOverlapping = query.mergeOverlapping ?? false;
    const h3Scale = query.h3ResolutionScale ?? 0.6;
    const parentCells = query.parentCells ? query.parentCells.split(",").filter(Boolean) : undefined;
    const result = await executeClusteringQuery(payload, bounds, query.zoom, ctx.filters, {
      targetClusters: query.targetClusters ?? 60,
      algorithm,
      minPoints: query.minPoints ?? 2,
      mergeOverlapping,
      h3ResolutionScale: h3Scale,
      useHexCenter: query.useHexCenter ?? false,
      parentCells,
    });

    // H3: calculate hex circumradius in pixels so circles fit inside hexagons
    let hexRadiusPx: number | undefined;
    let h3Res: number | undefined;
    if (algorithm === "h3") {
      h3Res = Math.min(15, Math.max(2, Math.round(query.zoom * h3Scale)));
      const edgeMeters: Record<number, number> = {
        2: 183000,
        3: 69000,
        4: 26000,
        5: 9900,
        6: 3700,
        7: 1400,
        8: 531,
        9: 201,
        10: 76,
        11: 29,
        12: 11,
        13: 4,
        14: 1.5,
        15: 0.5,
      };
      const centerLat = (bounds.south + bounds.north) / 2;
      const groundRes = (156543.03 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, query.zoom);
      hexRadiusPx = (edgeMeters[h3Res] ?? 100) / groundRes;
    }

    const features = transformResultToFeatures(result.rows, hexRadiusPx, h3Res);
    return { type: "FeatureCollection", features };
  },
});

type StringOrNumber = string | number;

interface ClusterRow {
  longitude: StringOrNumber;
  latitude: StringOrNumber;
  event_count: StringOrNumber;
  cluster_id: StringOrNumber | null;
  event_id: StringOrNumber | null;
  event_title: string | null;
  source_cells: string[] | null;
  location_count: StringOrNumber | null;
  location_name: string | null;
}

interface ClusteringOptions {
  targetClusters?: number;
  algorithm?: string;
  minPoints?: number;
  mergeOverlapping?: boolean;
  h3ResolutionScale?: number;
  useHexCenter?: boolean;
  parentCells?: string[];
}

const executeClusteringQuery = async (
  payload: Payload,
  bounds: MapBounds,
  zoom: number,
  filters: CanonicalEventFilters,
  opts: ClusteringOptions = {}
) => {
  const {
    targetClusters = 60,
    algorithm = "h3",
    minPoints = 2,
    mergeOverlapping = false,
    h3ResolutionScale = 0.6,
    useHexCenter = false,
    parentCells,
  } = opts;
  const parentCellsParam = parentCells?.length ? `{${parentCells.join(",")}}` : null;
  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM cluster_events(
      ${bounds.west}::double precision,
      ${bounds.south}::double precision,
      ${bounds.east}::double precision,
      ${bounds.north}::double precision,
      ${zoom}::integer,
      ${toClusteringJsonb(filters)}::jsonb,
      ${targetClusters}::integer,
      ${algorithm}::text,
      ${minPoints}::integer,
      ${mergeOverlapping}::boolean,
      ${h3ResolutionScale}::double precision,
      ${parentCellsParam}::text[],
      ${useHexCenter}::boolean
    )
  `)) as unknown as { rows: ClusterRow[] };
};

/** H3 r15 is the "location" resolution — features at this level are locations, not clusters. */
const LOCATION_RESOLUTION = 15;

const hasValidCoords = (row: ClusterRow) => {
  const hasLon = typeof row.longitude === "string" || typeof row.longitude === "number";
  const hasLat = typeof row.latitude === "string" || typeof row.latitude === "number";
  return hasLon && hasLat;
};

const parseCoords = (row: ClusterRow): [number, number] => [
  Number.parseFloat(String(row.longitude)),
  Number.parseFloat(String(row.latitude)),
];

const buildSharedProps = (row: ClusterRow, hexRadiusPx?: number) => ({
  ...(row.location_name != null ? { locationName: row.location_name } : {}),
  ...(row.event_title != null ? { title: row.event_title } : {}),
  ...(hexRadiusPx != null ? { hexRadius: Math.round(hexRadiusPx) } : {}),
});

/** Transform a row into an event-location feature (finest H3 resolution). */
const buildLocationFeature = (row: ClusterRow, hexRadiusPx?: number) => {
  const count = Number(row.event_count);
  const eventId = row.event_id != null ? Number(row.event_id) : undefined;
  return {
    type: "Feature",
    id: row.cluster_id ?? eventId,
    geometry: { type: "Point", coordinates: parseCoords(row) },
    properties: {
      type: "event-location" as const,
      count,
      h3Cell: String(row.cluster_id),
      ...(count === 1 && eventId != null ? { eventId } : {}),
      ...buildSharedProps(row, hexRadiusPx),
    },
  };
};

/** Transform a row into an event-cluster or single-event-location feature. */
const buildClusterFeature = (row: ClusterRow, hexRadiusPx?: number) => {
  const count = Number(row.event_count);
  const eventId = row.event_id != null ? Number(row.event_id) : undefined;
  const locationCount = row.location_count != null ? Number(row.location_count) : undefined;
  const isCluster = count > 1;

  return {
    type: "Feature",
    id: isCluster ? row.cluster_id : eventId,
    geometry: { type: "Point", coordinates: parseCoords(row) },
    properties: {
      type: isCluster ? ("event-cluster" as const) : ("event-location" as const),
      ...(isCluster
        ? { count, clusterId: String(row.cluster_id), ...(locationCount != null ? { locationCount } : {}) }
        : { count: 1, h3Cell: String(row.cluster_id), ...(eventId != null ? { eventId } : {}) }),
      ...buildSharedProps(row, hexRadiusPx),
      ...(row.source_cells != null && row.source_cells.length > 1 ? { sourceCells: row.source_cells } : {}),
    },
  };
};

/**
 * Transform SQL rows into GeoJSON features.
 *
 * When h3Res >= 15 (location resolution), each row becomes an `event-location`.
 * At coarser resolutions, rows become `event-cluster` with a `locationCount`.
 */
const transformResultToFeatures = (rows: ClusterRow[], hexRadiusPx?: number, h3Res?: number) => {
  const isLocationRes = h3Res != null && h3Res >= LOCATION_RESOLUTION;
  return rows
    .filter(hasValidCoords)
    .map((row) => (isLocationRes ? buildLocationFeature(row, hexRadiusPx) : buildClusterFeature(row, hexRadiusPx)));
};
