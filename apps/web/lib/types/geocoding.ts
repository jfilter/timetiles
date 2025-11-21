/**
 * Type definitions for geocoding operations and results.
 *
 * Provides structured type definitions for geocoding candidates, results,
 * and related data structures to ensure type safety across the import pipeline.
 *
 * @module
 */

export interface GeocodingCandidate {
  /** Field name containing location information (address, city, venue, etc.) */
  locationField?: string;
}

export interface GeocodingResult {
  /** Geographic coordinates */
  coordinates: {
    lat: number;
    lng: number;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Formatted/normalized address */
  formattedAddress?: string;
}

/** Map of location string to geocoding result */
export interface GeocodingResultsMap {
  [location: string]: GeocodingResult;
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
 * Reads from detectedFieldMappings.locationPath.
 */
export const getGeocodingCandidate = (job: { detectedFieldMappings?: unknown }): GeocodingCandidate | null => {
  // Extract locationPath from detected field mappings
  if (!job.detectedFieldMappings || typeof job.detectedFieldMappings !== "object") {
    return null;
  }

  const mappings = job.detectedFieldMappings as Record<string, unknown>;
  const locationField = typeof mappings.locationPath === "string" ? mappings.locationPath : undefined;

  // Return null if no location field was detected
  if (!locationField) {
    return null;
  }

  return { locationField };
};

/**
 * Safely get geocoding result for a specific location.
 */
export const getGeocodingResultForLocation = (
  geocodingResults: GeocodingResultsMap,
  location: string
): GeocodingResult | null => {
  const result = geocodingResults[location];
  return result ?? null;
};
