/**
 * Fetch utilities for URL fetch jobs.
 *
 * Contains functions for fetching data from URLs with retry logic,
 * content type detection, and error handling.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import crypto from "crypto";
import path from "path";

import { logger } from "@/lib/logger";
import type { ScheduledImport } from "@/payload-types";

export interface FetchResult {
  data: Buffer;
  contentType: string;
  contentLength?: number;
  attempts: number;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxSize?: number;
  expectedContentType?: string;
}

/**
 * Calculates hash of data for duplicate checking
 */
export const calculateDataHash = (data: Buffer): string => crypto.createHash("sha256").update(data).digest("hex");

/**
 * Detects file type from content type header or data inspection
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
 * Setup abort controller for fetch timeout
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
 * Build fetch options with signal support
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
 * Read response body with size limit
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
 * Fetches data from a URL with built-in error handling
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
 * Fetches URL with retry logic
 */
export const fetchWithRetry = async (
  sourceUrl: string,
  options: FetchOptions & {
    retryConfig?: ScheduledImport["retryConfig"];
    authHeaders?: Record<string, string>;
  } = {}
): Promise<FetchResult> => {
  const { retryConfig, authHeaders = {}, ...fetchOptions } = options;
  const maxRetries = retryConfig?.maxRetries ?? 3;
  const retryDelayMinutes = retryConfig?.retryDelayMinutes ?? 0.1; // Default to 0.1 minutes (6 seconds)
  // Use shorter delay in test environment
  const isTestEnv = process.env.NODE_ENV === "test";
  const retryDelay = isTestEnv ? 100 : retryDelayMinutes * 60 * 1000;
  const useExponentialBackoff = retryConfig?.exponentialBackoff ?? true;
  const backoffMultiplier = useExponentialBackoff ? 2 : 1;

  let lastError: Error | undefined;
  let currentDelay = retryDelay;
  const attemptCount = maxRetries + 1; // Total attempts = initial + retries

  for (let attempt = 1; attempt <= attemptCount; attempt++) {
    try {
      logger.info(`Fetching URL (attempt ${attempt}/${attemptCount})`, {
        url: sourceUrl,
        attempt,
      });

      const { data, contentType, contentLength } = await fetchUrlData(sourceUrl, {
        ...fetchOptions,
        headers: { ...authHeaders, ...fetchOptions.headers },
      });

      const detectedType = detectFileTypeFromResponse(contentType, data, sourceUrl);

      return {
        data,
        contentType: detectedType.mimeType,
        contentLength,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Fetch attempt ${attempt} failed`, {
        url: sourceUrl,
        error: lastError.message,
        nextRetryIn: attempt < maxRetries ? currentDelay : null,
      });

      if (attempt < attemptCount) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        currentDelay *= backoffMultiplier;
      }
    }
  }

  throw lastError ?? new Error("Fetch failed");
};
