/**
 * Shared helpers for preview-schema endpoints (upload and URL).
 *
 * Contains file parsing, field detection, and URL validation logic used by
 * both the upload and URL preview routes. Preview storage operations
 * (path creation, metadata save/load, cleanup) are delegated to
 * `@/lib/ingest/preview-store`.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";

import Papa from "papaparse";
import { read, utils } from "xlsx";

import { ValidationError } from "@/lib/api";
import {
  detectLanguage,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
  matchFieldNamePatterns,
} from "@/lib/services/schema-detection";
import type { ConfidenceLevel, FieldMappingSuggestion, SheetInfo, SuggestedMappings } from "@/lib/types/ingest-wizard";

export type { AuthConfig, SheetInfo, SuggestedMappings } from "@/lib/types/ingest-wizard";

import { getPreviewDir, savePreviewMetadata } from "@/lib/ingest/preview-store";

// Re-export preview storage functions for use by upload/url routes
export { getPreviewDir, savePreviewMetadata };

export const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/json",
  "application/geo+json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const SAMPLE_ROW_COUNT = 5;
export const FILE_EXTENSION_REGEX = /\.(csv|xls|xlsx|ods|json|geojson)$/i;

/**
 * Get confidence level from confidence score
 */
const getConfidenceLevel = (confidence: number): ConfidenceLevel => {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  if (confidence > 0) return "low";
  return "none";
};

/**
 * Detect a field mapping from headers based on patterns.
 *
 * Uses the shared `matchFieldNamePatterns` from the schema detection plugin
 * for pattern matching and language fallback. Confidence is computed from
 * the match position: earlier (more specific) patterns score higher.
 *
 * NOTE: This detection is intentionally separate from `detectFieldMappings`
 * in `field-mapping-detection.ts`. The preview operates on raw headers + a
 * few sample rows available immediately at upload time, while the background
 * job detector layers statistical validation on top of the same pattern match.
 */
const detectFieldFromHeaders = (headers: string[], fieldType: string, language: string): FieldMappingSuggestion => {
  if (fieldType === "latitude") return detectCoordinateField(headers, LATITUDE_PATTERNS);
  if (fieldType === "longitude") return detectCoordinateField(headers, LONGITUDE_PATTERNS);

  const match = matchFieldNamePatterns(
    headers,
    fieldType as "title" | "description" | "locationName" | "timestamp" | "location",
    language
  );
  if (!match) return { path: null, confidence: 0, confidenceLevel: "none" };

  // Position-based confidence: earlier patterns = higher confidence
  // Fallback matches are penalized (0.7 base instead of 0.9)
  const baseConfidence = match.isFallback ? 0.7 : 0.9;
  const decrement = 0.1;
  const minConfidence = match.isFallback ? 0.3 : 0.5;
  const confidence = Math.max(minConfidence, baseConfidence - match.patternIndex * decrement);

  return { path: match.name, confidence, confidenceLevel: getConfidenceLevel(confidence) };
};

/**
 * Detect coordinate fields using dedicated patterns.
 */
const detectCoordinateField = (headers: string[], patterns: RegExp[]): FieldMappingSuggestion => {
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    if (!pattern) continue;
    const match = headers.find((h) => pattern.test(h));
    if (match) {
      const confidence = 0.9 - i * 0.05;
      return { path: match, confidence: Math.max(0.5, confidence), confidenceLevel: getConfidenceLevel(confidence) };
    }
  }
  return { path: null, confidence: 0, confidenceLevel: "none" };
};

/**
 * Detect suggested field mappings for a sheet
 */
