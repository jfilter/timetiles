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
export type { Coordinates, CoordinateSample, CoordinateStats, MapBounds, ParseBoundsResult } from "./types";
export { EARTH_RADIUS_KM } from "./types";

// Validation
export {
  areValidCoordinates,
  categorizeCoordinateValue,
  isValidCoordinate,
  isValidLatitude,
  isValidLatitudeCandidate,
  isValidLongitude,
  isValidLongitudeCandidate,
  valueToString,
} from "./validation";

// Distance calculations
export { calculateCentroid, calculateDistance, findMaxDistance } from "./distance";

// Bounds utilities
export { createBoundingBox, isValidBounds, isWithinBounds, parseBounds, parseBoundsParameter } from "./bounds";
