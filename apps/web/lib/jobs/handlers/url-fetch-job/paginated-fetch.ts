/**
 * Paginated JSON API fetching for scheduled ingests.
 *
 * Handles offset-based, page-based, and cursor-based pagination strategies,
 * collecting all records across multiple pages into a single result array.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import { flattenGeoJsonFeature, isGeoJson } from "@/lib/ingest/geojson-to-csv";
import { extractRecordsFromHtml, type HtmlExtractionConfig } from "@/lib/ingest/html-to-records";
import { extractRecordsFromJson } from "@/lib/ingest/json-to-csv";
import { logger } from "@/lib/logger";
import { getByPath } from "@/lib/utils/object-path";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";

import { fetchWithRetry } from "./fetch-utils";

/** Hard ceiling on pages to prevent runaway loops regardless of user config. */
const ABSOLUTE_MAX_PAGES = 500;

/** Hard ceiling on total records to prevent memory exhaustion. */
const MAX_TOTAL_RECORDS = 100_000;

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
  /** Dot-path to max page count in the JSON response (page-based pagination). */
  maxPagesPath?: string;
  /** Safety limit on pages fetched. Default: 50, hard cap: 500. */
  maxPages?: number;
  /** Maximum total records across all pages. Default: 100,000. */
  maxRecords?: number;
  /** HTTP method for pagination requests. Default: "GET". */
  method?: "GET" | "POST";
  /** JSON body template with {{offset}}, {{limit}}, {{days_ago_N}}, {{today}} placeholders for POST. */
  bodyTemplate?: string;
  /** Body template used only on the first successful run. Falls back to bodyTemplate if absent. */
  initialBodyTemplate?: string;
}

export interface PaginatedFetchOptions {
  authHeaders?: Record<string, string>;
  timeout?: number;
  cacheOptions?: { useCache: boolean; bypassCache: boolean; respectCacheControl: boolean };
  /** When set, extract records from HTML embedded in the JSON response instead of treating JSON as structured data. */
  htmlExtractConfig?: HtmlExtractionConfig;
  /** True when this is the first successful import (no prior successful runs). */
  isFirstRun?: boolean;
}

export interface PaginatedFetchResult {
  allRecords: Record<string, unknown>[];
  pagesProcessed: number;
  totalRecords: number;
}

/**
 * Resolve dynamic date placeholders in a template string.
 *
 * - `{{days_ago_N}}` → ISO date N days before now (at midnight)
 * - `{{today}}` → today's date at midnight
 */
const resolveDynamicDates = (template: string): string =>
  template
    .replace(/\{\{days_ago_(\d+)\}\}/g, (_, days) => {
      const d = new Date();
      d.setDate(d.getDate() - Number(days));
      return d.toISOString().split("T")[0] + "T00:00:00";
    })
    .replace(/\{\{today\}\}/g, new Date().toISOString().split("T")[0] + "T00:00:00");

/**
 * Builds a JSON request body for POST-based pagination by substituting
 * placeholder tokens in the body template.
 */
const buildPageBody = (
  template: string,
  state: { page: number; offset: number; cursor: string },
  limitValue: number
): string =>
  resolveDynamicDates(
    template
      .replace(/\{\{offset\}\}/g, String(state.offset))
      .replace(/\{\{limit\}\}/g, String(limitValue))
      .replace(/\{\{page\}\}/g, String(state.page))
      .replace(/\{\{cursor\}\}/g, state.cursor)
  );

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
  json: unknown,
  currentPage: number
): { more: boolean; nextCursor?: string } => {
  const limitValue = config.limitValue ?? DEFAULT_LIMIT;

  // Zero records always means we are done
  if (pageRecordCount === 0) {
    return { more: false };
  }

  // If a maxPagesPath is configured, stop when we've reached the max page
  if (config.maxPagesPath) {
    const maxPages = getByPath(json, config.maxPagesPath);
    if (typeof maxPages === "number" && currentPage >= maxPages) {
      return { more: false };
    }
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
  const maxRecords = paginationConfig.maxRecords ?? MAX_TOTAL_RECORDS;
  const allRecords: Record<string, unknown>[] = [];
  let pagesProcessed = 0;

  const state = { page: 1, offset: 0, cursor: "" };

  // Select body template: use initialBodyTemplate on first run if available, otherwise bodyTemplate
  const activeBodyTemplate =
    options.isFirstRun && paginationConfig.initialBodyTemplate
      ? paginationConfig.initialBodyTemplate
      : paginationConfig.bodyTemplate;
  const isPost = paginationConfig.method === "POST" && !!activeBodyTemplate;
  const limitValue = paginationConfig.limitValue ?? DEFAULT_LIMIT;

  while (pagesProcessed < maxPages) {
    const pageUrl = isPost ? baseUrl : buildPageUrl(baseUrl, paginationConfig, state);
    const pageBody = isPost ? buildPageBody(activeBodyTemplate, state, limitValue) : undefined;

    logger.info("Fetching page", {
      page: pagesProcessed + 1,
      totalSoFar: allRecords.length,
      url: sanitizeUrlForLogging(pageUrl),
    });

    const fetchResult = await fetchWithRetry(pageUrl, {
      method: isPost ? "POST" : undefined,
      body: pageBody,
      authHeaders: options.authHeaders,
      timeout: options.timeout,
      cacheOptions: options.cacheOptions
        ? { useCache: options.cacheOptions.useCache, bypassCache: options.cacheOptions.bypassCache }
        : undefined,
    });

    const json: unknown = JSON.parse(fetchResult.data.toString("utf-8"));
    let pageRecords: Record<string, unknown>[];
    try {
      if (options.htmlExtractConfig) {
        // HTML-in-JSON: extract records from HTML fragment embedded in the JSON response
        pageRecords = extractRecordsFromHtml(json, options.htmlExtractConfig);
      } else if (isGeoJson(json)) {
        // GeoJSON FeatureCollections need special handling: flatten properties,
        // extract coordinates, and preserve feature.id as _feature_id.
        const features = (json as { features: Array<Record<string, unknown>> }).features;
        pageRecords = features.map((f) => flattenGeoJsonFeature(f as never));
      } else {
        pageRecords = extractRecordsFromJson(json, recordsPath).records;
      }
    } catch {
      // No records found on this page — treat as empty
      pageRecords = [];
    }

    allRecords.push(...pageRecords);
    pagesProcessed++;

    if (allRecords.length >= maxRecords) {
      logger.warn("Reached maximum record limit", { maxRecords, pagesProcessed });
      break;
    }

    if (pageRecords.length === 0) {
      logger.info("Page returned 0 records, stopping pagination", { pagesProcessed, totalRecords: allRecords.length });
      break;
    }

    const { more, nextCursor } = hasMorePages(
      paginationConfig,
      pageRecords.length,
      allRecords.length,
      json,
      state.page
    );

    if (!more) {
      logger.info("No more pages to fetch", { pagesProcessed, totalRecords: allRecords.length });
      break;
    }

    // Advance pagination state for the next iteration
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
