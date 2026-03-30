/**
 * Helper utilities for creating events from imported data.
 *
 * Provides functions for extracting coordinates, timestamps,
 * and creating event data structures during the import process.
 *
 * @module
 * @category Jobs
 */
import { parseCoordinate } from "@/lib/geospatial/parsing";
import { FIELD_TYPE_MAJORITY_THRESHOLD } from "@/lib/services/schema-detection/utilities/geo";
import { isValidCoordinate } from "@/lib/geospatial/validation";
import { createLogger } from "@/lib/logger";
import { normalizeGeocodingAddress } from "@/lib/services/geocoding/cache-manager";
import { generateUniqueId } from "@/lib/services/id-generation";
import type { getImportGeocodingResults } from "@/lib/types/geocoding";
import { parseDateInput } from "@/lib/utils/date";
import { parseStrictInteger } from "@/lib/utils/event-params";
import type { Dataset } from "@/payload-types";

const logger = createLogger("event-creation-helpers");

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
    locationNamePath?: string | null;
  },
  geocodingResults: ReturnType<typeof getImportGeocodingResults>
): {
  location?: { latitude: number; longitude: number };
  coordinateSource: { type: "source-data" | "geocoded" | "none"; confidence?: number; normalizedAddress?: string };
} => {
  // Try to read coordinates directly from the row (imported data)
  const { latitudePath, longitudePath, locationPath, locationNamePath } = fieldMappings;

  if (latitudePath && longitudePath) {
    // Parse string coordinates (e.g. from split transforms)
    const parsedLat = parseCoordinate(row[latitudePath]);
    const parsedLng = parseCoordinate(row[longitudePath]);

    // Validate coordinates — rejects null, NaN, out-of-range, and (0,0)
    if (parsedLat !== null && parsedLng !== null && isValidCoordinate(parsedLat, parsedLng)) {
      return {
        location: { latitude: parsedLat, longitude: parsedLng },
        coordinateSource: { type: "source-data" as const },
      };
    }
  }

  // Try to lookup geocoded location (results are keyed by normalized address)
  // Check locationPath first, then fallback to locationNamePath
  const locationFields = [locationPath, locationNamePath].filter(Boolean) as string[];
  for (const field of locationFields) {
    if (geocodingResults) {
      const locationValue = row[field];
      if (typeof locationValue === "string") {
        const trimmed = locationValue.trim();
        const geocoded = geocodingResults[normalizeGeocodingAddress(trimmed)];
        if (geocoded) {
          return {
            location: { latitude: geocoded.coordinates.lat, longitude: geocoded.coordinates.lng },
            coordinateSource: {
              type: "geocoded" as const,
              confidence: geocoded.confidence,
              normalizedAddress: geocoded.formattedAddress,
            },
          };
        }
      }
    }
  }

  // No coordinates available
  return { coordinateSource: { type: "none" as const } };
};

/**
 * Extract timestamp from row data using field mapping.
 */
export const extractTimestamp = (row: Record<string, unknown>, timestampPath?: string | null): Date | null => {
  // Try mapped field first
  if (timestampPath && row[timestampPath]) {
    const date = parseDateInput(row[timestampPath] as string | number);
    if (date) {
      return date;
    }
  }

  // Fallback to common timestamp fields
  const timestampFields = ["timestamp", "date", "datetime", "created_at", "event_date", "event_time"];

  for (const field of timestampFields) {
    if (row[field]) {
      const date = parseDateInput(row[field] as string | number);
      if (date) {
        return date;
      }
    }
  }

  // No valid timestamp found — return null so the caller can decide how to handle it
  logger.warn("No valid timestamp found in row, returning null");
  return null;
};

/**
 * Extract end timestamp from row data using field mapping.
 * Returns null if no end date is found (most events don't have one).
 */
