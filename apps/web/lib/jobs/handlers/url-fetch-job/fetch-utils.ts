/**
 * Fetch utilities for URL fetch jobs.
 *
 * Contains functions for fetching data from URLs with retry logic,
 * content type detection, error handling, and HTTP caching support.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import crypto from "crypto";
import path from "path";

import { logger } from "@/lib/logger";
import type { UrlFetchCacheOptions } from "@/lib/services/cache";
import { getUrlFetchCache, type UrlFetchCache } from "@/lib/services/cache";
import type { ScheduledImport } from "@/payload-types";

export interface FetchResult {
  data: Buffer;
  contentType: string;
  contentLength?: number;
  attempts: number;
  cacheStatus?: string;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxSize?: number;
  expectedContentType?: string;
}

/**
 * Calculates hash of data for duplicate checking.
 */
export const calculateDataHash = (data: Buffer): string => crypto.createHash("sha256").update(data).digest("hex");

/**
 * Detects file type from content type header or data inspection.
 */
export const detectFileTypeFromResponse = (
  contentType: string | undefined,
  data: Buffer,
  sourceUrl: string
): { mimeType: string; fileExtension: string } => {
  // Try to detect from content type header
  if (contentType) {
    const normalizedType = contentType.split(";")[0]?.trim().toLowerCase();

    const typeMap: Record<string, { mimeType: string; fileExtension: string }> = {
      "text/csv": { mimeType: "text/csv", fileExtension: ".csv" },
      "application/csv": { mimeType: "text/csv", fileExtension: ".csv" },
      "application/vnd.ms-excel": { mimeType: "application/vnd.ms-excel", fileExtension: ".xls" },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileExtension: ".xlsx",
      },
      "text/plain": { mimeType: "text/plain", fileExtension: ".txt" },
      "application/json": { mimeType: "application/json", fileExtension: ".json" },
    };

    if (normalizedType && typeMap[normalizedType]) {
      return typeMap[normalizedType];
    }
  }

  // Try to detect from URL extension
  const urlPath = new URL(sourceUrl).pathname;
  const urlExtension = path.extname(urlPath).toLowerCase();

  const extensionMap: Record<string, { mimeType: string; fileExtension: string }> = {
    ".csv": { mimeType: "text/csv", fileExtension: ".csv" },
    ".xls": { mimeType: "application/vnd.ms-excel", fileExtension: ".xls" },
    ".xlsx": {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileExtension: ".xlsx",
    },
    ".txt": { mimeType: "text/plain", fileExtension: ".txt" },
    ".json": { mimeType: "application/json", fileExtension: ".json" },
  };

  if (extensionMap[urlExtension]) {
    return extensionMap[urlExtension];
  }

  // Try to detect from file content
  const header = data.subarray(0, 8).toString("hex");

  // Excel files have specific magic bytes
  if (header.startsWith("504b0304")) {
    // XLSX (ZIP format)
    return {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileExtension: ".xlsx",
    };
  }

  if (header.startsWith("d0cf11e0")) {
    // XLS (OLE format)
    return { mimeType: "application/vnd.ms-excel", fileExtension: ".xls" };
  }

  // Default to CSV if text-like content
  const textSample = data.subarray(0, Math.min(1000, data.length)).toString("utf8");
  if (textSample.includes(",") || textSample.includes("\t") || textSample.includes("\n")) {
    return { mimeType: "text/csv", fileExtension: ".csv" };
  }

  // Ultimate fallback
  return { mimeType: "application/octet-stream", fileExtension: ".bin" };
};

/**
 * Setup abort controller for fetch timeout.
 */
const setupAbortController = (
  timeout: number
): {
  controller?: AbortController;
  timeoutId?: NodeJS.Timeout;
} => {
  let controller: AbortController | undefined;
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    // Create AbortController if available (Node 16+ has native support)
    if (typeof AbortController !== "undefined") {
      // Always use the standard AbortController
      controller = new AbortController();
      timeoutId = setTimeout(() => {
        logger.debug(`Aborting request after ${timeout}ms timeout`);
        controller?.abort();
      }, timeout);
    }
  } catch (e) {
    // AbortController not available or not working properly
    logger.warn("AbortController not available, timeout will not work", { error: e });
  }

  return { controller, timeoutId };
};

/**
 * Build fetch options with signal support.
 */
const buildFetchOptions = (method: string, headers: HeadersInit, controller?: AbortController): RequestInit => {
  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  // Only add signal if controller was successfully created
  if (controller?.signal) {
    fetchOptions.signal = controller.signal;
  }

  return fetchOptions;
};

/**
 * Read response body with size limit.
 */
