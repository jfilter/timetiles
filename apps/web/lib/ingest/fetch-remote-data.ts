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
import Papa from "papaparse";

import { buildAuthHeaders } from "@/lib/jobs/handlers/url-fetch-job/auth";
import { calculateDataHash, fetchWithRetry } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";
import { fetchPaginated, type PaginationConfig } from "@/lib/jobs/handlers/url-fetch-job/paginated-fetch";
import { logger } from "@/lib/logger";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledIngest } from "@/payload-types";

import { convertGeoJsonToCsv, isGeoJson, normalizeWfsUrl } from "./geojson-to-csv";
import { enrichRecordsFromDetailPages, extractRecordsFromHtml, type HtmlExtractionConfig } from "./html-to-records";
import { convertJsonToCsv, recordsToCsv } from "./json-to-csv";
import { type PreProcessingConfig, preProcessRecords } from "./pre-process-records";

/** Remove specified fields from all records in-place. */
const stripFields = (records: Record<string, unknown>[], fields: string[]): void => {
  for (const record of records) {
    for (const field of fields) {
      delete record[field];
    }
  }
};

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
  /** Pre-processing: group records by key and merge date fields before CSV conversion. */
  preProcessing?: PreProcessingConfig | null;
  /** Fields to remove from JSON records before CSV conversion. */
  excludeFields?: string[];
  /** Force response format instead of auto-detecting. */
  responseFormat?: "auto" | "csv" | "json" | "geojson" | "html-in-json";
  /** HTML extraction config for html-in-json sources. */
  htmlExtractConfig?: HtmlExtractionConfig;
  /** True when this is the first successful import (enables initialBodyTemplate). */
  isFirstRun?: boolean;
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

const isGeoJsonDetected = (mimeType: string, responseFormat: string | undefined, data: Buffer): boolean => {
  if (responseFormat === "geojson") return true;
  if (responseFormat === "csv" || responseFormat === "json") return false;
  if (mimeType === "application/geo+json" || mimeType === "application/vnd.geo+json") return true;
  // For application/json responses, content-sniff to distinguish GeoJSON from JSON API
  if (mimeType === "application/json") {
    try {
      return isGeoJson(JSON.parse(data.toString("utf-8")));
    } catch {
      return false;
    }
  }
  return false;
};

const isJsonDetected = (mimeType: string, responseFormat?: string): boolean => {
  if (responseFormat === "json") return true;
  if (responseFormat === "csv" || responseFormat === "geojson") return false;
  return mimeType === "application/json";
};

interface ConversionResult {
  finalData: Buffer;
  recordCount: number;
  pagesProcessed?: number;
}

/** Convert a fetched GeoJSON buffer to CSV. */
const convertFetchedGeoJson = (data: Buffer, url: string): ConversionResult => {
  const result = convertGeoJsonToCsv(data);
  logger.info("GeoJSON conversion complete", {
    url: sanitizeUrlForLogging(url),
    featureCount: result.featureCount,
    geometryTypes: result.geometryTypes,
  });
  return { finalData: result.csv, recordCount: result.featureCount };
};

/** Convert HTML-in-JSON response to CSV by extracting records from embedded HTML. */
const convertHtmlInJson = async (
  options: FetchRemoteDataOptions,
  fetchedData: Buffer,
  authHeaders: Record<string, string>,
  timeout: number,
): Promise<ConversionResult> => {
  const { sourceUrl, jsonApiConfig, htmlExtractConfig } = options;
  if (!htmlExtractConfig) throw new Error("htmlExtractConfig required for html-in-json format");

  let records: Record<string, unknown>[];
  let pagesProcessed: number | undefined;

  if (jsonApiConfig?.pagination?.enabled) {
    const result = await fetchPaginated(sourceUrl, jsonApiConfig.pagination, undefined, {
      authHeaders,
      timeout,
      htmlExtractConfig,
    });
    records = result.allRecords;
    pagesProcessed = result.pagesProcessed;
  } else {
    const json: unknown = JSON.parse(fetchedData.toString("utf-8"));
    records = extractRecordsFromHtml(json, htmlExtractConfig);
  }

  // Enrich records from detail pages (dates, descriptions, etc.)
  if (htmlExtractConfig.detailPage) {
    const fetchFn = async (url: string) => {
      const result = await fetchWithRetry(url, { authHeaders, timeout });
      return result.data;
    };
    await enrichRecordsFromDetailPages(records, htmlExtractConfig.detailPage, fetchFn);
  }

  if (options.excludeFields?.length) stripFields(records, options.excludeFields);
  return { finalData: recordsToCsv(records), recordCount: records.length, pagesProcessed };
};

/** Convert a JSON response to CSV, handling pagination and pre-processing. */
const convertFetchedJson = async (
  options: FetchRemoteDataOptions,
  fetchedData: Buffer,
  authHeaders: Record<string, string>,
  timeout: number,
): Promise<ConversionResult> => {
  const { sourceUrl, jsonApiConfig } = options;
  const recordsPath = jsonApiConfig?.recordsPath ?? undefined;

  if (jsonApiConfig?.pagination?.enabled) {
    const result = await fetchPaginated(sourceUrl, jsonApiConfig.pagination, recordsPath, {
      authHeaders,
      timeout,
      isFirstRun: options.isFirstRun,
    });
    let records = result.allRecords;
    if (options.preProcessing) records = preProcessRecords(records, options.preProcessing);
    if (options.excludeFields?.length) stripFields(records, options.excludeFields);
    return { finalData: recordsToCsv(records), recordCount: records.length, pagesProcessed: result.pagesProcessed };
  }

  const result = convertJsonToCsv(fetchedData, {
    recordsPath,
    preProcessing: options.preProcessing ?? undefined,
    excludeFields: options.excludeFields,
  });
  return { finalData: result.csv, recordCount: result.recordCount };
};

