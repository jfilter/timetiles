/**
 * Converts JSON API responses to CSV format for the import pipeline.
 *
 * Handles auto-detection of the records array within a JSON response,
 * flattening of nested objects, and CSV generation via Papa Parse.
 *
 * @module
 * @category Import
 */
import Papa from "papaparse";

import { logger } from "@/lib/logger";
import { getByPath } from "@/lib/utils/object-path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonToCsvOptions {
  /** Dot-path to the records array, e.g. "data.results" */
  recordsPath?: string;
}

export interface JsonToCsvResult {
  csv: Buffer;
  recordCount: number;
  /** The dot-path that was used (either from options or auto-detected) */
  detectedPath: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Flatten a record's nested objects into dot-separated keys.
 *
 * - Plain objects are recursively flattened: `{ user: { name: "John" } }` becomes `{ "user.name": "John" }`.
 * - Arrays are serialized as JSON strings rather than being expanded.
 * - Primitives (string, number, boolean, null) are kept as-is.
 */
export const flattenObject = (obj: Record<string, unknown>, prefix?: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      // Serialize arrays as JSON strings
      result[fullKey] = JSON.stringify(value);
    } else if (isPlainObject(value)) {
      // Recurse into nested objects
      const nested = flattenObject(value, fullKey);
      Object.assign(result, nested);
    } else {
      result[fullKey] = value;
    }
  }

  return result;
};

/**
 * Auto-detect the records array inside a parsed JSON value.
 *
 * Strategy:
 * 1. If the top-level value is already an array, use it directly (path = "").
 * 2. Otherwise walk the top-level object properties and return the first
 *    property whose value is an array with at least one plain-object element.
 *
 * @returns `{ records, path }` or `null` if no suitable array was found.
 */
const autoDetectRecords = (json: unknown): { records: Record<string, unknown>[]; path: string } | null => {
  // Top-level array
  if (Array.isArray(json)) {
    if (json.length > 0 && isPlainObject(json[0])) {
      return { records: json as Record<string, unknown>[], path: "" };
    }
    return null;
  }

  // Top-level object: scan properties for the first array of objects
  if (isPlainObject(json)) {
    for (const [key, value] of Object.entries(json)) {
      if (Array.isArray(value) && value.length > 0 && isPlainObject(value[0])) {
        return { records: value as Record<string, unknown>[], path: key };
      }
    }
  }

  return null;
};

/**
 * Extract an array of records from a parsed JSON value.
 *
 * If `recordsPath` is given, resolves it via dot-notation and expects an array.
 * Otherwise auto-detects by checking for a top-level array or the first
 * top-level property whose value is an array of objects.
 *
 * Shared by `convertJsonToCsv` and `paginated-fetch`.
 */
export const extractRecordsFromJson = (
  json: unknown,
  recordsPath?: string
): { records: Record<string, unknown>[]; detectedPath: string } => {
  if (recordsPath) {
    const value = getByPath(json, recordsPath);
    if (!Array.isArray(value)) {
      throw new Error(`recordsPath "${recordsPath}" did not resolve to an array.`);
    }
    return { records: value as Record<string, unknown>[], detectedPath: recordsPath };
  }

  const detected = autoDetectRecords(json);
  if (!detected) {
    throw new Error("Could not find records array in JSON response. Specify recordsPath in JSON API configuration.");
  }
  return { records: detected.records, detectedPath: detected.path };
};

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

/**
 * Convert a JSON buffer (an API response body) to CSV.
 *
 * @param jsonBuffer - Raw JSON bytes
 * @param options    - Optional configuration (e.g. explicit `recordsPath`)
 * @returns The generated CSV as a Buffer together with metadata
 * @throws {Error} When JSON cannot be parsed or no records array is found
 */
export const convertJsonToCsv = (jsonBuffer: Buffer, options?: JsonToCsvOptions): JsonToCsvResult => {
  const json: unknown = JSON.parse(jsonBuffer.toString("utf-8"));

  const { records, detectedPath } = extractRecordsFromJson(json, options?.recordsPath);

  logger.info({ recordCount: records.length, detectedPath }, "json-to-csv: found records array");

  const flattened = records.map((record) => flattenObject(record));
  const csvString = Papa.unparse(flattened);
  const csv = Buffer.from(csvString, "utf-8");

  return { csv, recordCount: records.length, detectedPath };
};

/**
 * Convert an array of already-parsed records to CSV.
 *
 * Useful for the paginated-fetch use case where records have already been
 * collected across multiple pages and do not need path detection.
 */
export const recordsToCsv = (records: Record<string, unknown>[]): Buffer => {
  const flattened = records.map((record) => flattenObject(record));
  const csvString = Papa.unparse(flattened);
  return Buffer.from(csvString, "utf-8");
};
