/**
 * Paginated JSON API fetching for scheduled imports.
 *
 * Handles offset-based, page-based, and cursor-based pagination strategies,
 * collecting all records across multiple pages into a single result array.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import { logger } from "@/lib/logger";
import { getByPath } from "@/lib/utils/object-path";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";

import { fetchWithRetry } from "./fetch-utils";

/** Hard ceiling on pages to prevent runaway loops regardless of user config. */
const ABSOLUTE_MAX_PAGES = 500;

/** Default number of records requested per page. */
const DEFAULT_LIMIT = 100;

/** Default maximum number of pages to fetch. */
const DEFAULT_MAX_PAGES = 50;

export interface PaginationConfig {
  enabled: boolean;
  type: "offset" | "cursor" | "page";
  /** Query param name for offset or page number. Default: "page". */
  pageParam?: string;
  /** Query param name for per-page limit. Default: "limit". */
  limitParam?: string;
  /** Number of records per page. Default: 100. */
  limitValue?: number;
  /** Query param name for cursor value (cursor pagination only). */
  cursorParam?: string;
  /** Dot-path to next cursor value in the JSON response. */
  nextCursorPath?: string;
  /** Dot-path to total record count in the JSON response. */
  totalPath?: string;
  /** Safety limit on pages fetched. Default: 50, hard cap: 500. */
  maxPages?: number;
}

export interface PaginatedFetchOptions {
  authHeaders?: Record<string, string>;
  timeout?: number;
  cacheOptions?: { useCache: boolean; bypassCache: boolean; respectCacheControl: boolean };
}

export interface PaginatedFetchResult {
  allRecords: Record<string, unknown>[];
  pagesProcessed: number;
  totalRecords: number;
}

/**
 * Extracts records from a parsed JSON response using a dot-path.
 *
 * When `recordsPath` is provided, traverses the object to that path and
 * expects an array. When omitted, the function auto-detects: if the
 * response is already an array it is used directly, otherwise the first
 * top-level key whose value is an array is selected.
 */
const extractRecords = (json: unknown, recordsPath: string | undefined): Record<string, unknown>[] => {
  let target: unknown;

  if (recordsPath) {
    target = getByPath(json, recordsPath);
  } else if (Array.isArray(json)) {
    target = json;
  } else if (typeof json === "object" && json !== null) {
    // Auto-detect: pick the first array-valued key
    const obj = json as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        target = obj[key];
        break;
      }
    }
  }

  if (!Array.isArray(target)) {
    return [];
  }

  return target as Record<string, unknown>[];
};

/**
 * Builds the URL for a specific page by appending or replacing pagination
 * query parameters on the base URL.
 */
const buildPageUrl = (
  baseUrl: string,
  config: PaginationConfig,
  state: { page: number; offset: number; cursor: string }
): string => {
  const url = new URL(baseUrl);
  const limitParam = config.limitParam ?? "limit";
  const limitValue = config.limitValue ?? DEFAULT_LIMIT;

  url.searchParams.set(limitParam, String(limitValue));

  switch (config.type) {
    case "offset": {
      const paramName = config.pageParam ?? "offset";
      url.searchParams.set(paramName, String(state.offset));
      break;
    }
    case "page": {
      const paramName = config.pageParam ?? "page";
      url.searchParams.set(paramName, String(state.page));
      break;
    }
    case "cursor": {
      const paramName = config.cursorParam ?? "cursor";
      if (state.cursor) {
        url.searchParams.set(paramName, state.cursor);
      }
      break;
    }
  }

  return url.toString();
};

/**
 * Determines whether there are more pages to fetch based on the pagination
 * type, the number of records returned, and optional total-count metadata.
 */
const hasMorePages = (
  config: PaginationConfig,
  pageRecordCount: number,
  allRecordCount: number,
  json: unknown
): { more: boolean; nextCursor?: string } => {
  const limitValue = config.limitValue ?? DEFAULT_LIMIT;

  // Zero records always means we are done
  if (pageRecordCount === 0) {
    return { more: false };
  }

  // If a totalPath is configured and we have reached or exceeded it, stop
  if (config.totalPath) {
    const total = getByPath(json, config.totalPath);
    if (typeof total === "number" && allRecordCount >= total) {
      return { more: false };
    }
  }

  if (config.type === "cursor") {
    const rawCursor = config.nextCursorPath ? getByPath(json, config.nextCursorPath) : undefined;
    const nextCursor = typeof rawCursor === "string" || typeof rawCursor === "number" ? String(rawCursor) : undefined;
    if (!nextCursor || nextCursor.length === 0) {
      return { more: false };
    }
    return { more: true, nextCursor };
  }

  // For offset and page: fewer records than the limit means last page
  if (pageRecordCount < limitValue) {
    return { more: false };
  }

  return { more: true };
};

/**
 * Fetches all pages from a paginated JSON API endpoint and collects the
 * records into a single array.
 *
 * Supports three pagination strategies:
 * - **offset** -- uses a numeric offset incremented by `limitValue`
 * - **page** -- uses a page number starting at 1
 * - **cursor** -- uses a cursor value extracted from each response
 *
 * @param baseUrl - The API endpoint URL (may already contain query params)
 * @param paginationConfig - Pagination strategy and parameter configuration
 * @param recordsPath - Dot-path to the records array in each response, or
 *   `undefined` to auto-detect
 * @param options - Authentication headers, timeout, and cache settings
 * @returns All collected records with page and count metadata
 */
export const fetchPaginated = async (
  baseUrl: string,
  paginationConfig: PaginationConfig,
  recordsPath: string | undefined,
  options: PaginatedFetchOptions
): Promise<PaginatedFetchResult> => {
  const maxPages = Math.min(paginationConfig.maxPages ?? DEFAULT_MAX_PAGES, ABSOLUTE_MAX_PAGES);
  const allRecords: Record<string, unknown>[] = [];
  let pagesProcessed = 0;

  const state = { page: 1, offset: 0, cursor: "" };

  while (pagesProcessed < maxPages) {
    const pageUrl = buildPageUrl(baseUrl, paginationConfig, state);

    logger.info("Fetching page", {
      page: pagesProcessed + 1,
      totalSoFar: allRecords.length,
      url: sanitizeUrlForLogging(pageUrl),
    });

    const fetchResult = await fetchWithRetry(pageUrl, {
      authHeaders: options.authHeaders,
      timeout: options.timeout,
      cacheOptions: options.cacheOptions
        ? { useCache: options.cacheOptions.useCache, bypassCache: options.cacheOptions.bypassCache }
        : undefined,
    });

    const json: unknown = JSON.parse(fetchResult.data.toString("utf-8"));
    const pageRecords = extractRecords(json, recordsPath);

    allRecords.push(...pageRecords);
    pagesProcessed++;

    if (pageRecords.length === 0) {
      logger.info("Page returned 0 records, stopping pagination", { pagesProcessed, totalRecords: allRecords.length });
      break;
    }

    const { more, nextCursor } = hasMorePages(paginationConfig, pageRecords.length, allRecords.length, json);

    if (!more) {
      logger.info("No more pages to fetch", { pagesProcessed, totalRecords: allRecords.length });
      break;
    }

    // Advance pagination state for the next iteration
    const limitValue = paginationConfig.limitValue ?? DEFAULT_LIMIT;
    state.page += 1;
    state.offset += limitValue;
    if (nextCursor) {
      state.cursor = nextCursor;
    }
  }

  if (pagesProcessed >= maxPages) {
    logger.info("Reached maximum page limit", { maxPages, totalRecords: allRecords.length });
  }

  return { allRecords, pagesProcessed, totalRecords: allRecords.length };
};