/** Check if the API requires POST-based pagination (body template configured). */
const isPostPaginatedApi = (options: FetchRemoteDataOptions): boolean => {
  const p = options.jsonApiConfig?.pagination;
  return !!(p?.enabled && p.method === "POST" && p.bodyTemplate);
};

/**
 * Handle POST-based paginated API fetches (e.g. demonstrations.org).
 * Skips the initial GET probe and goes directly to paginated fetch.
 */
const fetchPostPaginated = async (
  options: FetchRemoteDataOptions,
  authHeaders: Record<string, string>,
): Promise<FetchRemoteDataResult> => {
  const { sourceUrl, jsonApiConfig } = options;
  const timeout = options.timeout ?? 60_000;
  const recordsPath = jsonApiConfig!.recordsPath ?? undefined;
  const result = await fetchPaginated(sourceUrl, jsonApiConfig!.pagination!, recordsPath, {
    authHeaders,
    timeout,
    isFirstRun: options.isFirstRun,
  });

  let records = result.allRecords;
  if (options.preProcessing) {
    records = preProcessRecords(records, options.preProcessing);
  }
  if (options.excludeFields?.length) {
    stripFields(records, options.excludeFields);
  }

  const finalData = recordsToCsv(records);
  const contentHash = calculateDataHash(finalData);

  logger.info("POST paginated JSON fetch complete", {
    pagesProcessed: result.pagesProcessed,
    totalRecords: records.length,
  });

  return {
    data: finalData,
    mimeType: "text/csv",
    fileExtension: ".csv",
    contentHash,
    originalContentType: "application/json",
    wasConverted: true,
    recordCount: records.length,
    pagesProcessed: result.pagesProcessed,
  };
};

/**
 * Fetch remote data from a URL, detect its type, and optionally convert
 * JSON or GeoJSON responses to CSV.
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

  const authHeaders = await buildAuthHeaders(authConfig);

  // Normalize WFS URLs to ensure they return GeoJSON
  const normalizedUrl = normalizeWfsUrl(sourceUrl);

  logger.info("Fetching remote data", {
    url: sanitizeUrlForLogging(normalizedUrl),
    timeout,
    maxRetries,
    responseFormat,
  });

  // POST paginated APIs: skip initial GET probe and go directly to paginated fetch
  if (isPostPaginatedApi(options)) {
    return fetchPostPaginated(options, authHeaders);
  }

  // Fetch the data
  const fetchResult = await fetchWithRetry(normalizedUrl, {
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

  // HTML-in-JSON response — extract records from HTML embedded in JSON
  if (responseFormat === "html-in-json" && options.htmlExtractConfig) {
    logger.info("HTML-in-JSON response, extracting records from HTML", {
      url: sanitizeUrlForLogging(normalizedUrl),
      hasPagination: jsonApiConfig?.pagination?.enabled === true,
    });

    const htmlResult = await convertHtmlInJson(options, fetchResult.data, authHeaders, timeout);
    finalData = htmlResult.finalData;
    recordCount = htmlResult.recordCount;
    pagesProcessed = htmlResult.pagesProcessed;
    finalMimeType = "text/csv";
    finalExtension = ".csv";
    wasConverted = true;
  }
  // GeoJSON response — convert to CSV (check before JSON since GeoJSON is a subset of JSON)
  else if (isGeoJsonDetected(finalMimeType, responseFormat, fetchResult.data)) {
    const geoResult = convertFetchedGeoJson(fetchResult.data, normalizedUrl);
    finalData = geoResult.finalData;
    recordCount = geoResult.recordCount;
    finalMimeType = "text/csv";
    finalExtension = ".csv";
    wasConverted = true;
  }
  // JSON response — convert to CSV
  else if (isJsonDetected(finalMimeType, responseFormat)) {
    logger.info("JSON response detected, converting to CSV", {
      url: sanitizeUrlForLogging(normalizedUrl),
      originalMimeType: finalMimeType,
      hasPagination: jsonApiConfig?.pagination?.enabled === true,
    });

    const jsonResult = await convertFetchedJson(options, fetchResult.data, authHeaders, timeout);
    finalData = jsonResult.finalData;
    recordCount = jsonResult.recordCount;
    pagesProcessed = jsonResult.pagesProcessed;
    finalMimeType = "text/csv";
    finalExtension = ".csv";
    wasConverted = true;
  }

  // Strip excluded fields from native CSV sources (JSON/GeoJSON/HTML paths
  // already strip before CSV conversion — this handles raw CSV responses).
  if (!wasConverted && options.excludeFields?.length && finalExtension === ".csv") {
    const parsed = Papa.parse<Record<string, unknown>>(finalData.toString("utf-8"), {
      header: true,
      skipEmptyLines: true,
    });
    stripFields(parsed.data, options.excludeFields);
    finalData = Buffer.from(Papa.unparse(parsed.data), "utf-8");
  }

  // Validate file extension
  if (!SUPPORTED_EXTENSIONS.has(finalExtension)) {
    throw new Error(
      `Unsupported file type: ${finalMimeType} (${finalExtension}). ` +
        "The URL must return CSV, Excel, ODS, JSON, or GeoJSON data.",
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
