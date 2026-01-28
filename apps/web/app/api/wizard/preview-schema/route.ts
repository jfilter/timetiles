/**
 * API endpoint for previewing file schema.
 *
 * POST /api/wizard/preview-schema - Upload file or fetch from URL and get schema preview
 *
 * Returns detected sheets with headers and sample data for wizard preview.
 * Supports both file upload and URL fetching with optional authentication.
 *
 * @module
 * @category API Routes
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FIELD_PATTERNS, LATITUDE_PATTERNS, LONGITUDE_PATTERNS } from "@timetiles/payload-schema-detection";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getPayload } from "payload";
import { v4 as uuidv4 } from "uuid";
import { read, utils } from "xlsx";

import { buildAuthHeaders } from "@/lib/jobs/handlers/url-fetch-job/auth";
import { detectFileTypeFromResponse, fetchUrlData } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";
import { createLogger } from "@/lib/logger";
import {
  detectLanguageFromSamples,
  type LanguageDetectionResult,
} from "@/lib/services/schema-builder/language-detection";
import { badRequest, internalError, unauthorized } from "@/lib/utils/api-response";
import config from "@/payload.config";

const logger = createLogger("api-wizard-preview-schema");

const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const SAMPLE_ROW_COUNT = 5;

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

interface SheetInfo {
  index: number;
  name: string;
  rowCount: number;
  headers: string[];
  sampleData: Record<string, unknown>[];
  suggestedMappings?: SuggestedMappings;
}

/** Auth configuration for URL fetching (matches ScheduledImport authConfig structure) */
interface AuthConfig {
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
      return {
        path: match,
        confidence: Math.max(0.5, confidence),
        confidenceLevel: getConfidenceLevel(confidence),
      };
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
        return {
          path: match,
          confidence: Math.max(0.3, confidence),
          confidenceLevel: getConfidenceLevel(confidence),
        };
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
      return {
        path: match,
        confidence: Math.max(0.5, confidence),
        confidenceLevel: getConfidenceLevel(confidence),
      };
    }
  }
  return { path: null, confidence: 0, confidenceLevel: "none" };
};

/**
 * Detect suggested field mappings for a sheet
 */
const detectSuggestedMappings = (headers: string[], sampleData: Record<string, unknown>[]): SuggestedMappings => {
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

const getPreviewDir = (): string => {
  const previewDir = path.join(os.tmpdir(), "timetiles-wizard-preview");
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  return previewDir;
};

const parseCSVPreview = (filePath: string): SheetInfo[] => {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (header) => header.trim(),
    preview: SAMPLE_ROW_COUNT + 1, // +1 for header detection verification
  });

  // Get full row count (need to parse separately)
  const fullResult = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = result.meta.fields ?? [];
  const sampleData = (result.data as Record<string, unknown>[]).slice(0, SAMPLE_ROW_COUNT);

  // Detect suggested field mappings
  const suggestedMappings = detectSuggestedMappings(headers, sampleData);

  return [
    {
      index: 0,
      name: "Sheet1",
      rowCount: fullResult.data.length,
      headers,
      sampleData,
      suggestedMappings,
    },
  ];
};

const parseExcelPreview = (filePath: string): SheetInfo[] => {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });

  const sheets: SheetInfo[] = [];

  workbook.SheetNames.forEach((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const jsonData: unknown[][] = utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    });

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

    const headers = (jsonData[0] as (string | null)[])
      .filter((h): h is string => h !== null && h !== "")
      .map((h) => String(h).trim());

    const rowCount = Math.max(0, jsonData.length - 1);
    const sampleData: Record<string, unknown>[] = [];

    for (let i = 1; i <= Math.min(SAMPLE_ROW_COUNT, rowCount); i++) {
      const row = jsonData[i];
      if (!row || !Array.isArray(row)) continue;

      const obj: Record<string, unknown> = {};
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] ?? null;
      });
      sampleData.push(obj);
    }

    // Detect suggested field mappings
    const suggestedMappings = detectSuggestedMappings(headers, sampleData);

    sheets.push({
      index,
      name: sheetName,
      rowCount,
      headers,
      sampleData,
      suggestedMappings,
    });
  });

  return sheets;
};

/**
 * Validates and parses a URL string.
 */
