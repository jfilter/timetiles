/**
 * Type definitions for geocoding operations and results.
 *
 * Provides structured type definitions for geocoding candidates, results,
 * and related data structures to ensure type safety across the import pipeline.
 *
 * @module
 */

export interface GeocodingCandidate {
  /** Field name containing address information */
  addressField?: string;
  /** Field name containing latitude data */
  latitudeField?: string;
  /** Field name containing longitude data */
  longitudeField?: string;
  /** Confidence score for field detection */
  confidence?: number;
}

export interface GeocodingResult {
  /** Row number this result applies to */
  rowNumber: number;
  /** Geographic coordinates */
  coordinates: {
    lat: number;
    lng: number;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Formatted/normalized address */
  formattedAddress?: string;
  /** Source of coordinates */
  source?: "geocoded" | "provided";
}

export interface GeocodingResultsMap {
  [rowNumber: string]: GeocodingResult;
}

/**
 * Type guard to check if geocoding results is a valid map.
 */
export const isValidGeocodingResultsMap = (results: unknown): results is GeocodingResultsMap => {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    return false;
  }

  // Check if all values are valid geocoding results
  return Object.values(results).every((result) => {
    return (
      result &&
      typeof result === "object" &&
      "rowNumber" in result &&
      "coordinates" in result &&
      typeof result.coordinates === "object" &&
      "lat" in result.coordinates &&
      "lng" in result.coordinates &&
      typeof result.coordinates.lat === "number" &&
      typeof result.coordinates.lng === "number"
    );
  });
};

/**
 * Type guard to check if geocoding candidates is valid.
 */
export const isValidGeocodingCandidate = (candidate: unknown): candidate is GeocodingCandidate => {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const cand = candidate as Record<string, unknown>;
  return (
    (typeof cand.addressField === "string" || cand.addressField === undefined) &&
    (typeof cand.latitudeField === "string" || cand.latitudeField === undefined) &&
    (typeof cand.longitudeField === "string" || cand.longitudeField === undefined) &&
    (typeof cand.confidence === "number" || cand.confidence === undefined)
  );
};

/**
 * Safe getter for geocoding results from import job.
 */
export const getGeocodingResults = (job: { geocodingResults?: unknown }): GeocodingResultsMap => {
  if (isValidGeocodingResultsMap(job.geocodingResults)) {
    return job.geocodingResults;
  }
  return {};
};

/**
 * Safe getter for geocoding candidates from import job.
 */
export const getGeocodingCandidate = (job: { geocodingCandidates?: unknown }): GeocodingCandidate | null => {
  if (isValidGeocodingCandidate(job.geocodingCandidates)) {
    return job.geocodingCandidates;
  }
  return null;
};

/**
 * Safely get geocoding result for a specific row.
 */
export const getGeocodingResultForRow = (
  geocodingResults: GeocodingResultsMap,
  rowNumber: number
): GeocodingResult | null => {
  const result = geocodingResults[String(rowNumber)];
  return result ?? null;
};
