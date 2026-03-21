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
import { fetchRemoteData } from "@/lib/import/fetch-remote-data";
import { createLogger, logError } from "@/lib/logger";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledImport } from "@/payload-types";

import { buildPreviewResult, getPreviewDir, MAX_FILE_SIZE, validateUrl } from "../helpers";

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

const UrlPreviewBodySchema = z.object({ sourceUrl: z.url(), authConfig: AuthConfigSchema.optional() });

/**
 * Preview file schema from URL.
 *
 * Fetches data from the provided URL (with optional authentication),
 * detects the file type, saves to a temp directory, parses it, and
 * returns the preview with a previewId.
 */
export const POST = apiRoute({
  auth: "required",
  rateLimit: { type: "FILE_UPLOAD", keyPrefix: (u) => `preview-url:${u!.id}` },
  body: UrlPreviewBodySchema,
  handler: async ({ body, user, payload }) => {
    const { sourceUrl, authConfig } = body;

    // Additional SSRF validation beyond Zod's z.string().url()
    const urlResult = validateUrl(sourceUrl);
    if ("error" in urlResult) {
      throw new ValidationError(urlResult.error);
    }
    const parsedUrl = urlResult.url;

    logger.info(
      {
        url: sanitizeUrlForLogging(sourceUrl),
        hasAuth: authConfig?.type !== "none" && authConfig !== undefined,
        userId: user.id,
      },
      "Fetching data from URL"
    );

    const previewId = uuidv4();
    const previewDir = getPreviewDir();

    let previewFilePath: string;
    let originalName: string;
    let mimeType: string;
    let fileSize: number;
    let fileExtension: string;

    try {
      const result = await fetchRemoteData({
        sourceUrl,
        authConfig: authConfig as ScheduledImport["authConfig"],
        timeout: 60_000,
        maxSize: MAX_FILE_SIZE,
        maxRetries: 0,
        cacheOptions: { useCache: false, bypassCache: true },
      });

      fileExtension = result.fileExtension;
      mimeType = result.mimeType;

      // Save fetched data to temp file for preview
      previewFilePath = path.join(previewDir, `${previewId}${fileExtension}`);
      fs.writeFileSync(previewFilePath, result.data);

      originalName = path.basename(parsedUrl.pathname) || `url-import${fileExtension}`;
      fileSize = result.data.length;

      logger.info(
        { previewId, sourceUrl: sanitizeUrlForLogging(sourceUrl), detectedType: mimeType, fileSize, userId: user.id },
        "URL data fetched and saved for preview"
      );
    } catch (fetchError) {
      // Re-throw ValidationError instances (from our own validation above)
      if (fetchError instanceof ValidationError) {
        throw fetchError;
      }
      const errorMessage = fetchError instanceof Error ? fetchError.message : "Unknown error";
      logError(fetchError, "preview-schema-url-fetch", { sourceUrl: sanitizeUrlForLogging(sourceUrl) });
      throw new ValidationError(`Failed to fetch URL: ${errorMessage}`);
    }

    const { sheets, configSuggestions } = await buildPreviewResult({
      previewFilePath,
      fileExtension,
      metadata: { previewId, userId: user.id, originalName, filePath: previewFilePath, mimeType, fileSize, sourceUrl },
      logContext: "url",
      payload,
      userId: user.id,
    });

    return {
      previewId,
      sheets,
      sourceUrl, // Return source URL so UI knows this was a URL-based preview
      fileName: originalName,
      contentLength: fileSize,
      contentType: mimeType,
      configSuggestions,
    };
  },
});
