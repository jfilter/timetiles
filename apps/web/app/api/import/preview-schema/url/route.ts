/**
 * API endpoint for previewing schema from a URL source.
 *
 * POST /api/import/preview-schema/url - Fetch data from URL and get schema preview
 *
 * Accepts a JSON body with a source URL and optional authentication config,
 * fetches the data, and returns detected sheets with headers and sample data.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";
import path from "node:path";

import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { apiRoute, ValidationError } from "@/lib/api";
import { buildAuthHeaders } from "@/lib/jobs/handlers/url-fetch-job/auth";
import { detectFileTypeFromResponse, fetchUrlData } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";
import { createLogger } from "@/lib/logger";

import {
  getPreviewDir,
  MAX_FILE_SIZE,
  parseFileSheets,
  savePreviewMetadata,
  type SheetInfo,
  SUPPORTED_EXTENSIONS,
  validateUrl,
} from "../helpers";

const logger = createLogger("api-preview-schema-url");

const AuthConfigSchema = z.object({
  type: z.enum(["none", "api-key", "bearer", "basic"]),
  apiKey: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  bearerToken: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  customHeaders: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
});

const UrlPreviewBodySchema = z.object({
  sourceUrl: z.url(),
  authConfig: AuthConfigSchema.optional(),
});

/**
 * Preview file schema from URL.
 *
 * Fetches data from the provided URL (with optional authentication),
 * detects the file type, saves to a temp directory, parses it, and
 * returns the preview with a previewId.
 */
export const POST = apiRoute({
  auth: "required",
  body: UrlPreviewBodySchema,
  handler: async ({ body, user }) => {
    const { sourceUrl, authConfig } = body;

    // Additional SSRF validation beyond Zod's z.string().url()
    const urlResult = validateUrl(sourceUrl);
    if ("error" in urlResult) {
      throw new ValidationError(urlResult.error);
    }
    const parsedUrl = urlResult.url;

    // Cast to the ScheduledImport authConfig type expected by buildAuthHeaders
    const authHeaders = buildAuthHeaders(authConfig as Parameters<typeof buildAuthHeaders>[0]);

    logger.info("Fetching data from URL", {
      url: sourceUrl,
      hasAuth: authConfig?.type !== "none" && authConfig !== undefined,
      userId: user.id,
    });

    const previewId = uuidv4();
    const previewDir = getPreviewDir();

    let previewFilePath: string;
    let originalName: string;
    let mimeType: string;
    let fileSize: number;
    let fileExtension: string;

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
      if (!SUPPORTED_EXTENSIONS.includes(fileExtension)) {
        throw new ValidationError(
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
      // Re-throw ValidationError instances (from our own validation above)
      if (fetchError instanceof ValidationError) {
        throw fetchError;
      }
      const errorMessage = fetchError instanceof Error ? fetchError.message : "Unknown error";
      logger.error("Failed to fetch URL", { sourceUrl, error: fetchError });
      throw new ValidationError(`Failed to fetch URL: ${errorMessage}`);
    }

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
      originalName,
      filePath: previewFilePath,
      mimeType,
      fileSize,
      sourceUrl,
    });

    logger.info("Preview schema generated", {
      previewId,
      sheetsCount: sheets.length,
      totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
      isUrlSource: true,
    });

    return Response.json({
      previewId,
      sheets,
      sourceUrl, // Return source URL so UI knows this was a URL-based preview
    });
  },
});
