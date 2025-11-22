/**
 * Realistic temporal and spatial pattern generator.
 *
 * Creates realistic distributions with:
 * - Geographic clustering around city centers
 * - Temporal patterns (weekday bias, time of day, seasonality)
 * - Realistic event variations
 *
 * @module
 */

import { SeededRandom } from "./seeded-random";

export interface RealisticPatternOptions {
  useGeographicClustering?: boolean;
  temporalDistribution?: "uniform" | "realistic";
  includeGeocoding?: boolean;
  debugOutput?: boolean;
  seed?: number;
  clusterCenters?: Array<{ lat: number; lng: number }>;
  weekdayBias?: number; // 0-1, probability of weekday vs weekend
  businessHoursBias?: number; // 0-1, probability of business hours vs other
}

// Default cluster centers (major cities)
const DEFAULT_CLUSTERS = [
  { lat: 40.7128, lng: -74.006 }, // NYC
  { lat: 37.7749, lng: -122.4194 }, // SF
  { lat: 41.8781, lng: -87.6298 }, // Chicago
  { lat: 51.5074, lng: -0.1278 }, // London
  { lat: 48.8566, lng: 2.3522 }, // Paris
];

const applyRealisticTemporal = (
  varied: Record<string, unknown>,
  originalEvent: Record<string, unknown>,
  rng: SeededRandom,
  options: { temporalDistribution: "uniform" | "realistic"; weekdayBias: number; businessHoursBias: number }
): void => {
  const { temporalDistribution, weekdayBias, businessHoursBias } = options;

  if (!(originalEvent.eventTimestamp instanceof Date || typeof originalEvent.eventTimestamp === "string")) {
    return;
  }

  const baseDate = new Date(originalEvent.eventTimestamp);

  if (temporalDistribution === "realistic") {
    // Spread across a year with seasonal bias
    const dayOfYear = rng.nextInt(0, 365);
    const seasonalFactor = Math.sin((dayOfYear / 365) * Math.PI * 2);
    const seasonalOffset = seasonalFactor > 0 ? Math.floor(seasonalFactor * 30) : 0;

    let targetDay = dayOfYear + seasonalOffset;
    const dayOfWeek = targetDay % 7;
    if (dayOfWeek >= 5 && rng.chance(weekdayBias)) {
      targetDay = targetDay - dayOfWeek + 1;
    }

    const hour = rng.chance(businessHoursBias) ? rng.nextInt(9, 17) : rng.nextInt(0, 24);
    const minute = rng.nextInt(0, 60);
    const timestamp = new Date(baseDate.getFullYear(), 0, 1);
    timestamp.setDate(timestamp.getDate() + targetDay);
    timestamp.setHours(hour, minute, 0, 0);
    varied.eventTimestamp = timestamp;
  } else {
    // Uniform distribution
    const dayOffset = rng.nextInt(0, 365);
    const timeOffset = rng.nextInt(0, 24 * 60 * 60 * 1000);
    varied.eventTimestamp = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000 + timeOffset);
  }
};

const applyRealisticGeo = (
  varied: Record<string, unknown>,
  rng: SeededRandom,
  options: { useGeographicClustering: boolean; clusterCenters: Array<{ lat: number; lng: number }> }
): void => {
  const { useGeographicClustering, clusterCenters } = options;
  const geopoint = varied.geopoint as { type?: string; coordinates?: number[] } | undefined;

  if (!(geopoint && Array.isArray(geopoint.coordinates) && geopoint.coordinates.length >= 2)) {
    return;
  }

  if (useGeographicClustering) {
    const cluster = rng.pick(clusterCenters);
    const distance = Math.abs(rng.nextFloat(0, 1));
    const radius = distance * distance * 0.5;
    const angle = rng.nextFloat(0, 2 * Math.PI);
    const latOffset = radius * Math.cos(angle);
    const lngOffset = (radius * Math.sin(angle)) / Math.cos((cluster.lat * Math.PI) / 180);

    varied.geopoint = {
      type: "Point",
      coordinates: [cluster.lng + lngOffset, cluster.lat + latOffset],
    };
  } else {
    const [lng, lat] = geopoint.coordinates;
    varied.geopoint = {
      type: "Point",
      coordinates: [(lng ?? 0) + rng.nextFloat(-0.1, 0.1), (lat ?? 0) + rng.nextFloat(-0.1, 0.1)],
    };
  }
};

/**
 * Generate realistic temporal and spatial patterns for seed data.
 */
export const applyRealisticPatterns = (events: unknown[], options: RealisticPatternOptions = {}): unknown[] => {
  const {
    seed = Date.now(),
    useGeographicClustering = true,
    temporalDistribution = "realistic",
    weekdayBias = 0.7,
    businessHoursBias = 0.6,
    clusterCenters = DEFAULT_CLUSTERS,
  } = options;

  const rng = new SeededRandom(seed);

  return events.map((event, index) => {
    if (typeof event !== "object" || event === null) {
      return event;
    }

    const varied: Record<string, unknown> = { ...event };
    const originalEvent = event as Record<string, unknown>;

    // Apply temporal patterns
    applyRealisticTemporal(varied, originalEvent, rng, { temporalDistribution, weekdayBias, businessHoursBias });

    // Apply geographic patterns
    applyRealisticGeo(varied, rng, { useGeographicClustering, clusterCenters });

    // Vary title
    if (typeof varied.title === "string") {
      varied.title = `${varied.title} ${index + 1}`;
    }

    // Vary description with more realistic content
    if (typeof varied.description === "string") {
      const description = varied.description;
      const templates = [
        `${description} Updated information available.`,
        `${description} Registration required.`,
        `${description} Limited capacity.`,
        `${description} Free admission.`,
      ];
      varied.description = rng.pick(templates);
    }

    return varied;
  });
};
