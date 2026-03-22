/**
 * Unified service for fetching remote data from URLs.
 *
 * Used by both the import wizard (preview-schema/url) and scheduled
 * imports (url-fetch-job). Handles authentication, file type detection,
 * JSON→CSV conversion, and paginated API fetching in a single place.
 *
 * @module
 * @category Import
 */
import { buildAuthHeaders } from "@/lib/jobs/handlers/url-fetch-job/auth";
import { calculateDataHash, fetchWithRetry } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";
import { fetchPaginated, type PaginationConfig } from "@/lib/jobs/handlers/url-fetch-job/paginated-fetch";
import { logger } from "@/lib/logger";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledIngest } from "@/payload-types";

import { convertJsonToCsv, recordsToCsv } from "./json-to-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchRemoteDataOptions {
  sourceUrl: string;
  authConfig?: ScheduledIngest["authConfig"];
  /** Timeout in milliseconds. Default: 60_000 (1 minute). */
  timeout?: number;
  /** Max response size in bytes. */
  maxSize?: number;
  /** Number of retries. Default: 0 (no retries, for preview). */
  maxRetries?: number;
  /** HTTP cache options. */
  cacheOptions?: { useCache: boolean; bypassCache: boolean; respectCacheControl?: boolean };
  /** JSON API handling — recordsPath and pagination config. */
  jsonApiConfig?: { recordsPath?: string; pagination?: PaginationConfig };
  /** Force response format instead of auto-detecting. */
  responseFormat?: "auto" | "csv" | "json";
}

export interface FetchRemoteDataResult {
  /** Final data buffer (CSV if converted from JSON). */
  data: Buffer;
  /** MIME type of the final data. */
  mimeType: string;
  /** File extension of the final data (e.g. ".csv"). */
  fileExtension: string;
  /** SHA-256 hash of the final data. */
  contentHash: string;
  /** Original Content-Type from the server response. */
  originalContentType: string;
  /** True if the response was converted (e.g. JSON→CSV). */
  wasConverted: boolean;
  /** Number of records extracted (if JSON conversion happened). */
  recordCount?: number;
  /** Number of pages fetched (if paginated). */
  pagesProcessed?: number;
}

/** File extensions the import pipeline can process. */
const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx", ".ods", ".txt"]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const isJsonDetected = (mimeType: string, responseFormat?: string): boolean => {
  if (responseFormat === "json") return true;
  if (responseFormat === "csv") return false;
  return mimeType === "application/json";
};

/**
 * Fetch remote data from a URL, detect its type, and optionally convert
 * JSON API responses to CSV.
 *
 * Both the import wizard and scheduled ingest jobs use this function as
 * the single entry point for all remote data fetching.
 *
 * @throws {Error} When the fetch fails, file type is unsupported, or JSON
 *   conversion fails.
 */
export const fetchRemoteData = async (options: FetchRemoteDataOptions): Promise<FetchRemoteDataResult> => {
  const {
    sourceUrl,
    authConfig,
    timeout = 60_000,
    maxSize,
    maxRetries = 0,
    cacheOptions,
    jsonApiConfig,
    responseFormat = "auto",
  } = options;

  const authHeaders = buildAuthHeaders(authConfig);

  logger.info("Fetching remote data", { url: sanitizeUrlForLogging(sourceUrl), timeout, maxRetries, responseFormat });

  // Fetch the data
  const fetchResult = await fetchWithRetry(sourceUrl, {
    authHeaders,
    timeout,
    maxSize,
    retryConfig: { maxRetries },
    cacheOptions: cacheOptions
      ? {
          useCache: cacheOptions.useCache,
          bypassCache: cacheOptions.bypassCache,
          respectCacheControl: cacheOptions.respectCacheControl,
        }
      : undefined,
  });

  // fetchWithRetry already detects file type internally — use its results
  const originalContentType = fetchResult.contentType;
  let finalData = fetchResult.data;
  let finalMimeType = fetchResult.contentType;
  let finalExtension = fetchResult.fileExtension ?? ".bin";
  let wasConverted = false;
  let recordCount: number | undefined;
  let pagesProcessed: number | undefined;

  // JSON response — convert to CSV
  if (isJsonDetected(finalMimeType, responseFormat)) {
    logger.info("JSON response detected, converting to CSV", {
      url: sanitizeUrlForLogging(sourceUrl),
      originalMimeType: finalMimeType,
      hasPagination: jsonApiConfig?.pagination?.enabled === true,
    });

    const recordsPath = jsonApiConfig?.recordsPath ?? undefined;

    if (jsonApiConfig?.pagination?.enabled) {
      // Paginated fetch — fetch all pages
      const result = await fetchPaginated(sourceUrl, jsonApiConfig.pagination, recordsPath, { authHeaders, timeout });

      finalData = recordsToCsv(result.allRecords);
      recordCount = result.totalRecords;
      pagesProcessed = result.pagesProcessed;

      logger.info("Paginated JSON fetch complete", {
        pagesProcessed: result.pagesProcessed,
        totalRecords: result.totalRecords,
      });
    } else {
      // Single response — convert in-place
      const result = convertJsonToCsv(fetchResult.data, { recordsPath });
      finalData = result.csv;
      recordCount = result.recordCount;
    }

    finalMimeType = "text/csv";
    finalExtension = ".csv";
    wasConverted = true;
  }

  // Validate file extension
  if (!SUPPORTED_EXTENSIONS.has(finalExtension)) {
    throw new Error(
      `Unsupported file type: ${finalMimeType} (${finalExtension}). ` +
        "The URL must return CSV, Excel, ODS, or JSON data."
    );
  }

  const contentHash = calculateDataHash(finalData);

  logger.info("Remote data fetched successfully", {
    url: sanitizeUrlForLogging(sourceUrl),
    mimeType: finalMimeType,
    fileExtension: finalExtension,
    fileSize: finalData.length,
    wasConverted,
    recordCount,
  });

  return {
    data: finalData,
    mimeType: finalMimeType,
    fileExtension: finalExtension,
    contentHash,
    originalContentType,
    wasConverted,
    recordCount,
    pagesProcessed,
  };
};
