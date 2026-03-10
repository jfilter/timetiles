/**
 * API endpoint for previewing schema from an uploaded file.
 *
 * POST /api/import/preview-schema/upload - Upload file and get schema preview
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

import {
  ALLOWED_MIME_TYPES,
  FILE_EXTENSION_REGEX,
  getPreviewDir,
  MAX_FILE_SIZE,
  parseFileSheets,
  savePreviewMetadata,
  type SheetInfo,
} from "../helpers";

const logger = createLogger("api-preview-schema-upload");

/**
 * Preview file schema from upload.
 *
 * Accepts a file via FormData, saves it to a temp directory, parses it to
 * detect sheets/headers/sample data, and returns the preview with a previewId.
 */
export const POST = apiRoute({
  auth: "required",
  handler: async ({ req, user }) => {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new ValidationError("A file is required");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type) && !FILE_EXTENSION_REGEX.test(file.name)) {
      throw new ValidationError("Unsupported file type. Please upload a CSV, Excel, or ODS file.");
    }

    const fileExtension = path.extname(file.name).toLowerCase();

    if (!FILE_EXTENSION_REGEX.test(file.name)) {
      throw new ValidationError("Unsupported file extension. Please upload a CSV, Excel, or ODS file.");
    }

    const previewId = uuidv4();
    const previewDir = getPreviewDir();
    const previewFilePath = path.join(previewDir, `${previewId}${fileExtension}`);

    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(previewFilePath, Buffer.from(arrayBuffer));

    logger.info("File saved for preview", { previewId, fileName: file.name, fileSize: file.size, userId: user.id });

    // Parse file to get sheet info
    let sheets: SheetInfo[];
    try {
      sheets = parseFileSheets(previewFilePath, fileExtension);
    } catch (parseError) {
      // Clean up temp file on parse error
      fs.unlinkSync(previewFilePath);
      logger.error("Failed to parse file", { error: parseError });
      throw new ValidationError("Failed to parse file. Please check the file format.");
    }

    // Store preview metadata (intentionally omit authConfig to avoid persisting secrets to disk)
    savePreviewMetadata({
      previewId,
      userId: user.id,
      originalName: file.name,
      filePath: previewFilePath,
      mimeType: file.type,
      fileSize: file.size,
    });

    logger.info("Preview schema generated", {
      previewId,
      sheetsCount: sheets.length,
      totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
      isUrlSource: false,
    });

    return Response.json({ previewId, sheets });
  },
});
