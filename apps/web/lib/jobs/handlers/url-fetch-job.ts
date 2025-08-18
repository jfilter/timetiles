/**
 * URL Fetch Job Handler
 *
 * This job handles fetching data from URLs for URL-based and scheduled imports.
 * It downloads the data, saves it to the file system, and updates the import-files
 * record to trigger the existing dataset-detection pipeline.
 */

import crypto from "crypto";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import type { ScheduledImport } from "@/payload-types";

export interface UrlFetchJobInput {
  // For scheduled imports
  scheduledImportId?: string;
  // Direct URL fetch parameters
  sourceUrl: string;
  authConfig?: ScheduledImport["authConfig"];
  catalogId?: string;
  originalName: string;
  userId?: string;
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxSize?: number;
  expectedContentType?: string;
}

/**
 * Calculates hash of data for duplicate checking
 */
const calculateDataHash = (data: Buffer): string => crypto.createHash("sha256").update(data).digest("hex");

/**
 * Builds HTTP headers based on authentication configuration
 */
const buildAuthHeaders = (authConfig: ScheduledImport["authConfig"] | undefined): Record<string, string> => {
  const headers: Record<string, string> = {
    "User-Agent": "TimeTiles/1.0 (Data Import Service)",
  };

  if (!authConfig || authConfig.type === "none") {
    return headers;
  }

  switch (authConfig.type) {
    case "api-key":
      if (authConfig.apiKey && authConfig.apiKeyHeader) {
        headers[authConfig.apiKeyHeader] = authConfig.apiKey;
      }
      break;
    case "bearer":
      if (authConfig.bearerToken) {
        headers.Authorization = `Bearer ${authConfig.bearerToken}`;
      }
      break;
    case "basic":
      if (authConfig.basicUsername && authConfig.basicPassword) {
        const credentials = Buffer.from(`${authConfig.basicUsername}:${authConfig.basicPassword}`).toString("base64");
        headers.Authorization = `Basic ${credentials}`;
      }
      break;
  }

  // Parse and add any custom headers from authConfig
  if (authConfig.customHeaders) {
    try {
      const additionalHeaders =
        typeof authConfig.customHeaders === "string" ? JSON.parse(authConfig.customHeaders) : authConfig.customHeaders;

      if (typeof additionalHeaders === "object" && additionalHeaders !== null) {
        Object.assign(headers, additionalHeaders);
      }
    } catch (error) {
      logger.warn("Failed to parse custom headers", { error });
    }
  }

  return headers;
};

/**
 * Detects content type and file extension from response
 */
