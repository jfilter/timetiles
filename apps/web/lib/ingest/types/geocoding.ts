/**
 * Ingest-pipeline geocoding helpers and persisted result shapes.
 *
 * These types model the geocoding data stored on `ingest-jobs` records and the
 * field mappings used by the ingest geocoding stage. They are intentionally
 * separate from the service-layer geocoding contracts in
 * `lib/services/geocoding/types.ts`.
 *
 * @module
 * @category Types
 */

export interface IngestGeocodingCandidate {
  /** Field name containing location information (address, city, venue, etc.) */
  locationField?: string;
  /** Field name containing location/venue name (fallback when locationField is absent) */
  locationNameField?: string;
  /** Field name containing latitude values (used to skip geocoding for rows with existing coordinates) */
  latitudeField?: string;
  /** Field name containing longitude values (used to skip geocoding for rows with existing coordinates) */
  longitudeField?: string;
}

export interface IngestGeocodingResult {
  /** Geographic coordinates */
  coordinates: { lat: number; lng: number };
  /** Confidence score (0-1) */
  confidence: number;
  /** Formatted/normalized address */
  formattedAddress?: string;
}

/** Map of location string to a persisted ingest geocoding result. */
export interface IngestGeocodingResultsMap {
  [location: string]: IngestGeocodingResult;
}

/**
 * Type guard to check if stored ingest geocoding results are a valid map.
 */
export const isValidIngestGeocodingResultsMap = (results: unknown): results is IngestGeocodingResultsMap => {
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
 * Safe getter for geocoding results from an ingest job.
 */
export const getIngestGeocodingResults = (job: { geocodingResults?: unknown }): IngestGeocodingResultsMap => {
  if (isValidIngestGeocodingResultsMap(job.geocodingResults)) {
    return job.geocodingResults;
  }
  return {};
};

/**
 * Safe getter for geocoding candidates from an ingest job.
 * Reads from detectedFieldMappings.locationPath.
 */
export const getIngestGeocodingCandidate = (job: {
  detectedFieldMappings?: unknown;
}): IngestGeocodingCandidate | null => {
  // Extract locationPath from detected field mappings
  if (!job.detectedFieldMappings || typeof job.detectedFieldMappings !== "object") {
    return null;
  }

  const mappings = job.detectedFieldMappings as Record<string, unknown>;
  const locationField = typeof mappings.locationPath === "string" ? mappings.locationPath : undefined;
  const locationNameField = typeof mappings.locationNamePath === "string" ? mappings.locationNamePath : undefined;

  // Return null if neither location field nor location name field was detected
  if (!locationField && !locationNameField) {
    return null;
  }

  const latitudeField = typeof mappings.latitudePath === "string" ? mappings.latitudePath : undefined;
  const longitudeField = typeof mappings.longitudePath === "string" ? mappings.longitudePath : undefined;

  return { locationField, locationNameField, latitudeField, longitudeField };
};
