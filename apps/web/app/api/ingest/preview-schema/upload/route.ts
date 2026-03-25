/**
 * API endpoint for previewing schema from an uploaded file.
 *
 * POST /api/ingest/preview-schema/upload - Upload file and get schema preview
 *
 * Accepts a file upload via FormData and returns detected sheets with headers
 * and sample data for the import wizard preview.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";
import path from "node:path";

import { v4 as uuidv4 } from "uuid";

import { apiRoute, ValidationError } from "@/lib/api";
import { createLogger } from "@/lib/logger";

import { ALLOWED_MIME_TYPES, buildPreviewResult, FILE_EXTENSION_REGEX, getPreviewDir, MAX_FILE_SIZE } from "../helpers";

const logger = createLogger("api-preview-schema-upload");

/**
 * Convert an uploaded file buffer to CSV if it's GeoJSON or JSON.
 * Returns the (possibly converted) buffer and extension.
 */
const convertUploadToCsv = async (
  fileBuffer: Buffer,
  fileExtension: string,
  fileMimeType: string,
  previewId: string
): Promise<{ buffer: Buffer; extension: string }> => {
  // GeoJSON by extension or MIME type
  if (fileExtension === ".geojson" || fileMimeType === "application/geo+json") {
    const { convertGeoJsonToCsv } = await import("@/lib/ingest/geojson-to-csv");
    const result = convertGeoJsonToCsv(fileBuffer);
    logger.info({ previewId, featureCount: result.featureCount }, "GeoJSON converted to CSV for preview");
    return { buffer: Buffer.from(result.csv), extension: ".csv" };
  }

  // .json files — content-sniff to distinguish GeoJSON from JSON API
  if (fileExtension === ".json" || fileMimeType === "application/json") {
    const { isGeoJsonBuffer, convertGeoJsonToCsv } = await import("@/lib/ingest/geojson-to-csv");

    if (isGeoJsonBuffer(fileBuffer)) {
      const result = convertGeoJsonToCsv(fileBuffer);
      logger.info({ previewId, featureCount: result.featureCount }, "GeoJSON (.json) converted to CSV for preview");
      return { buffer: Buffer.from(result.csv), extension: ".csv" };
    }

    const { convertJsonToCsv } = await import("@/lib/ingest/json-to-csv");
    const result = convertJsonToCsv(fileBuffer);
    logger.info({ previewId, recordCount: result.recordCount }, "JSON converted to CSV for preview");
    return { buffer: Buffer.from(result.csv), extension: ".csv" };
  }

  return { buffer: fileBuffer, extension: fileExtension };
};

/**
 * Preview file schema from upload.
 *
 * Accepts a file via FormData, saves it to a temp directory, parses it to
 * detect sheets/headers/sample data, and returns the preview with a previewId.
 */
export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { type: "FILE_UPLOAD", keyPrefix: (u) => `preview-upload:${u!.id}` },
  handler: async ({ req, user, payload }) => {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new ValidationError("A file is required");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type) && !FILE_EXTENSION_REGEX.test(file.name)) {
      throw new ValidationError("Unsupported file type. Please upload a CSV, Excel, ODS, JSON, or GeoJSON file.");
    }

    const fileExtension = path.extname(file.name).toLowerCase();

    if (!FILE_EXTENSION_REGEX.test(file.name)) {
      throw new ValidationError("Unsupported file extension. Please upload a CSV, Excel, ODS, JSON, or GeoJSON file.");
    }

    const previewId = uuidv4();
    const previewDir = getPreviewDir();

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // Convert GeoJSON/JSON uploads to CSV before preview
    let converted: { buffer: Buffer; extension: string };
    try {
      converted = await convertUploadToCsv(rawBuffer, fileExtension, file.type, previewId);
    } catch (convError) {
      const message = convError instanceof Error ? convError.message : "Unknown error";
      throw new ValidationError(`Failed to parse file: ${message}`);
    }

    const previewFilePath = path.join(previewDir, `${previewId}${converted.extension}`);
    fs.writeFileSync(previewFilePath, converted.buffer);

    logger.info({ previewId, fileName: file.name, fileSize: file.size, userId: user.id }, "File saved for preview");

    const { sheets, configSuggestions } = await buildPreviewResult({
      previewFilePath,
      fileExtension: converted.extension,
      metadata: {
        previewId,
        userId: user.id,
        originalName: file.name,
        filePath: previewFilePath,
        mimeType: file.type,
        fileSize: file.size,
      },
      logContext: "upload",
      payload,
      userId: user.id,
    });

    return { previewId, sheets, configSuggestions };
  },
});
