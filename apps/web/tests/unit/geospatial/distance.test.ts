/**
 * Unit tests for distance calculation utilities.
 *
 * Tests Haversine distance, centroid calculation, and max distance
 * functions with known geographic reference points and edge cases.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { calculateCentroid, calculateDistance, findMaxDistance } from "@/lib/geospatial/distance";
import type { Coordinates } from "@/lib/geospatial/types";

// Well-known city coordinates for reference-based assertions
const NEW_YORK: Coordinates = { latitude: 40.7128, longitude: -74.006 };
const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 };
const TOKYO: Coordinates = { latitude: 35.6762, longitude: 139.6503 };
const SYDNEY: Coordinates = { latitude: -33.8688, longitude: 151.2093 };
const ORIGIN: Coordinates = { latitude: 0, longitude: 0 };
const NORTH_POLE: Coordinates = { latitude: 90, longitude: 0 };
const SOUTH_POLE: Coordinates = { latitude: -90, longitude: 0 };

describe("calculateDistance", () => {
  describe("known city distances", () => {
    it("should calculate New York to London as approximately 5570 km", () => {
      const distance = calculateDistance(NEW_YORK, LONDON);
      expect(distance).toBeGreaterThan(5500);
      expect(distance).toBeLessThan(5600);
    });

    it("should calculate New York to Tokyo as approximately 10838 km", () => {
      const distance = calculateDistance(NEW_YORK, TOKYO);
      expect(distance).toBeGreaterThan(10800);
      expect(distance).toBeLessThan(10900);
    });

    it("should calculate London to Sydney as approximately 16994 km", () => {
      const distance = calculateDistance(LONDON, SYDNEY);
      expect(distance).toBeGreaterThan(16900);
      expect(distance).toBeLessThan(17100);
    });
  });

  describe("symmetry", () => {
    it("should return the same distance regardless of argument order", () => {
      const d1 = calculateDistance(NEW_YORK, LONDON);
      const d2 = calculateDistance(LONDON, NEW_YORK);
      expect(d1).toBeCloseTo(d2, 10);
    });
  });

  describe("identical points", () => {
    it("should return 0 for the same point", () => {
      expect(calculateDistance(NEW_YORK, NEW_YORK)).toBe(0);
    });

    it("should return 0 for the origin to itself", () => {
      expect(calculateDistance(ORIGIN, ORIGIN)).toBe(0);
    });
  });

  describe("antipodal points", () => {
    it("should calculate North Pole to South Pole as approximately 20015 km", () => {
      const distance = calculateDistance(NORTH_POLE, SOUTH_POLE);
      // Half the Earth's circumference (~40030 km / 2)
      expect(distance).toBeGreaterThan(20000);
      expect(distance).toBeLessThan(20030);
    });

    it("should calculate diametrically opposite equatorial points as approximately 20015 km", () => {
      const pointA: Coordinates = { latitude: 0, longitude: 0 };
      const pointB: Coordinates = { latitude: 0, longitude: 180 };
      const distance = calculateDistance(pointA, pointB);
      expect(distance).toBeGreaterThan(20000);
      expect(distance).toBeLessThan(20030);
    });
  });

  describe("short distances", () => {
    it("should calculate a very short distance accurately", () => {
      // Two points approximately 1 degree of latitude apart at the equator (~111 km)
      const pointA: Coordinates = { latitude: 0, longitude: 0 };
      const pointB: Coordinates = { latitude: 1, longitude: 0 };
      const distance = calculateDistance(pointA, pointB);
      expect(distance).toBeGreaterThan(110);
      expect(distance).toBeLessThan(112);
    });
  });

  describe("negative coordinates", () => {
    it("should handle negative latitudes and longitudes", () => {
      const buenosAires: Coordinates = { latitude: -34.6037, longitude: -58.3816 };
      const distance = calculateDistance(buenosAires, SYDNEY);
      expect(distance).toBeGreaterThan(11000);
      expect(distance).toBeLessThan(12500);
    });
  });
});

describe("calculateCentroid", () => {
  describe("single point", () => {
    it("should return the point itself", () => {
      const result = calculateCentroid([NEW_YORK]);
      expect(result.latitude).toBeCloseTo(NEW_YORK.latitude, 10);
      expect(result.longitude).toBeCloseTo(NEW_YORK.longitude, 10);
    });
  });

  describe("two points", () => {
    it("should return the midpoint", () => {
      const pointA: Coordinates = { latitude: 10, longitude: 20 };
      const pointB: Coordinates = { latitude: 30, longitude: 40 };
      const result = calculateCentroid([pointA, pointB]);
      expect(result.latitude).toBeCloseTo(20, 10);
      expect(result.longitude).toBeCloseTo(30, 10);
    });
  });

  describe("multiple points", () => {
    it("should return the arithmetic mean of coordinates", () => {
      const points: Coordinates[] = [
        { latitude: 0, longitude: 0 },
        { latitude: 10, longitude: 10 },
        { latitude: 20, longitude: 20 },
      ];
      const result = calculateCentroid(points);
      expect(result.latitude).toBeCloseTo(10, 10);
      expect(result.longitude).toBeCloseTo(10, 10);
    });

    it("should handle mixed positive and negative coordinates", () => {
      const points: Coordinates[] = [
        { latitude: -10, longitude: -20 },
        { latitude: 10, longitude: 20 },
      ];
      const result = calculateCentroid(points);
      expect(result.latitude).toBeCloseTo(0, 10);
      expect(result.longitude).toBeCloseTo(0, 10);
    });
  });

  describe("symmetry", () => {
    it("should return the same centroid regardless of point order", () => {
      const points: Coordinates[] = [NEW_YORK, LONDON, TOKYO];
      const reversed = [...points].reverse();
      const centroid1 = calculateCentroid(points);
      const centroid2 = calculateCentroid(reversed);
      expect(centroid1.latitude).toBeCloseTo(centroid2.latitude, 10);
      expect(centroid1.longitude).toBeCloseTo(centroid2.longitude, 10);
    });
  });

  describe("error handling", () => {
    it("should throw an error for an empty array", () => {
      expect(() => calculateCentroid([])).toThrow("Cannot calculate centroid of empty array");
    });
  });
});

describe("findMaxDistance", () => {
  describe("fewer than two points", () => {
    it("should return 0 for an empty array", () => {
      expect(findMaxDistance([])).toBe(0);
    });

    it("should return 0 for a single point", () => {
      expect(findMaxDistance([NEW_YORK])).toBe(0);
    });
  });

  describe("two points", () => {
    it("should return the distance between the two points", () => {
      const maxDist = findMaxDistance([NEW_YORK, LONDON]);
      const directDist = calculateDistance(NEW_YORK, LONDON);
      expect(maxDist).toBeCloseTo(directDist, 10);
    });
  });

  describe("multiple points", () => {
    it("should find the maximum pairwise distance", () => {
      // NY-London ~5570, NY-Tokyo ~10838, London-Tokyo ~9562
      // Max should be NY-Tokyo
      const maxDist = findMaxDistance([NEW_YORK, LONDON, TOKYO]);
      const nyToTokyo = calculateDistance(NEW_YORK, TOKYO);
      expect(maxDist).toBeCloseTo(nyToTokyo, 5);
    });

    it("should find the largest distance among four cities", () => {
      // The greatest pairwise distance among NY, London, Tokyo, Sydney
      // should be London-Sydney (~16994 km)
      const maxDist = findMaxDistance([NEW_YORK, LONDON, TOKYO, SYDNEY]);
      const londonToSydney = calculateDistance(LONDON, SYDNEY);
      expect(maxDist).toBeCloseTo(londonToSydney, 5);
    });
  });

  describe("identical points", () => {
    it("should return 0 when all points are identical", () => {
      expect(findMaxDistance([NEW_YORK, NEW_YORK, NEW_YORK])).toBe(0);
    });
  });

  describe("antipodal points in set", () => {
    it("should return roughly half Earth circumference for pole-to-pole", () => {
      const maxDist = findMaxDistance([NORTH_POLE, ORIGIN, SOUTH_POLE]);
      const poleDistance = calculateDistance(NORTH_POLE, SOUTH_POLE);
      expect(maxDist).toBeCloseTo(poleDistance, 5);
    });
  });
});
