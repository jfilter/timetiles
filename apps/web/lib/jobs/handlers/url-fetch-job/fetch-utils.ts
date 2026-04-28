/**
 * Fetch utilities for URL fetch jobs.
 *
 * Contains functions for fetching data from URLs with retry logic,
 * content type detection, error handling, and HTTP caching support.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import crypto from "node:crypto";
import path from "node:path";

import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { getUrlFetchCache, type UrlFetchCache, type UrlFetchCacheOptions } from "@/lib/services/cache";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";

export interface FetchResult {
  data: Buffer;
  contentType: string;
  contentLength?: number;
  fileExtension?: string;
  attempts: number;
  cacheStatus?: string;
}

/** Retry configuration for URL fetches. */
export interface RetryConfig {
  maxRetries?: number | null;
  exponentialBackoff?: boolean | null;
  retryDelayMinutes?: number | null;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxSize?: number;
  /** Request body (e.g. JSON string for POST requests). */
  body?: string;
}

/**
 * Calculates hash of data for duplicate checking.
 */
export const calculateDataHash = (data: Buffer): string => crypto.createHash("sha256").update(data).digest("hex");

/** Single source of truth for supported file types — derive both content-type and extension lookups. */
const FILE_TYPE_REGISTRY: Array<{ mimeType: string; fileExtension: string; contentTypes: string[] }> = [
  { mimeType: "text/csv", fileExtension: ".csv", contentTypes: ["text/csv", "application/csv"] },
  { mimeType: "application/vnd.ms-excel", fileExtension: ".xls", contentTypes: ["application/vnd.ms-excel"] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileExtension: ".xlsx",
    contentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
  { mimeType: "text/plain", fileExtension: ".txt", contentTypes: ["text/plain"] },
  { mimeType: "application/json", fileExtension: ".json", contentTypes: ["application/json"] },
  {
    mimeType: "application/geo+json",
    fileExtension: ".geojson",
    contentTypes: ["application/geo+json", "application/vnd.geo+json"],
  },
];

type FileTypeInfo = { mimeType: string; fileExtension: string };

const contentTypeMap = new Map<string, FileTypeInfo>(
  FILE_TYPE_REGISTRY.flatMap((entry) =>
    entry.contentTypes.map((ct) => [ct, { mimeType: entry.mimeType, fileExtension: entry.fileExtension }])
  )
);

const extensionMap = new Map<string, FileTypeInfo>(
  FILE_TYPE_REGISTRY.map((entry) => [
    entry.fileExtension,
    { mimeType: entry.mimeType, fileExtension: entry.fileExtension },
  ])
);

const GENERIC_BINARY_CONTENT_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

const normalizeContentType = (contentType: string | undefined): string | undefined =>
  contentType?.split(";")[0]?.trim().toLowerCase();

const isDeclaredUnsupportedContentType = (normalizedType: string | undefined): normalizedType is string =>
  Boolean(normalizedType && !contentTypeMap.has(normalizedType) && !GENERIC_BINARY_CONTENT_TYPES.has(normalizedType));

export const detectFileTypeFromResponse = (
  contentType: string | undefined,
  data: Buffer,
  sourceUrl: string
): FileTypeInfo => {
  // Try to detect from content type header
  const normalizedType = normalizeContentType(contentType);
  if (normalizedType) {
    const match = contentTypeMap.get(normalizedType);
    if (match) return match;
  }

  // Try to detect from file content before rejecting declared but non-canonical
  // MIME types. Real Excel files are often served as application/zip or
  // application/x-ms-excel, but their magic bytes are still authoritative.
  const header = data.subarray(0, 8).toString("hex");

  // Excel files have specific magic bytes
  if (header.startsWith("504b0304")) {
    // XLSX (ZIP format)
    return { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileExtension: ".xlsx" };
  }

  if (header.startsWith("d0cf11e0")) {
    // XLS (OLE format)
    return { mimeType: "application/vnd.ms-excel", fileExtension: ".xls" };
  }

  // Detect JSON by first non-whitespace byte — `{` (0x7B) for objects or
  // `[` (0x5B) for arrays (GeoJSON/record-list). Previously this path fell
  // through to the comma/newline CSV heuristic, which misidentified every
  // JSON file as CSV because any JSON text contains both.
  const firstNonWhitespace = findFirstNonWhitespaceByte(data);
  if (firstNonWhitespace === 0x7b || firstNonWhitespace === 0x5b) {
    return { mimeType: "application/json", fileExtension: ".json" };
  }

  if (isDeclaredUnsupportedContentType(normalizedType)) {
    return { mimeType: normalizedType, fileExtension: ".bin" };
  }

  // Try to detect from URL extension only when the server did not declare a
  // specific unsupported type. This keeps HTML error pages from being imported
  // as CSV just because the URL ends in .csv.
  const urlPath = new URL(sourceUrl).pathname;
  const urlExtension = path.extname(urlPath).toLowerCase();
  const extMatch = extensionMap.get(urlExtension);
  if (extMatch) return extMatch;

  // No reliable signal — fall back to octet-stream rather than silently
  // routing unknown content through the CSV parser. Dataset-detection will
  // surface a readable "unsupported file type" error downstream.
  return { mimeType: "application/octet-stream", fileExtension: ".bin" };
};

/** Return the first non-whitespace byte in the buffer (up to 1024 bytes), or undefined. */
const findFirstNonWhitespaceByte = (data: Buffer): number | undefined => {
  const limit = Math.min(1024, data.length);
  for (let i = 0; i < limit; i++) {
    const byte = data[i];
    // ASCII whitespace: space, tab, LF, CR, vertical tab, form feed
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0b && byte !== 0x0c) {
      return byte;
    }
  }
  return undefined;
};

