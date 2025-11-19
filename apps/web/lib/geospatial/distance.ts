/**
 * Distance calculation utilities.
 *
 * Functions for calculating distances between coordinates using the
 * Haversine formula, finding centroids, and analyzing spatial distributions.
 *
 * @module
 * @category Geospatial
 */

import type { Coordinates } from "./types";
import { EARTH_RADIUS_KM } from "./types";

/**
 * Calculate the distance between two points using the Haversine formula.
 *
 * The Haversine formula determines the great-circle distance between two
 * points on a sphere given their longitudes and latitudes. This is useful
 * for calculating distances on Earth's surface.
 *
 * @param point1 - First coordinate point
 * @param point2 - Second coordinate point
 * @returns Distance between the two points in kilometers
 *
 * @example
 * ```typescript
 * const distance = calculateDistance(
 *   { latitude: 40.7128, longitude: -74.0060 },  // New York
 *   { latitude: 51.5074, longitude: -0.1278 }    // London
 * );
 * // Returns approximately 5570 km
 * ```
 */
export const calculateDistance = (point1: Coordinates, point2: Coordinates): number => {
  const dLat = (point2.latitude - point1.latitude) * (Math.PI / 180);
  const dLon = (point2.longitude - point1.longitude) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.latitude * (Math.PI / 180)) *
      Math.cos(point2.latitude * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * Calculate the center point (centroid) of multiple coordinates.
 *
 * Computes the arithmetic mean of all latitudes and longitudes to find
 * the geographic center of a set of points. Note that this is a simple
 * arithmetic mean and does not account for Earth's curvature.
 *
 * @param points - Array of coordinate points
 * @returns Centroid coordinate
 * @throws {Error} If points array is empty
 *
 * @example
 * ```typescript
 * const centroid = calculateCentroid([
 *   { latitude: 40.0, longitude: -74.0 },
 *   { latitude: 41.0, longitude: -74.0 },
 *   { latitude: 40.5, longitude: -75.0 }
 * ]);
 * // Returns approximately { latitude: 40.5, longitude: -74.33 }
 * ```
 */
export const calculateCentroid = (points: Coordinates[]): Coordinates => {
  if (points.length === 0) {
    throw new Error("Cannot calculate centroid of empty array");
  }

  const sum = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
};

/**
 * Find the maximum distance between any two points in an array.
 *
 * Compares all pairs of points to find the greatest distance.
 * Useful for determining the spatial extent of a dataset.
 *
 * @param points - Array of coordinate points
 * @returns Maximum distance in kilometers (0 if fewer than 2 points)
 *
 * @example
 * ```typescript
 * const maxDist = findMaxDistance([
 *   { latitude: 40.7128, longitude: -74.0060 },
 *   { latitude: 51.5074, longitude: -0.1278 },
 *   { latitude: 35.6762, longitude: 139.6503 }
 * ]);
 * // Returns the longest distance among all pairs
 * ```
 */
export const findMaxDistance = (points: Coordinates[]): number => {
  if (points.length < 2) return 0;

  let maxDistance = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      if (!pointI || !pointJ) continue;
      const distance = calculateDistance(pointI, pointJ);
      if (distance > maxDistance) {
        maxDistance = distance;
      }
    }
  }

  return maxDistance;
};