export const extractEndTimestamp = (row: Record<string, unknown>, endTimestampPath?: string | null): Date | null => {
  if (!endTimestampPath || !row[endTimestampPath]) {
    return null;
  }

  return parseDateInput(row[endTimestampPath] as string | number);
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

/** Field type groups derived from schema detection fieldMetadata. */
export interface FieldTypeMap {
  [key: string]: string[] | undefined;
  tags?: string[];
  enum?: string[];
  date?: string[];
  url?: string[];
  image?: string[];
  number?: string[];
}

/**
 * Build field type metadata from dataset fieldMetadata.
 * Groups field names by their detected type. Only includes non-default types
 * (string is the default and omitted). Compute once per dataset, not per row.
 */
export const buildFieldTypes = (fieldMetadata: unknown): FieldTypeMap | null => {
  if (!fieldMetadata || typeof fieldMetadata !== "object") return null;

  const fm = fieldMetadata as Record<string, Record<string, unknown>>;
  const result: FieldTypeMap = {};

  for (const [path, stats] of Object.entries(fm)) {
    if (!stats || typeof stats !== "object") continue;
    const group = classifyField(stats);
    if (group) (result[group] ??= []).push(path);
  }

  return Object.keys(result).length > 0 ? result : null;
};

/** Image URL pattern: common image file extensions. */
const IMAGE_URL_PATTERN = /\.(jpe?g|png|gif|svg|webp|avif|bmp|tiff?)/i;

/** Classify a single field into a type group based on its statistics. */
const classifyField = (stats: Record<string, unknown>): string | null => {
  if (stats.isTagField) return "tags";
  if (stats.isEnumCandidate) return "enum";

  const dist = (stats.typeDistribution ?? {}) as Record<string, number>;
  const formats = (stats.formats ?? {}) as Record<string, number>;
  const occ = (stats.occurrences as number) || 1;

  if ((dist.date ?? 0) / occ > FIELD_TYPE_MAJORITY_THRESHOLD) return "date";

  // Distinguish image URLs from regular URLs by checking samples for image extensions
  if ((formats.url ?? 0) / occ > FIELD_TYPE_MAJORITY_THRESHOLD) {
    const samples = (stats.uniqueSamples ?? []) as unknown[];
    const hasImageSamples = samples.some((s) => typeof s === "string" && IMAGE_URL_PATTERN.test(s));
    return hasImageSamples ? "image" : "url";
  }

  if (((dist.number ?? 0) + (dist.integer ?? 0)) / occ > FIELD_TYPE_MAJORITY_THRESHOLD) return "number";
  return null;
};

/**
 * Create event data structure from a row of imported data.
 */
export const createEventData = (
  row: Record<string, unknown>,
  sourceRow: Record<string, unknown>,
  dataset: Dataset,
  ingestJobId: string | number,
  job: {
    datasetSchemaVersion?: unknown;
    detectedFieldMappings?: {
      latitudePath?: string | null;
      longitudePath?: string | null;
      locationPath?: string | null;
      locationNamePath?: string | null;
      timestampPath?: string | null;
      endTimestampPath?: string | null;
    };
  },
  geocodingResults: ReturnType<typeof getImportGeocodingResults>,
  transformationChanges: Array<{ path: string; oldValue: unknown; newValue: unknown; error?: string }> | null
) => {
  const uniqueId = generateUniqueId(row, dataset);
  const ingestJobNum = typeof ingestJobId === "string" ? parseStrictInteger(ingestJobId) : ingestJobId;

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
    ingestJob: ingestJobNum ?? undefined,
    sourceData: sourceRow,
    transformedData: row,
    uniqueId,
    eventTimestamp: extractTimestamp(row, fieldMappings.timestampPath)?.toISOString() ?? null,
    eventEndTimestamp: extractEndTimestamp(row, fieldMappings.endTimestampPath)?.toISOString() ?? null,
    location,
    locationName,
    coordinateSource,
    validationStatus: transformationChanges ? ("transformed" as const) : ("pending" as const),
    transformations: transformationChanges,
    schemaVersionNumber: schemaVersion,
  };
};