const readResponseBody = async (
  response: Response,
  maxSize: number
): Promise<{ data: Buffer; contentLength: number }> => {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Unable to read response body");
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    totalSize += chunk.length;

    if (totalSize > maxSize) {
      throw new Error(`File too large: ${totalSize} bytes (max: ${maxSize})`);
    }

    chunks.push(chunk);
  }

  return {
    data: Buffer.concat(chunks),
    contentLength: totalSize,
  };
};

/**
 * Fetches data from a URL with built-in error handling.
 */
export const fetchUrlData = async (
  sourceUrl: string,
  options: FetchOptions = {}
): Promise<{
  data: Buffer;
  contentType: string | undefined;
  contentLength: number | undefined;
}> => {
  const {
    method = "GET",
    headers = {},
    timeout = 30000,
    maxSize = 100 * 1024 * 1024, // 100MB default
  } = options;

  const { controller, timeoutId } = setupAbortController(timeout);

  try {
    const fetchOptions = buildFetchOptions(method, headers, controller);
    const response = await fetch(sourceUrl, fetchOptions);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type") ?? undefined;

    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new Error(`File too large: ${contentLength} bytes (max: ${maxSize})`);
    }

    const { data, contentLength: totalSize } = await readResponseBody(response, maxSize);

    return {
      data,
      contentType,
      contentLength: totalSize,
    };
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if ((error as { name?: string }).name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }

    throw error;
  }
};

/**
 * Helper to perform a single fetch attempt with timeout
 */
const performFetchWithTimeout = async (
  urlFetchCache: UrlFetchCache,
  sourceUrl: string,
  fetchOpts: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean },
  timeout?: number
) => {
  let timeoutId: NodeJS.Timeout | undefined;

  if (timeout) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOpts.signal = controller.signal;
  }

  try {
    const response = await urlFetchCache.fetch(sourceUrl, fetchOpts);
    if (timeoutId) clearTimeout(timeoutId);
    return response;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    if ((error as Error).name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
};

/**
 * Helper to validate response and check size limits
 */
const validateResponse = (
  cachedResponse: { status: number; data: Buffer; headers: Record<string, string> },
  maxSize?: number
) => {
  if (cachedResponse.status < 200 || cachedResponse.status >= 300) {
    throw new Error(`HTTP ${cachedResponse.status}`);
  }

  if (maxSize && cachedResponse.data.length > maxSize) {
    throw new Error(`File too large: ${cachedResponse.data.length} bytes (max: ${maxSize})`);
  }
};

/**
 * Helper to extract cache status from response headers
 */
const getCacheStatus = (headers: Record<string, string>): string | undefined =>
  headers["x-cache"] ?? headers["X-Cache"];

/**
 * Fetches URL with retry logic and HTTP caching support.
 */
const getRetryDelay = (retryConfig?: ScheduledImport["retryConfig"]) => {
  const retryDelayMinutes = retryConfig?.retryDelayMinutes ?? 0.1;
  const isTestEnv = process.env.NODE_ENV === "test";
  return isTestEnv ? 100 : retryDelayMinutes * 60 * 1000;
};

const buildCacheOptions = (
  authHeaders: Record<string, string>,
  fetchOptions: FetchOptions,
  useCache: boolean,
  cacheOptions?: UrlFetchCacheOptions
): RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean } => {
  return {
    method: fetchOptions.method ?? "GET",
    headers: { ...authHeaders, ...fetchOptions.headers },
    bypassCache: !useCache,
    forceRevalidate: cacheOptions?.forceRevalidate,
  };
};

const processFetchResponse = async (
  urlFetchCache: UrlFetchCache,
  sourceUrl: string,
  fetchOpts: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean },
  fetchOptions: FetchOptions,
  attempt: number
): Promise<FetchResult> => {
  const cachedResponse = await performFetchWithTimeout(urlFetchCache, sourceUrl, fetchOpts, fetchOptions.timeout);

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
    attempts: attempt,
    cacheStatus: cacheStatus,
  };
};

export const fetchWithRetry = async (
  sourceUrl: string,
  options: FetchOptions & {
    retryConfig?: ScheduledImport["retryConfig"];
    authHeaders?: Record<string, string>;
    cacheOptions?: UrlFetchCacheOptions;
  } = {}
): Promise<FetchResult> => {
  const { retryConfig, authHeaders = {}, cacheOptions, ...fetchOptions } = options;
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
        url: sourceUrl,
        attempt,
        useCache,
      });

      const fetchOpts = buildCacheOptions(authHeaders, fetchOptions, useCache, cacheOptions);
      return await processFetchResponse(urlFetchCache, sourceUrl, fetchOpts, fetchOptions, attempt);
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Fetch attempt ${attempt} failed`, {
        url: sourceUrl,
        error: lastError.message,
        nextRetryIn: attempt < attemptCount ? currentDelay : null,
      });

      if (attempt < attemptCount) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        currentDelay *= backoffMultiplier;
      }
    }
  }

  throw lastError ?? new Error("Fetch failed");
};
