/**
 * Helper utilities for creating events from imported data.
 *
 * Provides functions for extracting coordinates, timestamps,
 * and creating event data structures during the import process.
 *
 * @module
 * @category Jobs
 */
import { generateUniqueId } from "@/lib/services/id-generation";
import type { getGeocodingResults } from "@/lib/types/geocoding";
import { isValidDate } from "@/lib/utils/date";
import type { Dataset } from "@/payload-types";

/**
 * Extract coordinates from a row based on field mappings and geocoding results.
 * Priority: import coordinates from data > geocoded location > none
 */
export const extractCoordinates = (
  row: Record<string, unknown>,
  fieldMappings: {
    latitudePath?: string | null;
    longitudePath?: string | null;
    locationPath?: string | null;
  },
  geocodingResults: ReturnType<typeof getGeocodingResults>
): {
  location?: { latitude: number; longitude: number };
  coordinateSource: { type: "import" | "geocoded" | "none"; confidence?: number; normalizedAddress?: string };
} => {
  // Try to read coordinates directly from the row (imported data)
  const { latitudePath, longitudePath, locationPath } = fieldMappings;

  if (latitudePath && longitudePath) {
    const lat = row[latitudePath];
    const lng = row[longitudePath];

    // Validate both type and coordinate bounds
    if (typeof lat === "number" && typeof lng === "number" && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        location: { latitude: lat, longitude: lng },
        coordinateSource: { type: "import" as const },
      };
    }
  }

  // Try to lookup geocoded location
  if (locationPath && geocodingResults) {
    const locationValue = row[locationPath];
    if (typeof locationValue === "string") {
      const trimmed = locationValue.trim();
      const geocoded = geocodingResults[trimmed];
      if (geocoded) {
        return {
          location: {
            latitude: geocoded.coordinates.lat,
            longitude: geocoded.coordinates.lng,
          },
          coordinateSource: {
            type: "geocoded" as const,
            confidence: geocoded.confidence,
            normalizedAddress: geocoded.formattedAddress,
          },
        };
      }
    }
  }

  // No coordinates available
  return {
    coordinateSource: { type: "none" as const },
  };
};

/**
 * Extract timestamp from row data using field mapping.
 */
export const extractTimestamp = (row: Record<string, unknown>, timestampPath?: string | null): Date => {
  // Try mapped field first
  if (timestampPath && row[timestampPath]) {
    const date = new Date(row[timestampPath] as string | number);
    if (isValidDate(date)) {
      return date;
    }
  }

  // Fallback to common timestamp fields
  const timestampFields = ["timestamp", "date", "datetime", "created_at", "event_date", "event_time"];

  for (const field of timestampFields) {
    if (row[field]) {
      const date = new Date(row[field] as string | number);
      if (isValidDate(date)) {
        return date;
      }
    }
  }

  // Default to current time
  return new Date();
};

/**
 * Extract location name from row data using field mapping.
 */
const extractLocationName = (row: Record<string, unknown>, locationNamePath?: string | null): string | null => {
  if (!locationNamePath) return null;

  const value = row[locationNamePath];
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return null;
};

/**
 * Create event data structure from a row of imported data.
 */
export const createEventData = (
  row: Record<string, unknown>,
  dataset: Dataset,
  importJobId: string | number,
  job: {
    datasetSchemaVersion?: unknown;
    detectedFieldMappings?: {
      latitudePath?: string | null;
      longitudePath?: string | null;
      locationPath?: string | null;
      locationNamePath?: string | null;
      timestampPath?: string | null;
    };
  },
  geocodingResults: ReturnType<typeof getGeocodingResults>,
  transformationChanges: Array<{ path: string; oldValue: unknown; newValue: unknown; error?: string }> | null
) => {
  const uniqueId = generateUniqueId(row, dataset.idStrategy);
  const importJobNum = typeof importJobId === "string" ? parseInt(importJobId, 10) : importJobId;

  const schemaVersionData = job.datasetSchemaVersion;
  let schemaVersion: number | undefined;
  if (typeof schemaVersionData === "object" && schemaVersionData) {
    schemaVersion = (schemaVersionData as { versionNumber: number }).versionNumber;
  } else if (typeof schemaVersionData === "number") {
    schemaVersion = schemaVersionData;
  } else {
    schemaVersion = undefined;
  }

  const fieldMappings = job.detectedFieldMappings ?? {};
  const { location, coordinateSource } = extractCoordinates(row, fieldMappings, geocodingResults);
  const locationName = extractLocationName(row, fieldMappings.locationNamePath);

  return {
    dataset: dataset.id,
    importJob: importJobNum,
    data: row,
    uniqueId,
    eventTimestamp: extractTimestamp(row, fieldMappings.timestampPath).toISOString(),
    location,
    locationName,
    coordinateSource,
    validationStatus: transformationChanges ? ("transformed" as const) : ("pending" as const),
    transformations: transformationChanges,
    schemaVersionNumber: schemaVersion,
  };
};
