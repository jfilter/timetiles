/**
 * Converts GeoJSON FeatureCollections to CSV format for the import pipeline.
 *
 * Handles flattening of feature properties into CSV columns, extracting
 * centroid coordinates from geometry, and WFS URL normalization.
 *
 * @module
 * @category Import
 */
import { logger } from "@/lib/logger";
import { unparseRowsToCsv } from "@/lib/utils/csv-escape";

import { flattenObject, stripExcludedFieldsFromRecords } from "./json-to-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeoJsonToCsvResult {
  csv: Buffer;
  featureCount: number;
  geometryTypes: string[];
}

export interface GeoJsonToCsvOptions {
  /** Fields to remove after GeoJSON properties are flattened. */
  excludeFields?: string[];
}

interface GeoJsonGeometry {
  type: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
}

interface GeoJsonFeature {
  type: "Feature";
  id?: string | number;
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown> | null;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Extract centroid coordinates from a GeoJSON geometry.
 *
 * Uses bounding-box centroid for polygons and lines (avoids a Turf.js
 * dependency while being accurate enough for event-level mapping).
 *
 * @returns `{ latitude, longitude }` or `null` if geometry is missing/invalid.
 */
/**
 * Coerce a geometry `coordinates` value to an array. A typed geometry with
 * null/absent coordinates (real in WFS/GIS exports) would otherwise throw on
 * `.flat()`/`.flatMap()` and abort the whole conversion. Keeping the guard in a
 * helper (rather than an inline branch per case) keeps extractCentroid's
 * cyclomatic complexity within bounds.
 */
const coordArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const extractCentroid = (geometry: GeoJsonGeometry | null): { latitude: number; longitude: number } | null => {
  if (!geometry?.type) return null;

  switch (geometry.type) {
    case "Point": {
      const coords = geometry.coordinates as [number, number];
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return { latitude: coords[1], longitude: coords[0] };
    }

    case "MultiPoint": {
      const points = geometry.coordinates as [number, number][];
      if (!Array.isArray(points) || points.length === 0) return null;
      // Longitudes are averaged in the unwrapped frame so a set straddling the
      // dateline averages to ±180, not to 0 (see unwrapLongitudes).
      const lngs = unwrapLongitudes(points.map((p) => p[0] ?? 0));
      const latSum = points.reduce((acc, p) => acc + (p[1] ?? 0), 0);
      const lngSum = lngs.reduce((acc, lng) => acc + lng, 0);
      return { latitude: latSum / points.length, longitude: normalizeLongitude(lngSum / lngs.length) };
    }

    case "LineString": {
      const lineCoords = geometry.coordinates as [number, number][];
      return bboxCentroid(lineCoords);
    }

    case "MultiLineString": {
      const lines = coordArray(geometry.coordinates) as [number, number][][];
      return bboxCentroid(lines.flat());
    }

    case "Polygon": {
      // Use outer ring (first ring) for centroid
      const rings = geometry.coordinates as [number, number][][];
      if (!Array.isArray(rings) || rings.length === 0) return null;
      return bboxCentroid(rings[0] ?? []);
    }

    case "MultiPolygon": {
      const polygons = coordArray(geometry.coordinates) as [number, number][][][];
      const allCoords = polygons.flatMap((poly) => poly[0] ?? []);
      return bboxCentroid(allCoords);
    }

    case "GeometryCollection": {
      // Use first geometry's centroid
      if (Array.isArray(geometry.geometries) && geometry.geometries.length > 0) {
        return extractCentroid(geometry.geometries[0] ?? null);
      }
      return null;
    }

    default:
      return null;
  }
};

/**
 * Wrap a longitude back into (-180, 180].
 *
 * The antimeridian itself is reported as +180 rather than -180 (they name the
 * same meridian) so an unwrapped centroid that lands exactly on it does not
 * flip sign relative to the input coordinates.
 */
const normalizeLongitude = (lng: number): number => {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  if (wrapped === -180) return 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
};

/**
 * Rewrite longitudes into a continuous frame that may extend past ±180.
 *
 * Longitude is cyclic, so plain min/max (or a plain mean) puts a geometry
 * straddling the antimeridian — e.g. a Fiji or Chukotka polygon with vertices
 * at 179 and -179 — at longitude 0, dropping the feature in the Gulf of Guinea
 * half a world away.
 *
 * The shortest arc covering the points is found by locating the LARGEST gap
 * between consecutive sorted longitudes (including the wrap-around gap): that
 * gap is the empty side of the circle, so the points span the complement. Every
 * longitude before the gap's end is shifted by +360 so the whole set is
 * monotonic and ordinary min/max/mean arithmetic works.
 *
 * Using the largest gap rather than a fixed ">180 span means it crosses" test
 * keeps ordinary wide geometries (a country spanning 40° of longitude) untouched.
 */
const unwrapLongitudes = (lngs: number[]): number[] => {
  if (lngs.length < 2) return lngs;

  const sorted = [...lngs].sort((a, b) => a - b);
  let gapStart = sorted[sorted.length - 1]!;
  let largestGap = sorted[0]! + 360 - gapStart;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap > largestGap) {
      largestGap = gap;
      gapStart = sorted[i - 1]!;
    }
  }

  // The wrap-around gap is the largest: the points already form one contiguous
  // run, nothing to shift.
  if (gapStart === sorted[sorted.length - 1]!) return lngs;

  return lngs.map((lng) => (lng <= gapStart ? lng + 360 : lng));
};

