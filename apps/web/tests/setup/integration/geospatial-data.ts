/**
 * Geospatial test helpers.
 *
 * Test-specific utilities for generating random geospatial test data,
 * validating data distributions, and creating test scenarios.
 *
 * Re-exports production geospatial utilities from @/lib/geospatial for convenience.
 *
 * @module
 * @category Test Utilities
 */

import type { Coordinates } from "@/lib/geospatial";
import { areValidCoordinates, calculateCentroid, calculateDistance, findMaxDistance } from "@/lib/geospatial";

// Re-export production utilities for test convenience
export { areValidCoordinates, calculateCentroid, calculateDistance, isWithinBounds } from "@/lib/geospatial";

/**
 * Test coordinates for common locations.
 */
export const TEST_COORDINATES = {
  NYC: { latitude: 40.7128, longitude: -74.006 },
  LONDON: { latitude: 51.5074, longitude: -0.1278 },
  TOKYO: { latitude: 35.6762, longitude: 139.6503 },
  SYDNEY: { latitude: -33.8688, longitude: 151.2093 },
  SAN_FRANCISCO: { latitude: 37.7749, longitude: -122.4194 },
  BERLIN: { latitude: 52.52, longitude: 13.405 },
  // Test bounds
  NYC_METRO: {
    north: 41.2,
    south: 40.3,
    east: -73.4,
    west: -74.3,
  },
  WORLD: {
    north: 85,
    south: -85,
    east: 180,
    west: -180,
  },
} as const;

/**
 * Generate a random coordinate near a center point within a radius.
 *
 * @param center - Center coordinate
 * @param radiusKm - Maximum radius in kilometers
 * @returns Random coordinate within radius
 */
export const generateNearbyCoordinate = (center: Coordinates, radiusKm: number): Coordinates => {
  const radiusDeg = radiusKm / 111; // 1 degree ≈ 111 km
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusDeg;

  return {
    latitude: center.latitude + distance * Math.cos(angle),
    longitude: center.longitude + distance * Math.sin(angle),
  };
};

/**
 * Create a cluster of random points around a center.
 *
 * @param center - Center coordinate
 * @param count - Number of points to generate
 * @param radiusKm - Maximum radius for points
 * @returns Array of coordinates forming a cluster
 */
export const createCluster = (center: Coordinates, count: number, radiusKm: number): Coordinates[] =>
  Array.from({ length: count }, () => generateNearbyCoordinate(center, radiusKm));

/**
 * Create multiple clusters in different locations.
 *
 * @param centers - Array of center coordinates
 * @param pointsPerCluster - Number of points per cluster
 * @param clusterRadiusKm - Radius for each cluster
 * @returns Array of coordinate arrays, one per cluster
 */
export const createMultipleClusters = (
  centers: Coordinates[],
  pointsPerCluster: number,
  clusterRadiusKm: number
): Coordinates[][] => centers.map((center) => createCluster(center, pointsPerCluster, clusterRadiusKm));

/**
 * Validate the distribution of test coordinate data.
 *
 * Checks for common issues like invalid coordinates, suspicious clustering,
 * or unrealistic spreads.
 *
 * @param points - Array of coordinates to validate
 * @returns Validation results with issues and metrics
 */
export const validateDistribution = (
  points: Coordinates[]
): {
  isValid: boolean;
  centroid: Coordinates;
  maxDistance: number;
  averageDistance: number;
  issues: string[];
} => {
  const issues: string[] = [];

  // Check for valid coordinates
  const invalidPoints = points.filter((p) => !areValidCoordinates(p));
  if (invalidPoints.length > 0) {
    issues.push(`${invalidPoints.length} invalid coordinate(s) found`);
  }

  // Calculate distribution metrics
  const centroid = calculateCentroid(points);
  const maxDistance = findMaxDistance(points);

  const distances = points.flatMap((point, i) =>
    points.slice(i + 1).map((otherPoint) => calculateDistance(point, otherPoint))
  );
  const averageDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;

  // Check for clustering (points too close together)
  const veryClosePoints = distances.filter((d) => d < 0.001).length; // Less than 1 meter
  if (veryClosePoints > points.length * 0.1) {
    issues.push(`${veryClosePoints} pairs of points are suspiciously close (< 1m)`);
  }

  // Check for unrealistic spread
  if (maxDistance > 20000) {
    // More than half the Earth's circumference
    issues.push(`Maximum distance ${maxDistance.toFixed(2)}km is unrealistically large`);
  }

  return {
    isValid: issues.length === 0 && invalidPoints.length === 0,
    centroid,
    maxDistance,
    averageDistance,
    issues,
  };
};
