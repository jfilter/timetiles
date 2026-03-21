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
import { fetchWithRetry } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";
import { createLogger, logError } from "@/lib/logger";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";

import { buildPreviewResult, getPreviewDir, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, validateUrl } from "../helpers";

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
  site: "default",
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

    // Cast to the ScheduledImport authConfig type expected by buildAuthHeaders
    const authHeaders = buildAuthHeaders(authConfig as Parameters<typeof buildAuthHeaders>[0]);

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
      const fetchResult = await fetchWithRetry(sourceUrl, {
        authHeaders,
        timeout: 60000, // 60 second timeout for preview
        maxSize: MAX_FILE_SIZE,
        retryConfig: { maxRetries: 0 }, // No retries for preview
        cacheOptions: { bypassCache: true },
      });

      fileExtension = fetchResult.fileExtension ?? ".bin";
      mimeType = fetchResult.contentType;

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