/**
 * Helper to validate response and check size limits
 */
class HttpFetchError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpFetchError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const validateResponse = (
  cachedResponse: { status: number; data: Buffer; headers: Record<string, string> },
  maxSize?: number
) => {
  if (cachedResponse.status < 200 || cachedResponse.status >= 300) {
    throw new HttpFetchError(cachedResponse.status);
  }

  if (maxSize && cachedResponse.data.length > maxSize) {
    throw new Error(`File too large: ${cachedResponse.data.length} bytes (max: ${maxSize})`);
  }
};

const isRetryableHttpStatus = (status: number): boolean =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const isRetryableFetchError = (error: Error): boolean => {
  if (error instanceof HttpFetchError) {
    return isRetryableHttpStatus(error.status);
  }

  if (error.message.startsWith("File too large:")) {
    return false;
  }

  return true;
};

/**
 * Helper to extract cache status from response headers
 */
const getCacheStatus = (headers: Record<string, string>): string | undefined =>
  headers["x-cache"] ?? headers["X-Cache"];

/**
 * Fetches URL with retry logic and HTTP caching support.
 */
const getRetryDelay = (retryConfig?: RetryConfig) => {
  const retryDelayMinutes = retryConfig?.retryDelayMinutes ?? 0.1;
  const isTestEnv = getEnv().NODE_ENV === "test";
  return isTestEnv ? 100 : retryDelayMinutes * 60 * 1000;
};

const buildCacheOptions = (
  authHeaders: Record<string, string>,
  fetchOptions: FetchOptions,
  useCache: boolean,
  cacheOptions?: UrlFetchCacheOptions,
  userId?: string
): RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; userId?: string; timeout?: number } => {
  const method = fetchOptions.method ?? "GET";
  const headers: Record<string, string> = { ...authHeaders, ...fetchOptions.headers };

  // Auto-set Content-Type for POST with body
  if (method === "POST" && fetchOptions.body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  return {
    method,
    headers,
    body: fetchOptions.body,
    bypassCache: !useCache,
    forceRevalidate: cacheOptions?.forceRevalidate,
    userId,
    timeout: fetchOptions.timeout,
  };
};

const processFetchResponse = async (
  urlFetchCache: UrlFetchCache,
  sourceUrl: string,
  fetchOpts: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; timeout?: number },
  fetchOptions: FetchOptions,
  attempt: number
): Promise<FetchResult> => {
  const cachedResponse = await urlFetchCache.fetch(sourceUrl, fetchOpts);

  const cacheStatus = getCacheStatus(cachedResponse.headers);
  if (cacheStatus) {
    logger.info("Cache status", { url: sourceUrl, status: cacheStatus });
  }

  validateResponse(cachedResponse, fetchOptions.maxSize);

  const contentType = cachedResponse.headers["content-type"] ?? undefined;
  const detectedType = detectFileTypeFromResponse(contentType, cachedResponse.data, sourceUrl);

  return {
    data: cachedResponse.data,
    contentType: detectedType.mimeType,
    contentLength: cachedResponse.data.length,
    fileExtension: detectedType.fileExtension,
    attempts: attempt,
    cacheStatus: cacheStatus,
  };
};

export const fetchWithRetry = async (
  sourceUrl: string,
  options: FetchOptions & {
    retryConfig?: RetryConfig;
    authHeaders?: Record<string, string>;
    cacheOptions?: UrlFetchCacheOptions;
    userId?: string;
  } = {}
): Promise<FetchResult> => {
  const { retryConfig, authHeaders = {}, cacheOptions, userId, ...fetchOptions } = options;
  const maxRetries = retryConfig?.maxRetries ?? 3;
  const retryDelay = getRetryDelay(retryConfig);
  const useExponentialBackoff = retryConfig?.exponentialBackoff ?? true;
  const backoffMultiplier = useExponentialBackoff ? 2 : 1;

  const urlFetchCache = getUrlFetchCache();
  const useCache = cacheOptions?.useCache !== false && !cacheOptions?.bypassCache;

  let lastError: Error | undefined;
  let currentDelay = retryDelay;
  const attemptCount = maxRetries + 1;

  for (let attempt = 1; attempt <= attemptCount; attempt++) {
    try {
      logger.info(`Fetching URL (attempt ${attempt}/${attemptCount})`, {
        url: sanitizeUrlForLogging(sourceUrl),
        attempt,
        useCache,
      });

      const fetchOpts = buildCacheOptions(authHeaders, fetchOptions, useCache, cacheOptions, userId);
      return await processFetchResponse(urlFetchCache, sourceUrl, fetchOpts, fetchOptions, attempt);
    } catch (error) {
      lastError = error as Error;
      const shouldRetry = attempt < attemptCount && isRetryableFetchError(lastError);
      logger.warn(`Fetch attempt ${attempt} failed`, {
        url: sanitizeUrlForLogging(sourceUrl),
        error: lastError.message,
        retryable: shouldRetry,
        nextRetryIn: shouldRetry ? currentDelay : null,
      });

      if (!shouldRetry) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay *= backoffMultiplier;
    }
  }

  throw lastError ?? new Error("Fetch failed");
};