const detectFileTypeFromResponse = (
  response: Response,
  url: string,
  expectedContentType?: string
): { extension: string; mimeType: string } => {
  let contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  // Use expected content type if provided and actual content type is generic
  if (
    expectedContentType &&
    expectedContentType !== "auto" &&
    (contentType === "application/octet-stream" || !contentType)
  ) {
    // Map simplified enum values to full MIME types
    const mimeTypeMap: Record<string, string> = {
      csv: "text/csv",
      json: "application/json",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    contentType = mimeTypeMap[expectedContentType] ?? expectedContentType;
  }

  // Try to detect from Content-Type header
  if (contentType.includes("text/csv")) {
    return { extension: "csv", mimeType: "text/csv" };
  }
  if (contentType.includes("application/json")) {
    return { extension: "json", mimeType: "application/json" };
  }
  if (contentType.includes("application/vnd.ms-excel")) {
    return { extension: "xls", mimeType: "application/vnd.ms-excel" };
  }
  if (contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
    return { extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  // Fallback to URL extension
  const urlExtension = path.extname(new URL(url).pathname).toLowerCase().slice(1);
  if (["csv", "json", "xls", "xlsx"].includes(urlExtension)) {
    const mimeTypes: Record<string, string> = {
      csv: "text/csv",
      json: "application/json",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    return { extension: urlExtension, mimeType: mimeTypes[urlExtension] ?? "application/octet-stream" };
  }

  // Default to CSV
  return { extension: "csv", mimeType: "text/csv" };
};

/**
 * Fetches data from URL with proper error handling and timeouts
 */
const fetchUrlData = async (
  url: string,
  options: FetchOptions = {}
): Promise<{
  data: Buffer;
  contentType: string;
  contentLength?: number;
}> => {
  const {
    method = "GET",
    headers = {},
    timeout = 60000, // 60 seconds default
    maxSize = 100 * 1024 * 1024, // 100MB default
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    logger.info("Fetching URL data", { url, method, timeout, maxSize });

    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new Error(`File too large: ${contentLength} bytes (max: ${maxSize})`);
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    // Stream the response to handle large files efficiently
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to read response body");
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSize) {
        throw new Error(`File too large during download: ${totalSize} bytes (max: ${maxSize})`);
      }

      chunks.push(value);
    }

    const data = Buffer.concat(chunks);

    logger.info("Successfully fetched URL data", {
      url,
      contentType,
      size: totalSize,
    });

    return {
      data,
      contentType,
      contentLength: totalSize,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
};

/**
 * Implements retry logic with exponential backoff
 */
const fetchWithRetry = async (
  url: string,
  options: FetchOptions,
  maxRetries: number = 3,
  retryDelayMinutes: number = 5
): Promise<{
  data: Buffer;
  contentType: string;
  contentLength?: number;
  attempts: number;
}> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchUrlData(url, options);
      return { ...result, attempts: attempt };
    } catch (error) {
      lastError = error as Error;
      logger.warn(`URL fetch attempt ${attempt} failed`, {
        url,
        attempt,
        maxRetries,
        error: lastError.message,
      });

      if (attempt < maxRetries) {
        // Exponential backoff: delay * attempt
        const delayMs = retryDelayMinutes * 60 * 1000 * attempt;
        // Skip delay in test environment to prevent timeouts
        if (process.env.NODE_ENV !== "test") {
          logger.info(`Retrying in ${delayMs}ms`, { attempt, delayMs });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          logger.info(`Skipping retry delay in test environment`, { attempt });
        }
      }
    }
  }

  throw lastError ?? new Error("Failed to fetch URL after retries");
};

export const urlFetchJob = {
  slug: "url-fetch",
  handler: async ({ input, job, req }: JobHandlerContext<UrlFetchJobInput>) => {
    const { sourceUrl, authConfig, catalogId, originalName, userId, scheduledImportId } = input!;
    const { payload } = req!;
    const startTime = Date.now();

    try {
      logger.info("Starting URL fetch job", { sourceUrl, jobId: job?.id, scheduledImportId });

      if (!sourceUrl) {
        throw new Error("Source URL is required for URL fetch job");
      }

      let scheduledImport: ScheduledImport | null = null;
      let advancedConfig: ScheduledImport["advancedConfig"] = {};

      // Load scheduled import configuration if this is from a scheduled import
      if (scheduledImportId) {
        scheduledImport = await payload.findByID({
          collection: "scheduled-imports",
          id: scheduledImportId,
        });

        if (scheduledImport?.advancedConfig) {
          advancedConfig = scheduledImport.advancedConfig;
        }
      }

      // Build authentication headers (customHeaders are part of authConfig)
      const headers = buildAuthHeaders(authConfig);

      // Configure fetch options from scheduled import settings
      const fetchOptions: FetchOptions = {
        headers,
        // In test environment, use shorter timeout to prevent test timeouts
        timeout:
          process.env.NODE_ENV === "test"
            ? 2000 // 2 seconds in tests
            : (scheduledImport?.timeoutSeconds ?? 120) * 1000,
        maxSize: (advancedConfig?.maxFileSize ?? 100) * 1024 * 1024,
        expectedContentType: advancedConfig?.expectedContentType ?? undefined,
      };

      // Fetch the data with retry logic
      const { data, contentType, contentLength, attempts } = await fetchWithRetry(
        sourceUrl,
        fetchOptions,
        scheduledImport?.maxRetries ?? 1,
        scheduledImport?.retryDelayMinutes ?? 5
      );

      // Check for duplicate content if not skipped
      let contentHash: string | undefined;
      let isDuplicate = false;

      if (scheduledImportId && advancedConfig?.skipDuplicateCheck !== true) {
        contentHash = calculateDataHash(data);

        // Check last successful import for this schedule
        const lastSuccessfulImport = await payload.find({
          collection: "import-files",
          where: {
            "metadata.scheduledExecution.scheduledImportId": {
              equals: scheduledImportId,
            },
            status: {
              equals: "completed",
            },
          },
          sort: "-createdAt",
          limit: 1,
        });

        if (lastSuccessfulImport?.docs && lastSuccessfulImport.docs.length > 0) {
          const metadata = lastSuccessfulImport.docs[0]?.metadata as Record<string, unknown>;
          const lastHash = (metadata?.urlFetch as Record<string, unknown>)?.contentHash;
          if (lastHash === contentHash) {
            isDuplicate = true;
            logger.info("Duplicate content detected, skipping import", {
              scheduledImportId,
              contentHash,
            });
          }
        }
      } else if (scheduledImportId) {
        // Still calculate hash for metadata even if skipping duplicate check
        contentHash = calculateDataHash(data);
      }

      // Detect file type and generate filename
      const { extension, mimeType } = detectFileTypeFromResponse(
        new Response(null, { headers: { "content-type": contentType } }),
        sourceUrl,
        advancedConfig?.expectedContentType ?? undefined
      );

      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const filename = `url-${timestamp}-${uniqueId}.${extension}`;

      // Create import-files data
      const importFileData: Record<string, unknown> = {
        originalName: originalName.includes(".") ? originalName : `${originalName}.${extension}`,
        status: isDuplicate ? "completed" : "pending",
        catalog: catalogId,
        user: userId,
        metadata: {
          urlFetch: {
            originalUrl: sourceUrl,
            fetchedAt: new Date().toISOString(),
            contentType,
            contentLength,
            contentHash,
            isDuplicate,
            attempts,
          },
        },
      };

      // Add scheduled import metadata if this is from a scheduled import
      if (scheduledImportId && scheduledImport) {
        (importFileData.metadata as Record<string, unknown>).scheduledExecution = {
          scheduledImportId,
          scheduledImportName: scheduledImport.name,
          executedAt: new Date().toISOString(),
          scheduleType: scheduledImport.scheduleType,
          frequency: scheduledImport.frequency,
          cronExpression: scheduledImport.cronExpression,
        };

        // Add dataset mapping configuration
        if (scheduledImport.datasetMapping) {
          (importFileData.metadata as Record<string, unknown>).datasetMapping = scheduledImport.datasetMapping;
        }
      }

      // Create the import file with upload data
      const importFile = await payload.create({
        collection: "import-files",
        data: importFileData,
        file: {
          data,
          mimetype: mimeType,
          name: filename,
          size: data.length,
        },
      });

      // Update scheduled import statistics on success
      if (scheduledImportId && scheduledImport) {
        const duration = (Date.now() - startTime) / 1000; // in seconds
        const stats = scheduledImport.statistics ?? {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
        };

        // Calculate new average duration
        const totalRuns = stats.totalRuns ?? 0;
        const avgDuration = stats.averageDuration ?? 0;
        const newAverage = totalRuns > 0 ? (avgDuration * totalRuns + duration) / (totalRuns + 1) : duration;

        await payload.update({
          collection: "scheduled-imports",
          id: scheduledImportId,
          data: {
            lastStatus: "success",
            lastError: null,
            currentRetries: 0,
            statistics: {
              ...stats,
              totalRuns: (stats.totalRuns ?? 0) + 1,
              successfulRuns: (stats.successfulRuns ?? 0) + 1,
              averageDuration: Math.round(newAverage * 100) / 100, // Round to 2 decimals
            },
          },
        });
      }

      // Dataset detection job will be triggered automatically by the afterChange hook
      // in the import-files collection (unless it's a duplicate)

      logger.info("URL fetch job completed successfully", {
        importFileId: importFile.id,
        filename,
        isDuplicate,
        duration: Date.now() - startTime,
      });

      return {
        output: {
          success: true,
          importFileId: importFile.id,
          filename,
          filesize: data.length,
          mimeType,
          isDuplicate,
          attempts,
          contentHash,
          skippedReason: isDuplicate ? "Duplicate content detected" : undefined,
        },
      };
    } catch (error) {
      logError(error, "URL fetch job failed", { sourceUrl, jobId: job?.id });

      // If this is from a scheduled import, update its status
      if (scheduledImportId) {
        try {
          const scheduledImport = await payload.findByID({
            collection: "scheduled-imports",
            id: scheduledImportId,
          });

          if (scheduledImport) {
            const duration = (Date.now() - startTime) / 1000;
            const stats = scheduledImport.statistics ?? {
              totalRuns: 0,
              successfulRuns: 0,
              failedRuns: 0,
              averageDuration: 0,
            };

            // Update average duration even for failures
            const totalRuns = stats.totalRuns ?? 0;
            const avgDuration = stats.averageDuration ?? 0;
            const newAverage = totalRuns > 0 ? (avgDuration * totalRuns + duration) / (totalRuns + 1) : duration;

            await payload.update({
              collection: "scheduled-imports",
              id: scheduledImportId,
              data: {
                lastStatus: "failed",
                lastError: error instanceof Error ? error.message : "Unknown error",
                currentRetries: (scheduledImport.currentRetries ?? 0) + 1,
                statistics: {
                  ...stats,
                  totalRuns: (stats.totalRuns ?? 0) + 1,
                  failedRuns: (stats.failedRuns ?? 0) + 1,
                  averageDuration: Math.round(newAverage * 100) / 100,
                },
              },
            });
          }
        } catch (updateError) {
          logError(updateError, "Failed to update scheduled import status after URL fetch failure", {
            scheduledImportId,
          });
        }
      }

      // Return error output instead of throwing
      return {
        output: {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          attempts: 0,
        },
      };
    }
  },
};
