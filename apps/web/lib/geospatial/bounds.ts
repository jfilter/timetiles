/**
 * Geographic bounds utilities.
 *
 * Functions for working with map bounds, including validation, parsing,
 * and spatial containment checks.
 *
 * @module
 * @category Geospatial
 */

import { NextResponse } from "next/server";

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
export const isValidBounds = (value: unknown): value is MapBounds =>
  typeof value === "object" &&
  value != null &&
  typeof (value as Record<string, unknown>).north === "number" &&
  typeof (value as Record<string, unknown>).south === "number" &&
  typeof (value as Record<string, unknown>).east === "number" &&
  typeof (value as Record<string, unknown>).west === "number";

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
 * Result type for safe bounds parsing with discriminated union.
 *
 * Allows type-safe error handling without exceptions. If parsing succeeds,
 * returns an object with `bounds`. If parsing fails, returns an object
 * with `error` containing a NextResponse.
 */
export type ParseBoundsResult = { bounds: MapBounds | null; error?: never } | { bounds?: never; error: NextResponse };

/**
 * Safely parse bounds parameter with type-safe error handling.
 *
 * Returns a discriminated union that either contains valid bounds or
 * an error response. This pattern enables type-safe error handling
 * without exceptions.
 *
 * @param boundsParam - Optional JSON string representation of bounds
 * @returns Discriminated union with either bounds or error response
 *
 * @example
 * ```typescript
 * const result = parseBoundsParameter(request.nextUrl.searchParams.get("bounds"));
 * if ("error" in result) {
 *   return result.error; // Type: NextResponse
 * }
 * // result.bounds is now type MapBounds | null
 * const { bounds } = result;
 * ```
 */
export const parseBoundsParameter = (boundsParam: string | null): ParseBoundsResult => {
  if (boundsParam == null || boundsParam === "") {
    return { bounds: null };
  }

  try {
    return { bounds: parseBounds(boundsParam) };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid bounds format. Expected: {north, south, east, west}" },
        { status: 400 }
      ),
    };
  }
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
  point.longitude >= bounds.west &&
  point.longitude <= bounds.east;

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
    north: center.latitude + radiusDeg,
    south: center.latitude - radiusDeg,
    east: center.longitude + radiusDeg,
    west: center.longitude - radiusDeg,
  };
};
