/**
 * Helper utilities for creating events from imported data.
 *
 * Provides functions for extracting coordinates, timestamps, applying transformations,
 * and creating event data structures during the import process.
 *
 * @module
 * @category Jobs
 */
import type { createJobLogger } from "@/lib/logger";
import { generateUniqueId } from "@/lib/services/id-generation";
import { TypeTransformationService } from "@/lib/services/type-transformation";
import type { getGeocodingResults } from "@/lib/types/geocoding";
import { isValidDate } from "@/lib/utils/date";
import type { Dataset } from "@/payload-types";

/**
 * Apply type transformations to a row based on dataset configuration.
 * Note: This works on data that hasn't been auto-typed by Papa Parse.
 * For CSV files with dynamicTyping: true, transformations may not apply.
 */
export const applyTypeTransformations = async (
  row: Record<string, unknown>,
  dataset: Dataset,
  logger: ReturnType<typeof createJobLogger>
): Promise<{
  transformedRow: Record<string, unknown>;
  transformationChanges: Array<{ path: string; oldValue: unknown; newValue: unknown; error?: string }> | null;
}> => {
  const allowTransformations = dataset.schemaConfig?.allowTransformations ?? true;
  const transformations = dataset.typeTransformations ?? [];

  if (!allowTransformations || transformations.length === 0) {
    return { transformedRow: row, transformationChanges: null };
  }

  try {
    const transformationRules = transformations.map((t) => ({
      fieldPath: t.fieldPath,
      fromType: t.fromType,
      toType: t.toType,
      transformStrategy: t.transformStrategy,
      customTransform: t.customTransform ?? undefined,
      enabled: t.enabled ?? true,
    }));

    const service = new TypeTransformationService(transformationRules);
    const result = await service.transformRecord(row);

    const successfulChanges = result.changes.filter((change) => !change.error);
    const failedChanges = result.changes.filter((change) => change.error);

    if (successfulChanges.length > 0) {
      logger.debug("Applied type transformations", {
        fieldCount: successfulChanges.length,
        changes: successfulChanges,
      });
    }

    if (failedChanges.length > 0) {
      logger.warn("Some transformations failed", {
        fieldCount: failedChanges.length,
        changes: failedChanges,
      });
    }

    return {
      transformedRow: result.transformed,
      transformationChanges: successfulChanges.length > 0 ? successfulChanges : null,
    };
  } catch (error) {
    logger.error("Type transformation failed", { error });
    return { transformedRow: row, transformationChanges: null };
  }
};

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
  coordinateSource: { type: "import" | "geocoded" | "none"; confidence?: number };
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

  return {
    dataset: dataset.id,
    importJob: importJobNum,
    data: row,
    uniqueId,
    eventTimestamp: extractTimestamp(row, fieldMappings.timestampPath).toISOString(),
    location,
    coordinateSource,
    validationStatus: transformationChanges ? ("transformed" as const) : ("pending" as const),
    transformations: transformationChanges,
    schemaVersionNumber: schemaVersion,
  };
};
