/**
 * Shared helpers for preview-schema endpoints (upload and URL).
 *
 * Contains file parsing, field detection, URL validation, and metadata
 * persistence logic used by both the upload and URL preview routes.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FIELD_PATTERNS, LATITUDE_PATTERNS, LONGITUDE_PATTERNS } from "@timetiles/payload-schema-detection";
import Papa from "papaparse";
import { read, utils } from "xlsx";

import {
  detectLanguageFromSamples,
  type LanguageDetectionResult,
} from "@/lib/services/schema-builder/language-detection";
import { isPrivateUrl } from "@/lib/utils/url-validation";

export const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const SAMPLE_ROW_COUNT = 5;
export const FILE_EXTENSION_REGEX = /\.(csv|xls|xlsx|ods)$/i;
export const SUPPORTED_EXTENSIONS = [".csv", ".xls", ".xlsx", ".ods"];

/** Confidence level for field mapping suggestion */
type ConfidenceLevel = "high" | "medium" | "low" | "none";

/** Field mapping suggestion with confidence */
interface FieldMappingSuggestion {
  path: string | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
}

/** Suggested mappings from auto-detection */
interface SuggestedMappings {
  language: LanguageDetectionResult;
  mappings: {
    titlePath: FieldMappingSuggestion;
    descriptionPath: FieldMappingSuggestion;
    timestampPath: FieldMappingSuggestion;
    latitudePath: FieldMappingSuggestion;
    longitudePath: FieldMappingSuggestion;
    locationPath: FieldMappingSuggestion;
  };
}

export interface SheetInfo {
  index: number;
  name: string;
  rowCount: number;
  headers: string[];
  sampleData: Record<string, unknown>[];
  suggestedMappings?: SuggestedMappings;
}

/** Auth configuration for URL fetching (matches ScheduledImport authConfig structure) */
export interface AuthConfig {
  type: "none" | "api-key" | "bearer" | "basic";
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  customHeaders?: string | Record<string, string>;
}

/**
 * Get confidence level from confidence score
 */
const getConfidenceLevel = (confidence: number): ConfidenceLevel => {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  if (confidence > 0) return "low";
  return "none";
};

type FieldPatternType = keyof typeof FIELD_PATTERNS;

/**
 * Detect a field mapping from headers based on patterns.
 * Uses patterns from the schema detection plugin.
 */
const detectFieldFromHeaders = (headers: string[], fieldType: string, language: string): FieldMappingSuggestion => {
  // Handle coordinate fields using dedicated patterns
  if (fieldType === "latitude") {
    return detectCoordinateField(headers, LATITUDE_PATTERNS);
  }
  if (fieldType === "longitude") {
    return detectCoordinateField(headers, LONGITUDE_PATTERNS);
  }

  // Handle semantic fields using FIELD_PATTERNS from plugin
  const fieldPatterns = FIELD_PATTERNS[fieldType as FieldPatternType];
  if (!fieldPatterns) {
    return { path: null, confidence: 0, confidenceLevel: "none" };
  }

  // Get patterns for language, fallback to English
  const langPatterns = fieldPatterns[language as keyof typeof fieldPatterns] ?? fieldPatterns.eng;
  const engPatterns = fieldPatterns.eng;

  // Try language-specific patterns first
  for (let i = 0; i < langPatterns.length; i++) {
    const pattern = langPatterns[i];
    if (!pattern) continue;
    const match = headers.find((h) => pattern.test(h));
    if (match) {
      const confidence = 0.9 - i * 0.1;
      return { path: match, confidence: Math.max(0.5, confidence), confidenceLevel: getConfidenceLevel(confidence) };
    }
  }

  // Try English patterns as fallback (if not already using English)
  if (language !== "eng") {
    for (let i = 0; i < engPatterns.length; i++) {
      const pattern = engPatterns[i];
      if (!pattern) continue;
      const match = headers.find((h) => pattern.test(h));
      if (match) {
        const confidence = 0.7 - i * 0.1;
        return { path: match, confidence: Math.max(0.3, confidence), confidenceLevel: getConfidenceLevel(confidence) };
      }
    }
  }

  return { path: null, confidence: 0, confidenceLevel: "none" };
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
  const language = detectLanguageFromSamples(sampleData, headers);
  const langCode = language.code;

  return {
    language,
    mappings: {
      titlePath: detectFieldFromHeaders(headers, "title", langCode),
      descriptionPath: detectFieldFromHeaders(headers, "description", langCode),
      timestampPath: detectFieldFromHeaders(headers, "timestamp", langCode),
      latitudePath: detectFieldFromHeaders(headers, "latitude", langCode),
      longitudePath: detectFieldFromHeaders(headers, "longitude", langCode),
      locationPath: detectFieldFromHeaders(headers, "location", langCode),
    },
  };
};

export const getPreviewDir = (): string => {
  const previewDir = path.join(os.tmpdir(), "timetiles-wizard-preview");
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  return previewDir;
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
        obj[header] = row[originalIndex] ?? null;
      });
      sampleData.push(obj);
    }

    // Detect suggested field mappings
    const suggestedMappings = detectSuggestedMappings(headers, sampleData);

    sheets.push({ index, name: sheetName, rowCount, headers, sampleData, suggestedMappings });
  });

  return sheets;
};

/**
 * Validates and parses a URL string.
 * Rejects non-HTTP(S) protocols and private/internal URLs (SSRF protection).
 */
export const validateUrl = (urlString: string): { url: URL } | { error: string } => {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { error: "Invalid URL. Please provide a valid HTTP or HTTPS URL." };
    }
    if (isPrivateUrl(urlString)) {
      return { error: "URLs pointing to private or internal networks are not allowed." };
    }
    return { url };
  } catch {
    return { error: "Invalid URL. Please provide a valid HTTP or HTTPS URL." };
  }
};

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

/**
 * Save preview metadata to disk.
 * Intentionally omits authConfig to avoid persisting secrets to disk.
 */
export const savePreviewMetadata = (opts: {
  previewId: string;
  userId: number;
  originalName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  sourceUrl?: string;
}): void => {
  const previewDir = getPreviewDir();
  const previewMetaPath = path.join(previewDir, `${opts.previewId}.meta.json`);
  fs.writeFileSync(
    previewMetaPath,
    JSON.stringify({
      previewId: opts.previewId,
      userId: opts.userId,
      originalName: opts.originalName,
      filePath: opts.filePath,
      mimeType: opts.mimeType,
      fileSize: opts.fileSize,
      sourceUrl: opts.sourceUrl,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
    })
  );
};