export const detectSuggestedMappings = (
  headers: string[],
  sampleData: Record<string, unknown>[]
): SuggestedMappings => {
  // Detect language from headers and sample data
  const language = detectLanguage(sampleData, headers);
  const langCode = language.code;

  return {
    language,
    mappings: {
      titlePath: detectFieldFromHeaders(headers, "title", langCode),
      descriptionPath: detectFieldFromHeaders(headers, "description", langCode),
      locationNamePath: detectFieldFromHeaders(headers, "locationName", langCode),
      timestampPath: detectFieldFromHeaders(headers, "timestamp", langCode),
      endTimestampPath: { path: null, confidence: 0, confidenceLevel: "none" },
      latitudePath: detectFieldFromHeaders(headers, "latitude", langCode),
      longitudePath: detectFieldFromHeaders(headers, "longitude", langCode),
      locationPath: detectFieldFromHeaders(headers, "location", langCode),
    },
  };
};

export const parseCSVPreview = (filePath: string): SheetInfo[] => {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (header) => header.trim(),
    preview: SAMPLE_ROW_COUNT + 1, // +1 for header detection verification
  });

  // Get full row count (need to parse separately)
  const fullResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

  const headers = result.meta.fields ?? [];
  const sampleData = (result.data as Record<string, unknown>[]).slice(0, SAMPLE_ROW_COUNT);

  // Detect suggested field mappings
  const suggestedMappings = detectSuggestedMappings(headers, sampleData);

  return [{ index: 0, name: "Sheet1", rowCount: fullResult.data.length, headers, sampleData, suggestedMappings }];
};

export const parseExcelPreview = (filePath: string): SheetInfo[] => {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });

  const sheets: SheetInfo[] = [];

  workbook.SheetNames.forEach((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const jsonData: unknown[][] = utils.sheet_to_json(worksheet, { header: 1, defval: null });

    if (jsonData.length === 0) {
      sheets.push({
        index,
        name: sheetName,
        rowCount: 0,
        headers: [],
        sampleData: [],
        suggestedMappings: detectSuggestedMappings([], []),
      });
      return;
    }

    const rawHeaders = jsonData[0] as (string | null)[];
    const headerEntries: Array<{ header: string; originalIndex: number }> = [];
    rawHeaders.forEach((h, i) => {
      if (h !== null && h !== "") {
        headerEntries.push({ header: String(h).trim(), originalIndex: i });
      }
    });
    const headers = headerEntries.map((e) => e.header);

    const rowCount = Math.max(0, jsonData.length - 1);
    const sampleData: Record<string, unknown>[] = [];

    for (let i = 1; i <= Math.min(SAMPLE_ROW_COUNT, rowCount); i++) {
      const row = jsonData[i];
      if (!row || !Array.isArray(row)) continue;

      const obj: Record<string, unknown> = {};
      headerEntries.forEach(({ header, originalIndex }) => {
        if (!Object.hasOwn(Object.prototype, header)) {
          obj[header] = row[originalIndex] ?? null;
        }
      });
      sampleData.push(obj);
    }

    // Detect suggested field mappings
    const suggestedMappings = detectSuggestedMappings(headers, sampleData);

    sheets.push({ index, name: sheetName, rowCount, headers, sampleData, suggestedMappings });
  });

  return sheets;
};

// Re-export centralized URL validation for use by preview-schema routes
export { validateExternalHttpUrl as validateUrl } from "@/lib/security/url-validation";

/**
 * Parse file sheets based on file extension.
 */
export const parseFileSheets = (filePath: string, fileExtension: string): SheetInfo[] => {
  if (fileExtension === ".csv") {
    return parseCSVPreview(filePath);
  }
  // xlsx library handles .xls, .xlsx, and .ods files
  return parseExcelPreview(filePath);
};

// ---------------------------------------------------------------------------
// Config suggestion helpers
// ---------------------------------------------------------------------------

import type { Payload } from "payload";

import { findConfigSuggestions } from "@/lib/ingest/config-matcher";
import type { SavePreviewMetadataOpts } from "@/lib/ingest/preview-store";
import { logError, logger } from "@/lib/logger";
import type { ConfigSuggestion } from "@/lib/types/ingest-wizard";

/**
 * Query the user's datasets and find config suggestions matching the given headers.
 *
 * Fetches datasets owned by the user (via catalog.createdBy) and delegates
 * matching to the pure `findConfigSuggestions` function.
 */
