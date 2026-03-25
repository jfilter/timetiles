/**
 * Geospatial utilities module.
 *
 * Comprehensive geospatial utilities for working with coordinates, distances,
 * bounds, and spatial data validation. Used across import services, API routes,
 * and testing infrastructure.
 *
 * @module
 * @category Geospatial
 */

// Types
export type { Coordinates, CoordinateSample, CoordinateStats, MapBounds } from "./types";
export { EARTH_RADIUS_KM } from "./types";

// Validation
export { areValidCoordinates, isValidCoordinate, valueToString } from "./validation";

// Distance calculations
export { calculateCentroid, calculateDistance, findMaxDistance } from "./distance";

// Bounds utilities
export { createBoundingBox, isValidBounds, isWithinBounds, parseBounds } from "./bounds";

// Coordinate parsing — sub-format parsers and detection helpers are
// exported directly from ./parsing and ./detection for consumers that
// need them (tests, schema-detection).  Only the high-level
// parseCoordinate is re-exported here.

// Formatting
export { formatCenterCoordinates, formatCoordinate, formatEventCount, getCenterFromBounds } from "./formatting";

// Patterns for coordinate detection
export {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "./patterns";
