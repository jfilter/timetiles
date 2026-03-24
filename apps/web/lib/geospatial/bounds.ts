/**
 * Geographic bounds utilities.
 *
 * Functions for working with map bounds, including validation, parsing,
 * and spatial containment checks.
 *
 * @module
 * @category Geospatial
 */

import type { Coordinates, MapBounds } from "./types";

/**
 * Type guard to validate MapBounds objects at runtime.
 *
 * Ensures an unknown value conforms to the MapBounds interface by
 * checking that all required properties exist and are numbers.
 *
 * @param value - The value to validate
 * @returns True if the value is a valid MapBounds object
 *
 * @example
 * ```typescript
 * if (isValidBounds(parsedData)) {
 *   // TypeScript now knows parsedData is MapBounds
 *   const { north, south, east, west } = parsedData;
 * }
 * ```
 */
export const isValidBounds = (value: unknown): value is MapBounds => {
  if (typeof value !== "object" || value == null) return false;

  const { north, south, east, west } = value as Record<string, unknown>;

  // All fields must be finite numbers (rejects NaN, Infinity, -Infinity)
  if (
    typeof north !== "number" ||
    typeof south !== "number" ||
    typeof east !== "number" ||
    typeof west !== "number" ||
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west)
  ) {
    return false;
  }

  // Validate coordinate ranges and north > south
  return north > south && north <= 90 && south >= -90 && east <= 180 && west >= -180;
};

/**
 * Parses a JSON string into a MapBounds object with validation.
 *
 * Converts a JSON string representation of map bounds into a typed
 * MapBounds object. Throws an error if the JSON is invalid or the
 * resulting object doesn't conform to MapBounds.
 *
 * @param boundsParam - JSON string representation of bounds
 * @returns Validated MapBounds object
 * @throws {Error} If JSON parsing fails or bounds are invalid
 *
 * @example
 * ```typescript
 * const bounds = parseBounds('{"north":37.8,"south":37.7,"east":-122.4,"west":-122.5}');
 * // bounds is now type MapBounds
 * ```
 */
export const parseBounds = (boundsParam: string): MapBounds => {
  const parsed = JSON.parse(boundsParam) as unknown;
  if (!isValidBounds(parsed)) {
    throw new Error("Invalid bounds format. Expected: {north, south, east, west}");
  }
  return parsed;
};

/**
 * Check if a point is within a bounding box.
 *
 * Determines whether a coordinate point falls within the specified
 * geographic bounds.
 *
 * @param point - Coordinate to check
 * @param bounds - Bounding box to check against
 * @returns True if point is within bounds
 *
 * @example
 * ```typescript
 * const point = { latitude: 40.7, longitude: -74.0 };
 * const bounds = { north: 41, south: 40, east: -73, west: -75 };
 * const isInside = isWithinBounds(point, bounds); // true
 * ```
 */
export const isWithinBounds = (point: Coordinates, bounds: MapBounds): boolean =>
  point.latitude >= bounds.south &&
  point.latitude <= bounds.north &&
  (bounds.west <= bounds.east
    ? point.longitude >= bounds.west && point.longitude <= bounds.east
    : point.longitude >= bounds.west || point.longitude <= bounds.east);

const clampLatitude = (latitude: number): number => Math.max(-90, Math.min(90, latitude));

const normalizeLongitude = (longitude: number): number => {
  if (longitude >= -180 && longitude <= 180) {
    return longitude;
  }

  const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && longitude > 0 ? 180 : normalized;
};

/**
 * Create a bounding box around a center point with given radius.
 *
 * Generates a rectangular bounding box centered on a point, extending
 * the specified radius in all directions. Uses a rough approximation
 * of 1 degree ≈ 111 km.
 *
 * @param center - Center coordinate
 * @param radiusKm - Radius in kilometers
 * @returns Bounding box around the center point
 *
 * @example
 * ```typescript
 * const bounds = createBoundingBox(
 *   { latitude: 40.7128, longitude: -74.0060 },
 *   10 // 10 km radius
 * );
 * // Returns bounds approximately 10km in each direction
 * ```
 */
export const createBoundingBox = (center: Coordinates, radiusKm: number): MapBounds => {
  const radiusDeg = radiusKm / 111; // Rough conversion: 1 degree ≈ 111 km

  return {
    north: clampLatitude(center.latitude + radiusDeg),
    south: clampLatitude(center.latitude - radiusDeg),
    east: normalizeLongitude(center.longitude + radiusDeg),
    west: normalizeLongitude(center.longitude - radiusDeg),
  };
};
