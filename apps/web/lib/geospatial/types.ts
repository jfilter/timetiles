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
