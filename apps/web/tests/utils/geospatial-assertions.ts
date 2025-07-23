/**
 * Geospatial Assertion Helpers - Phase 2.3 Implementation
 *
 * Custom assertion helpers for geospatial data testing.
 * Extends Vitest's expect with specialized matchers for coordinates,
 * distances, and geospatial relationships.
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger("geo-assertions");

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Calculate the distance between two points using the Haversine formula
 */
export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates,
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (point2.latitude - point1.latitude) * (Math.PI / 180);
  const dLon = (point2.longitude - point1.longitude) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.latitude * (Math.PI / 180)) *
      Math.cos(point2.latitude * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Check if a point is within a bounding box
 */
export function isWithinBounds(
  point: Coordinates,
  bounds: BoundingBox,
): boolean {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

/**
 * Generate a random point within a radius of a center point
 */
export function generateRandomPointWithinRadius(
  center: Coordinates,
  radiusKm: number,
): Coordinates {
  const radiusDeg = radiusKm / 111; // Rough conversion: 1 degree ≈ 111 km
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusDeg;

  return {
    latitude: center.latitude + distance * Math.cos(angle),
    longitude: center.longitude + distance * Math.sin(angle),
  };
}

/**
 * Create a bounding box around a center point with given radius
 */
export function createBoundingBox(
  center: Coordinates,
  radiusKm: number,
): BoundingBox {
  const radiusDeg = radiusKm / 111; // Rough conversion

  return {
    north: center.latitude + radiusDeg,
    south: center.latitude - radiusDeg,
    east: center.longitude + radiusDeg,
    west: center.longitude - radiusDeg,
  };
}

/**
 * Calculate the center point of multiple coordinates
 */
export function calculateCentroid(points: Coordinates[]): Coordinates {
  if (points.length === 0) {
    throw new Error("Cannot calculate centroid of empty array");
  }

  const sum = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}

/**
 * Find the furthest distance between any two points in an array
 */
export function findMaxDistance(points: Coordinates[]): number {
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
}

/**
 * Check if coordinates are valid (within Earth's bounds)
 */
export function areValidCoordinates(coords: Coordinates): boolean {
  return (
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180 &&
    !isNaN(coords.latitude) &&
    !isNaN(coords.longitude)
  );
}

// Extend Vitest's expect with custom geospatial matchers
declare module "vitest" {
  interface Assertion<T = any> {
    toBeWithinRadius(center: Coordinates, radiusKm: number): T;
    toHaveValidCoordinates(): T;
    toBeWithinBounds(bounds: BoundingBox): T;
    toBeCloserThan(other: Coordinates, maxDistanceKm: number): T;
    toBeFurtherThan(other: Coordinates, minDistanceKm: number): T;
    toHaveCoordinatesNear(expected: Coordinates, toleranceKm?: number): T;
    toBeACentroidOf(points: Coordinates[], toleranceKm?: number): T;
    toBeWithinCluster(points: Coordinates[], maxClusterRadiusKm: number): T;
  }

  interface AsymmetricMatchersContaining {
    toBeWithinRadius(center: Coordinates, radiusKm: number): any;
    toHaveValidCoordinates(): any;
    toBeWithinBounds(bounds: BoundingBox): any;
    toBeCloserThan(other: Coordinates, maxDistanceKm: number): any;
    toBeFurtherThan(other: Coordinates, minDistanceKm: number): any;
    toHaveCoordinatesNear(expected: Coordinates, toleranceKm?: number): any;
    toBeACentroidOf(points: Coordinates[], toleranceKm?: number): any;
    toBeWithinCluster(points: Coordinates[], maxClusterRadiusKm: number): any;
  }
}

// Extend expect with geospatial matchers
expect.extend({
  toBeWithinRadius(
    received: Coordinates | { location?: Coordinates },
    center: Coordinates,
    radiusKm: number,
  ) {
    // Handle both direct coordinates and objects with location property
    const coords = "latitude" in received ? received : received.location;

    if (
      !coords ||
      typeof coords.latitude !== "number" ||
      typeof coords.longitude !== "number"
    ) {
      return {
        pass: false,
        message: () =>
          `Expected to receive coordinates, but got: ${JSON.stringify(received)}`,
      };
    }

    const distance = calculateDistance(coords, center);
    const pass = distance <= radiusKm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates to NOT be within ${radiusKm}km of center, but was ${distance.toFixed(2)}km away`
          : `Expected coordinates to be within ${radiusKm}km of center, but was ${distance.toFixed(2)}km away`,
    };
  },

  toHaveValidCoordinates(received: Coordinates | { location?: Coordinates }) {
    // Handle both direct coordinates and objects with location property
    const coords = "latitude" in received ? received : received.location;

    if (!coords) {
      return {
        pass: false,
        message: () =>
          `Expected to receive coordinates, but location was undefined`,
      };
    }

    const isValid = areValidCoordinates(coords);
    const hasValidTypes =
      typeof coords.latitude === "number" &&
      typeof coords.longitude === "number";

    const pass = isValid && hasValidTypes;

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates to be invalid, but got valid coordinates: lat ${coords.latitude}, lng ${coords.longitude}`
          : `Expected valid coordinates, got lat: ${coords.latitude}, lng: ${coords.longitude}`,
    };
  },

  toBeWithinBounds(received: Coordinates, bounds: BoundingBox) {
    const pass = isWithinBounds(received, bounds);

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates to NOT be within bounds, but lat ${received.latitude}, lng ${received.longitude} was within bounds`
          : `Expected coordinates to be within bounds, but lat ${received.latitude}, lng ${received.longitude} was outside bounds`,
    };
  },

  toBeCloserThan(
    received: Coordinates,
    other: Coordinates,
    maxDistanceKm: number,
  ) {
    const distance = calculateDistance(received, other);
    const pass = distance < maxDistanceKm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected distance to be >= ${maxDistanceKm}km, but was ${distance.toFixed(2)}km`
          : `Expected distance to be < ${maxDistanceKm}km, but was ${distance.toFixed(2)}km`,
    };
  },

  toBeFurtherThan(
    received: Coordinates,
    other: Coordinates,
    minDistanceKm: number,
  ) {
    const distance = calculateDistance(received, other);
    const pass = distance > minDistanceKm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected distance to be <= ${minDistanceKm}km, but was ${distance.toFixed(2)}km`
          : `Expected distance to be > ${minDistanceKm}km, but was ${distance.toFixed(2)}km`,
    };
  },

  toHaveCoordinatesNear(
    received: Coordinates,
    expected: Coordinates,
    toleranceKm: number = 0.1,
  ) {
    const distance = calculateDistance(received, expected);
    const pass = distance <= toleranceKm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates to NOT be near expected coordinates within ${toleranceKm}km, but distance was ${distance.toFixed(4)}km`
          : `Expected coordinates to be near expected coordinates within ${toleranceKm}km, but distance was ${distance.toFixed(4)}km`,
    };
  },

  toBeACentroidOf(
    received: Coordinates,
    points: Coordinates[],
    toleranceKm: number = 1.0,
  ) {
    const actualCentroid = calculateCentroid(points);
    const distance = calculateDistance(received, actualCentroid);
    const pass = distance <= toleranceKm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates to NOT be the centroid of given points within ${toleranceKm}km, but distance from actual centroid was ${distance.toFixed(4)}km`
          : `Expected coordinates to be the centroid of given points within ${toleranceKm}km, but distance from actual centroid was ${distance.toFixed(4)}km`,
    };
  },

  toBeWithinCluster(
    received: Coordinates,
    points: Coordinates[],
    maxClusterRadiusKm: number,
  ) {
    const distancesToCluster = points.map((point) =>
      calculateDistance(received, point),
    );
    const minDistance = Math.min(...distancesToCluster);
    const pass = minDistance <= maxClusterRadiusKm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates to NOT be within cluster radius of ${maxClusterRadiusKm}km, but closest point was ${minDistance.toFixed(2)}km away`
          : `Expected coordinates to be within cluster radius of ${maxClusterRadiusKm}km, but closest point was ${minDistance.toFixed(2)}km away`,
    };
  },
});