const validateUrl = (urlString: string): URL | null => {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

/**
 * Parses auth config from form data.
 */
const parseAuthConfig = (formData: FormData): AuthConfig | null => {
  const authType = formData.get("authType") as string | null;
  if (!authType || authType === "none") {
    return null;
  }

  const authConfig: AuthConfig = { type: authType as AuthConfig["type"] };

  switch (authType) {
    case "api-key":
      authConfig.apiKey = (formData.get("apiKey") as string) || undefined;
      authConfig.apiKeyHeader = (formData.get("apiKeyHeader") as string) || "X-API-Key";
      break;
    case "bearer":
      authConfig.bearerToken = (formData.get("bearerToken") as string) || undefined;
      break;
    case "basic":
      authConfig.username = (formData.get("username") as string) || undefined;
      authConfig.password = (formData.get("password") as string) || undefined;
      break;
  }

  return authConfig;
};

/**
 * Preview file schema endpoint.
 *
 * Accepts either a file upload OR a source URL and returns detected sheets with headers and sample data.
 * The file is stored temporarily with a previewId for later use.
 *
 * For URL sources, optional authentication can be provided via form data:
 * - authType: "none" | "api-key" | "bearer" | "basic"
 * - apiKey, apiKeyHeader (for api-key type)
 * - bearerToken (for bearer type)
 * - username, password (for basic type)
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity, sonarjs/max-lines-per-function
export const POST = async (req: NextRequest) => {
  try {
    const payload = await getPayload({ config });

    // Get user from session
    const { user } = await payload.auth({ headers: req.headers });

    if (!user) {
      return unauthorized();
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file");
    const sourceUrl = formData.get("sourceUrl") as string | null;

    // Must have either file or sourceUrl
    if ((!file || !(file instanceof File)) && !sourceUrl) {
      return badRequest("Either a file or sourceUrl is required");
    }

    const previewId = uuidv4();
    const previewDir = getPreviewDir();
    const fileExtensionRegex = /\.(csv|xls|xlsx|ods)$/i;

    let previewFilePath: string;
    let originalName: string;
    let mimeType: string;
    let fileSize: number;
    let fileExtension: string;

    if (sourceUrl) {
      // URL-based fetch
      const parsedUrl = validateUrl(sourceUrl);
      if (!parsedUrl) {
        return badRequest("Invalid URL. Please provide a valid HTTP or HTTPS URL.");
      }

      // Parse auth config from form data
      const authConfig = parseAuthConfig(formData);
      // Cast to the ScheduledImport authConfig type expected by buildAuthHeaders
      const authHeaders = buildAuthHeaders(authConfig as Parameters<typeof buildAuthHeaders>[0]);

      logger.info("Fetching data from URL", {
        url: sourceUrl,
        hasAuth: authConfig?.type !== "none" && authConfig !== null,
        userId: user.id,
      });

      try {
        const fetchResult = await fetchUrlData(sourceUrl, {
          headers: authHeaders,
          timeout: 60000, // 60 second timeout for preview
          maxSize: MAX_FILE_SIZE,
        });

        // Detect file type from response
        const detectedType = detectFileTypeFromResponse(fetchResult.contentType, fetchResult.data, sourceUrl);
        fileExtension = detectedType.fileExtension;
        mimeType = detectedType.mimeType;

        // Validate detected file type
        if (![".csv", ".xls", ".xlsx", ".ods"].includes(fileExtension)) {
          return badRequest(
            `Unsupported file type detected: ${mimeType}. The URL must return CSV, Excel, or ODS data.`
          );
        }

        // Save fetched data to temp file
        previewFilePath = path.join(previewDir, `${previewId}${fileExtension}`);
        fs.writeFileSync(previewFilePath, fetchResult.data);

        originalName = path.basename(parsedUrl.pathname) || `url-import${fileExtension}`;
        fileSize = fetchResult.data.length;

        logger.info("URL data fetched and saved for preview", {
          previewId,
          sourceUrl,
          detectedType: mimeType,
          fileSize,
          userId: user.id,
        });
      } catch (fetchError) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : "Unknown error";
        logger.error("Failed to fetch URL", { sourceUrl, error: fetchError });
        return badRequest(`Failed to fetch URL: ${errorMessage}`);
      }
    } else if (file instanceof File) {
      // File upload (existing logic)
      if (file.size > MAX_FILE_SIZE) {
        return badRequest(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type) && !fileExtensionRegex.test(file.name)) {
        return badRequest("Unsupported file type. Please upload a CSV, Excel, or ODS file.");
      }

      fileExtension = path.extname(file.name).toLowerCase();

      if (!fileExtensionRegex.test(file.name)) {
        return badRequest("Unsupported file extension. Please upload a CSV, Excel, or ODS file.");
      }

      previewFilePath = path.join(previewDir, `${previewId}${fileExtension}`);

      const arrayBuffer = await file.arrayBuffer();
      fs.writeFileSync(previewFilePath, Buffer.from(arrayBuffer));

      originalName = file.name;
      mimeType = file.type;
      fileSize = file.size;

      logger.info("File saved for preview", {
        previewId,
        fileName: file.name,
        fileSize: file.size,
        userId: user.id,
      });
    } else {
      return badRequest("Invalid request");
    }

    // Parse file to get sheet info
    let sheets: SheetInfo[];
    try {
      if (fileExtension === ".csv") {
        sheets = parseCSVPreview(previewFilePath);
      } else {
        // xlsx library handles .xls, .xlsx, and .ods files
        sheets = parseExcelPreview(previewFilePath);
      }
    } catch (parseError) {
      // Clean up temp file on parse error
      fs.unlinkSync(previewFilePath);
      logger.error("Failed to parse file", { error: parseError });
      return badRequest("Failed to parse file. Please check the file format.");
    }

    // Store preview metadata
    const previewMetaPath = path.join(previewDir, `${previewId}.meta.json`);
    fs.writeFileSync(
      previewMetaPath,
      JSON.stringify({
        previewId,
        userId: user.id,
        originalName,
        filePath: previewFilePath,
        mimeType,
        fileSize,
        sourceUrl: sourceUrl ?? undefined, // Store source URL if provided
        authConfig: sourceUrl ? parseAuthConfig(formData) : undefined, // Store auth config for URL sources
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
      })
    );

    logger.info("Preview schema generated", {
      previewId,
      sheetsCount: sheets.length,
      totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
      isUrlSource: !!sourceUrl,
    });

    return NextResponse.json({
      previewId,
      sheets,
      sourceUrl: sourceUrl ?? undefined, // Return source URL so UI knows this was a URL-based preview
    });
  } catch (error) {
    logger.error("Failed to preview schema", { error });
    return internalError("Failed to preview file schema");
  }
};