export const findConfigSuggestionsForUser = async (
  payload: Payload,
  userId: number,
  headers: string[]
): Promise<ConfigSuggestion[]> => {
  const datasetsResult = await payload.find({
    collection: "datasets",
    where: { "catalog.createdBy": { equals: userId } },
    limit: 100,
    pagination: false,
    depth: 1,
    select: {
      id: true,
      name: true,
      catalog: true,
      fieldMappingOverrides: true,
      ingestTransforms: true,
      idStrategy: true,
      deduplicationConfig: true,
      geoFieldDetection: true,
    },
  });

  // Get schema columns for each dataset (all field names from latest schema version)
  const datasets = await Promise.all(
    datasetsResult.docs.map(async (ds) => {
      const schemaResult = await payload.find({
        collection: "dataset-schemas",
        where: { dataset: { equals: ds.id } },
        sort: "-versionNumber",
        limit: 1,
        select: { schema: true },
      });
      const schemaProps = schemaResult.docs[0]?.schema;
      const schemaColumns =
        schemaProps && typeof schemaProps === "object" && "properties" in schemaProps
          ? Object.keys((schemaProps as { properties: Record<string, unknown> }).properties)
          : undefined;

      return {
        ...ds,
        catalogId: ds.catalog && typeof ds.catalog === "object" ? ds.catalog.id : 0,
        catalogName: ds.catalog && typeof ds.catalog === "object" ? ds.catalog.name : "",
        schemaColumns,
      };
    })
  );

  const suggestions = findConfigSuggestions(headers, datasets);

  logger.info(
    {
      userId,
      headers: headers.length,
      datasets: datasets.length,
      withSchema: datasets.filter((d) => d.schemaColumns).length,
      results: suggestions.length,
    },
    "Config suggestions: %s",
    suggestions.map((s) => `${s.datasetName}(${s.score}%, cat=${s.catalogId})`).join(", ") || "none"
  );

  return suggestions;
};

// ---------------------------------------------------------------------------
// Shared preview pipeline (used by both upload and URL routes)
// ---------------------------------------------------------------------------

interface BuildPreviewResultParams {
  previewFilePath: string;
  fileExtension: string;
  metadata: SavePreviewMetadataOpts;
  logContext: string;
  payload: Payload;
  userId: number;
}

/**
 * Shared pipeline for both upload and URL preview routes.
 *
 * Parses the saved file, stores metadata, finds config suggestions,
 * and returns sheets with suggestions. Cleans up the file on parse errors.
 */
export const buildPreviewResult = async ({
  previewFilePath,
  fileExtension,
  metadata,
  logContext,
  payload,
  userId,
}: BuildPreviewResultParams): Promise<{ sheets: SheetInfo[]; configSuggestions: ConfigSuggestion[] }> => {
  let sheets: SheetInfo[];
  try {
    sheets = parseFileSheets(previewFilePath, fileExtension);
  } catch (parseError) {
    fs.unlinkSync(previewFilePath);
    logError(parseError, `preview-schema-${logContext}-parse`);
    throw new ValidationError("Failed to parse file. Please check the file format.");
  }

  savePreviewMetadata(metadata);

  // Match per-sheet headers against existing datasets
  const perSheetSuggestions = await Promise.all(
    sheets.map((s) => findConfigSuggestionsForUser(payload, userId, s.headers))
  );
  // Deduplicate: keep highest-scoring suggestion per dataset NAME (not ID),
  // so we get one suggestion per unique dataset type even if imported multiple times
  const seen = new Map<string, (typeof perSheetSuggestions)[0][0]>();
  for (const suggestions of perSheetSuggestions) {
    for (const s of suggestions) {
      const existing = seen.get(s.datasetName);
      if (!existing || s.score > existing.score) seen.set(s.datasetName, s);
    }
  }
  const configSuggestions = [...seen.values()].sort((a, b) => b.score - a.score);

  return { sheets, configSuggestions };
};
