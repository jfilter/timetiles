/**
 * Geospatial type definitions and utility functions for map and location features.
 *
 * This module provides shared types and validation functions for working with
 * geographic data, including map bounds, coordinates, and spatial queries.
 * Used across API routes for consistent geospatial data handling.
 *
 * @module
 * @category Types
 */
import { NextResponse } from "next/server";

/**
 * Represents geographic bounds for map viewport queries.
 *
 * Defines a rectangular geographic area using latitude and longitude
 * coordinates. Used for filtering events within map bounds and
 * spatial queries.
 *
 * @example
 * ```typescript
 * const bounds: MapBounds = {
 *   north: 37.8,
 *   south: 37.7,
 *   east: -122.4,
 *   west: -122.5
 * };
 * ```
 */
export interface MapBounds {
  /** Northern latitude boundary (maximum latitude) */
  north: number;
  /** Southern latitude boundary (minimum latitude) */
  south: number;
  /** Eastern longitude boundary (maximum longitude) */
  east: number;
  /** Western longitude boundary (minimum longitude) */
  west: number;
}

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
