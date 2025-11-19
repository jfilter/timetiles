/**
 * Geospatial type definitions.
 *
 * Core types and interfaces for working with geographic coordinates,
 * bounds, and spatial data throughout the application.
 *
 * @module
 * @category Geospatial
 */

/**
 * Represents a geographic coordinate with latitude and longitude.
 */
export interface Coordinates {
  /** Latitude in decimal degrees (-90 to 90) */
  latitude: number;
  /** Longitude in decimal degrees (-180 to 180) */
  longitude: number;
}

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
 * Represents a sampled coordinate during import processing.
 */
export interface CoordinateSample {
  lat: number | null;
  lon: number | null;
  isValid: boolean;
  originalValues: {
    lat: string;
    lon: string;
  };
}

/**
 * Statistics for analyzing coordinate columns during import.
 */
export interface CoordinateStats {
  validCoords: number;
  latOnly: number;
  lonOnly: number;
  total: number;
  samples: number[];
}

/**
 * Earth's radius in kilometers (used for distance calculations).
 */
export const EARTH_RADIUS_KM = 6371;

/**
 * Re-export ParseBoundsResult from bounds for convenience.
 */
export type { ParseBoundsResult } from "./bounds";
