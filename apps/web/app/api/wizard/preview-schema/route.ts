/**
 * API endpoint for previewing file schema.
 *
 * POST /api/wizard/preview-schema - Upload file and get schema preview
 *
 * Returns detected sheets with headers and sample data for wizard preview.
 *
 * @module
 * @category API Routes
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getPayload } from "payload";
import { v4 as uuidv4 } from "uuid";
import { read, utils } from "xlsx";

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

/**
 * Field name patterns for different languages
 */
const FIELD_PATTERNS: Record<string, Record<string, RegExp[]>> = {
  title: {
    eng: [/^title$/i, /^name$/i, /^event.*name$/i, /^event.*title$/i, /^event$/i],
    deu: [/^titel$/i, /^name$/i, /^bezeichnung$/i, /^veranstaltung$/i],
    default: [/^title$/i, /^name$/i, /^titel$/i],
  },
  description: {
    eng: [/^description$/i, /^details$/i, /^summary$/i, /^notes$/i, /^text$/i],
    deu: [/^beschreibung$/i, /^details$/i, /^zusammenfassung$/i, /^text$/i],
    default: [/^description$/i, /^beschreibung$/i, /^details$/i],
  },
  timestamp: {
    eng: [/^date$/i, /^timestamp$/i, /^datetime$/i, /^time$/i, /^when$/i],
    deu: [/^datum$/i, /^zeitstempel$/i, /^zeit$/i, /^wann$/i],
    default: [/^date$/i, /^datum$/i, /^timestamp$/i, /^time$/i],
  },
  location: {
    eng: [/^address$/i, /^location$/i, /^place$/i, /^venue$/i, /^city$/i],
    deu: [/^adresse$/i, /^ort$/i, /^standort$/i, /^platz$/i, /^stadt$/i],
    default: [/^address$/i, /^location$/i, /^ort$/i, /^adresse$/i],
  },
  latitude: {
    eng: [/^lat$/i, /^latitude$/i, /^lat.*coord$/i, /^y$/i],
    deu: [/^lat$/i, /^breitengrad$/i, /^breite$/i],
    default: [/^lat$/i, /^latitude$/i, /^breitengrad$/i],
  },
  longitude: {
    eng: [/^lon$/i, /^lng$/i, /^longitude$/i, /^long$/i, /^lon.*coord$/i, /^x$/i],
    deu: [/^lon$/i, /^lng$/i, /^längengrad$/i, /^laengengrad$/i, /^länge$/i],
    default: [/^lon$/i, /^lng$/i, /^longitude$/i, /^längengrad$/i],
  },
};

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
 * Detect a field mapping from headers based on patterns
 */
const detectFieldFromHeaders = (headers: string[], fieldType: string, language: string): FieldMappingSuggestion => {
  const patterns = FIELD_PATTERNS[fieldType];
  if (!patterns) {
    return { path: null, confidence: 0, confidenceLevel: "none" };
  }

  // Get patterns for language, fallback to default
  const langPatterns = patterns[language] ?? patterns.default ?? [];
  const defaultPatterns = patterns.default ?? [];

  // Try language-specific patterns first
  for (let i = 0; i < langPatterns.length; i++) {
    const pattern = langPatterns[i];
    if (!pattern) continue;
    const match = headers.find((h) => pattern.test(h));
    if (match) {
      // Higher confidence for earlier patterns (more specific)
      const confidence = 0.9 - i * 0.1;
      return {
        path: match,
        confidence: Math.max(0.5, confidence),
        confidenceLevel: getConfidenceLevel(confidence),
      };
    }
  }

  // Try default patterns as fallback
  for (let i = 0; i < defaultPatterns.length; i++) {
    const pattern = defaultPatterns[i];
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
 * Preview file schema endpoint.
 *
 * Accepts a file upload and returns detected sheets with headers and sample data.
 * The file is stored temporarily with a previewId for later use.
 */
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

    if (!file || !(file instanceof File)) {
      return badRequest("No file provided");
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validate mime type
    const fileExtensionRegex = /\.(csv|xls|xlsx|ods)$/i;
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !fileExtensionRegex.test(file.name)) {
      return badRequest("Unsupported file type. Please upload a CSV, Excel, or ODS file.");
    }

    // Generate preview ID and save file
    const previewId = uuidv4();
    const fileExtension = path.extname(file.name).toLowerCase();

    // Security: Validate extension matches allowed pattern before constructing path
    if (!fileExtensionRegex.test(file.name)) {
      return badRequest("Unsupported file extension. Please upload a CSV, Excel, or ODS file.");
    }

    const previewDir = getPreviewDir();
    const previewFilePath = path.join(previewDir, `${previewId}${fileExtension}`);

    // Save file to temp directory
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(previewFilePath, Buffer.from(arrayBuffer));

    logger.info("File saved for preview", {
      previewId,
      fileName: file.name,
      fileSize: file.size,
      userId: user.id,
    });

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

    // Store preview metadata (could use cache or session)
    const previewMetaPath = path.join(previewDir, `${previewId}.meta.json`);
    fs.writeFileSync(
      previewMetaPath,
      JSON.stringify({
        previewId,
        userId: user.id,
        originalName: file.name,
        filePath: previewFilePath,
        mimeType: file.type,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
      })
    );

    logger.info("Preview schema generated", {
      previewId,
      sheetsCount: sheets.length,
      totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
    });

    return NextResponse.json({
      previewId,
      sheets,
    });
  } catch (error) {
    logger.error("Failed to preview schema", { error });
    return internalError("Failed to preview file schema");
  }
};