/** Compute the center of a bounding box from an array of [lng, lat] coordinates. */
const bboxCentroid = (coords: [number, number][]): { latitude: number; longitude: number } | null => {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  // Non-finite vertices are skipped rather than poisoning the bounds (a single
  // NaN would otherwise make every comparison below false).
  // Number.isFinite (not the global) — the global coerces, so `isFinite(null)`
  // is true and a null vertex would sneak in as 0.
  const valid = coords.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (valid.length === 0) return null;

  const lngs = unwrapLongitudes(valid.map(([lng]) => lng));

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  // Explicit loops (not Math.min(...spread)) — detailed WFS rings can carry
  // hundreds of thousands of vertices and blow the argument limit.
  for (const [index, [, lat]] of valid.entries()) {
    const lng = lngs[index]!;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (!isFinite(minLng) || !isFinite(minLat)) return null;

  return { latitude: (minLat + maxLat) / 2, longitude: normalizeLongitude((minLng + maxLng) / 2) };
};

// ---------------------------------------------------------------------------
// Content sniffing
// ---------------------------------------------------------------------------

/**
 * Flatten a single GeoJSON feature into a plain record.
 *
 * Extracts properties, centroid coordinates (as latitude/longitude),
 * and preserves `feature.id` as `_feature_id`.
 */
export const flattenGeoJsonFeature = (feature: GeoJsonFeature): Record<string, unknown> => {
  const row = flattenObject(feature.properties ?? {});

  const centroid = extractCentroid(feature.geometry);
  if (centroid) {
    row.latitude = centroid.latitude;
    row.longitude = centroid.longitude;
  }

  if (feature.id != null) {
    row._feature_id = feature.id;
  }

  return row;
};

/**
 * Check whether a parsed JSON value looks like GeoJSON.
 *
 * Returns `true` for `FeatureCollection` with a `features` array or a
 * single `Feature` with a `geometry` property.
 */
export const isGeoJson = (data: unknown): boolean => {
  if (data === null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) return true;
  if (obj.type === "Feature" && "geometry" in obj) return true;

  return false;
};

/**
 * Check whether a Buffer contains GeoJSON by parsing and sniffing.
 * Returns false on parse errors rather than throwing.
 */
export const isGeoJsonBuffer = (buffer: Buffer): boolean => {
  try {
    const data: unknown = JSON.parse(buffer.toString("utf-8"));
    return isGeoJson(data);
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

/**
 * Convert a GeoJSON buffer to CSV.
 *
 * Flattens feature properties into columns, extracts centroid coordinates
 * from geometry as `latitude` / `longitude` columns, and optionally
 * preserves `feature.id` as `_feature_id`.
 *
 * @param buffer - Raw GeoJSON bytes
 * @returns The generated CSV as a Buffer together with metadata
 * @throws {Error} When JSON cannot be parsed or is not valid GeoJSON
 */
export const convertGeoJsonToCsv = (buffer: Buffer, options?: GeoJsonToCsvOptions): GeoJsonToCsvResult => {
  const data: unknown = JSON.parse(buffer.toString("utf-8"));

  let featureCollection: GeoJsonFeatureCollection;

  if (isFeatureCollection(data)) {
    featureCollection = data;
  } else if (isFeature(data)) {
    featureCollection = { type: "FeatureCollection", features: [data] };
  } else {
    throw new Error("Not a valid GeoJSON FeatureCollection or Feature.");
  }

  const { features } = featureCollection;

  if (features.length === 0) {
    throw new Error("GeoJSON FeatureCollection contains no features.");
  }

  const geometryTypes = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (const feature of features) {
    if (feature.geometry?.type) {
      geometryTypes.add(feature.geometry.type);
    }
    rows.push(flattenGeoJsonFeature(feature));
  }

  // No formula-escaping: this is canonical ingest data that the pipeline
  // re-parses into events (an apostrophe would become literal data, not
  // display). Formula-injection escaping (CWE-1236) belongs at the user-facing
  // export boundary — see escapeCsvFormula in lib/utils/csv-escape.ts.
  const strippedRows = stripExcludedFieldsFromRecords(rows, options?.excludeFields);
  const csvString = unparseRowsToCsv(strippedRows);
  const csv = Buffer.from(csvString, "utf-8");

  logger.info(
    { featureCount: features.length, geometryTypes: [...geometryTypes] },
    "geojson-to-csv: converted %d features",
    features.length
  );

  return { csv, featureCount: features.length, geometryTypes: [...geometryTypes] };
};

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

const isFeatureCollection = (data: unknown): data is GeoJsonFeatureCollection =>
  data !== null &&
  typeof data === "object" &&
  (data as Record<string, unknown>).type === "FeatureCollection" &&
  Array.isArray((data as Record<string, unknown>).features);

const isFeature = (data: unknown): data is GeoJsonFeature =>
  data !== null &&
  typeof data === "object" &&
  (data as Record<string, unknown>).type === "Feature" &&
  "geometry" in (data as Record<string, unknown>);

// ---------------------------------------------------------------------------
// WFS URL normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a WFS URL to ensure it returns GeoJSON.
 *
 * Adds missing `service`, `request`, `version`, and `outputFormat`
 * parameters so the endpoint returns `application/json` (GeoJSON).
 */
export const normalizeWfsUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const params = parsed.searchParams;
  const pathLower = parsed.pathname.toLowerCase();

  // Only normalize if this looks like a WFS endpoint
  const hasWfsPath = pathLower.includes("/wfs/") || pathLower.endsWith("/wfs");
  const hasWfsParam = params.get("service")?.toUpperCase() === "WFS";

  if (!hasWfsPath && !hasWfsParam) return url;

  // Add missing WFS parameters
  if (!params.has("service")) {
    params.set("service", "WFS");
  }
  if (!params.has("version")) {
    params.set("version", "2.0.0");
  }
  if (!params.has("request")) {
    params.set("request", "GetFeature");
  }
  if (!params.has("outputFormat")) {
    params.set("outputFormat", "application/json");
  }

  return parsed.toString();
};
