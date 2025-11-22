/**
 * Simple pattern generator for test data.
 *
 * Creates simple, uniform distributions for fast test execution.
 * No geographic clustering, uniform temporal distribution.
 *
 * @module
 */

import { SeededRandom } from "./seeded-random";

export interface SimplePatternOptions {
  useGeographicClustering?: boolean;
  temporalDistribution?: "uniform" | "realistic";
  includeGeocoding?: boolean;
  seed?: number;
}

/**
 * Generate simple pattern variations for seed data.
 */
export const applySimplePatterns = (events: unknown[], options: SimplePatternOptions = {}): unknown[] => {
  const { seed = Date.now() } = options;
  const rng = new SeededRandom(seed);

  return events.map((event, index) => {
    if (typeof event !== "object" || event === null) {
      return event;
    }

    const varied: Record<string, unknown> = { ...event };

    // Simple temporal variation - spread events across a year
    if (varied.eventTimestamp instanceof Date || typeof varied.eventTimestamp === "string") {
      const baseDate = new Date(varied.eventTimestamp);
      const dayOffset = rng.nextInt(0, 365); // Random day within a year
      const timeOffset = rng.nextInt(0, 24 * 60 * 60 * 1000); // Random time of day
      varied.eventTimestamp = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000 + timeOffset);
    }

    // Simple geographic variation - small random offsets
    const geopoint = varied.geopoint as { type?: string; coordinates?: number[] } | undefined;
    if (geopoint && Array.isArray(geopoint.coordinates) && geopoint.coordinates.length >= 2) {
      const [lng, lat] = geopoint.coordinates;
      varied.geopoint = {
        type: "Point",
        coordinates: [
          (lng ?? 0) + rng.nextFloat(-0.1, 0.1), // ±0.1 degrees (~11km)
          (lat ?? 0) + rng.nextFloat(-0.1, 0.1),
        ],
      };
    }

    // Vary title slightly
    if (typeof varied.title === "string") {
      varied.title = `${varied.title} ${index + 1}`;
    }

    return varied;
  });
};