/**
 * Helper class for creating complex geospatial test scenarios
 */
export class GeospatialTestHelper {
  /**
   * Create a cluster of points around a center
   */
  static createCluster(
    center: Coordinates,
    count: number,
    radiusKm: number,
  ): Coordinates[] {
    return Array.from({ length: count }, () =>
      generateRandomPointWithinRadius(center, radiusKm),
    );
  }

  /**
   * Create multiple clusters in different locations
   */
  static createMultipleClusters(
    centers: Coordinates[],
    pointsPerCluster: number,
    clusterRadiusKm: number,
  ): Coordinates[][] {
    return centers.map((center) =>
      this.createCluster(center, pointsPerCluster, clusterRadiusKm),
    );
  }

  /**
   * Create a grid of points for testing spatial queries
   */
  static createGrid(
    southWest: Coordinates,
    northEast: Coordinates,
    rows: number,
    cols: number,
  ): Coordinates[] {
    const points: Coordinates[] = [];
    const latStep = (northEast.latitude - southWest.latitude) / (rows - 1);
    const lngStep = (northEast.longitude - southWest.longitude) / (cols - 1);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        points.push({
          latitude: southWest.latitude + row * latStep,
          longitude: southWest.longitude + col * lngStep,
        });
      }
    }

    return points;
  }

  /**
   * Create a line of points between two coordinates
   */
  static createLine(
    start: Coordinates,
    end: Coordinates,
    pointCount: number,
  ): Coordinates[] {
    const points: Coordinates[] = [];
    const latStep = (end.latitude - start.latitude) / (pointCount - 1);
    const lngStep = (end.longitude - start.longitude) / (pointCount - 1);

    for (let i = 0; i < pointCount; i++) {
      points.push({
        latitude: start.latitude + i * latStep,
        longitude: start.longitude + i * lngStep,
      });
    }

    return points;
  }

  /**
   * Create random points within a bounding box
   */
  static createRandomPoints(bounds: BoundingBox, count: number): Coordinates[] {
    return Array.from({ length: count }, () => ({
      latitude: bounds.south + Math.random() * (bounds.north - bounds.south),
      longitude: bounds.west + Math.random() * (bounds.east - bounds.west),
    }));
  }

  /**
   * Validate that a set of coordinates form a realistic geographical distribution
   */
  static validateDistribution(points: Coordinates[]): {
    isValid: boolean;
    centroid: Coordinates;
    maxDistance: number;
    averageDistance: number;
    issues: string[];
  } {
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
      points
        .slice(i + 1)
        .map((otherPoint) => calculateDistance(point, otherPoint)),
    );
    const averageDistance =
      distances.reduce((sum, d) => sum + d, 0) / distances.length;

    // Check for clustering (points too close together)
    const veryClosePoints = distances.filter((d) => d < 0.001).length; // Less than 1 meter
    if (veryClosePoints > points.length * 0.1) {
      issues.push(
        `${veryClosePoints} pairs of points are suspiciously close (< 1m)`,
      );
    }

    // Check for unrealistic spread
    if (maxDistance > 20000) {
      // More than half the Earth's circumference
      issues.push(
        `Maximum distance ${maxDistance.toFixed(2)}km is unrealistically large`,
      );
    }

    return {
      isValid: issues.length === 0 && invalidPoints.length === 0,
      centroid,
      maxDistance,
      averageDistance,
      issues,
    };
  }
}

// Common test coordinates for reference
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
