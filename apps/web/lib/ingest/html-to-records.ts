/**
 * Extract structured records from HTML embedded in a JSON response.
 *
 * Used by the data package system to handle `html-in-json` format sources
 * (e.g. WordPress AJAX endpoints that return HTML fragments inside JSON).
 *
 * @module
 * @category Import
 */
import * as cheerio from "cheerio";

import { createLogger } from "@/lib/logger";
import { getByPath } from "@/lib/utils/object-path";

const logger = createLogger("html-to-records");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single field to extract from each HTML record element. */
export interface HtmlFieldDef {
  /** Output column name. */
  name: string;
  /** CSS selector relative to the record element. Empty or omitted = the record element itself. */
  selector?: string;
  /** HTML attribute to read. Omit to extract text content. */
  attribute?: string;
}

/** A field to extract from a detail page. */
export interface DetailPageFieldDef {
  /** Output column name. */
  name: string;
  /** CSS selector on the detail page. */
  selector: string;
  /** HTML attribute to read. Omit to extract text content. */
  attribute?: string;
  /** Regex pattern to extract from the element's text (first match). */
  pattern?: string;
}

/** Configuration for fetching detail pages to enrich records with additional fields. */
export interface DetailPageConfig {
  /** Which record field contains the detail page URL. */
  urlField: string;
  /** Delay in ms between detail page requests. Default: 500. */
  rateLimitMs?: number;
  /** Fields to extract from each detail page. */
  fields: DetailPageFieldDef[];
}

/** Configuration for extracting records from HTML inside a JSON response. */
export interface HtmlExtractionConfig {
  /** Dot-path to the HTML string inside the JSON response (e.g. "html"). */
  htmlPath: string;
  /** CSS selector that matches each record element (e.g. "article.card"). */
  recordSelector: string;
  /** Field definitions describing what to extract from each record element. */
  fields: HtmlFieldDef[];
  /** Optional: fetch each record's detail page to extract additional fields. */
  detailPage?: DetailPageConfig;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Extract a single field value from a cheerio element.
 *
 * - If `attribute` is specified, reads that HTML attribute from the target element.
 * - Otherwise, reads the trimmed text content.
 * - If `selector` is empty/omitted, the record element itself is the target.
 */
const extractField = (recordEl: ReturnType<cheerio.CheerioAPI>, field: HtmlFieldDef): string => {
  const target = field.selector ? recordEl.find(field.selector).first() : recordEl;

  if (target.length === 0) return "";

  if (field.attribute) {
    return (target.attr(field.attribute) ?? "").trim();
  }

  return target.text().trim();
};

/**
 * Extract structured records from HTML content embedded in a JSON response.
 *
 * @param json - The parsed JSON response object.
 * @param config - Extraction configuration specifying where to find the HTML
 *   and how to extract fields from it.
 * @returns An array of flat record objects with string values.
 *
 * @example
 * ```typescript
 * const records = extractRecordsFromHtml(json, {
 *   htmlPath: "html",
 *   recordSelector: "article.card",
 *   fields: [
 *     { name: "title", selector: "h2.card__title" },
 *     { name: "lat", attribute: "data-latitude" },
 *   ],
 * });
 * ```
 */
export const extractRecordsFromHtml = (json: unknown, config: HtmlExtractionConfig): Record<string, string>[] => {
  const htmlString = getByPath(json, config.htmlPath);

  if (typeof htmlString !== "string" || htmlString.length === 0) {
    return [];
  }

  const $ = cheerio.load(htmlString);
  const records: Record<string, string>[] = [];

  $(config.recordSelector).each((_index, element) => {
    const el = $(element);
    const record: Record<string, string> = {};

    for (const field of config.fields) {
      record[field.name] = extractField(el, field);
    }

    records.push(record);
  });

  return records;
};

// ---------------------------------------------------------------------------
// Detail page enrichment
// ---------------------------------------------------------------------------

const PROGRESS_LOG_INTERVAL = 20;
const DEFAULT_RATE_LIMIT_MS = 500;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Extract a single field from a detail page's cheerio document. */
const extractDetailField = ($: cheerio.CheerioAPI, field: DetailPageFieldDef): string => {
  const el = $(field.selector).first();
  if (el.length === 0) return "";

  if (field.attribute) {
    return (el.attr(field.attribute) ?? "").trim();
  }

  const text = el.text().trim();

  if (field.pattern) {
    const match = new RegExp(field.pattern).exec(text);
    return match ? (match[1] ?? match[0]).trim() : "";
  }

  // Collapse whitespace for plain text extraction
  return text.replace(/\s+/g, " ");
};

/**
 * Enrich records by fetching each record's detail page and extracting
 * additional fields. Records are modified in-place.
 *
 * @param records - The records to enrich (mutated in-place).
 * @param config - Detail page configuration.
 * @param fetchFn - Function to fetch a URL and return its HTML as a Buffer.
 */
export const enrichRecordsFromDetailPages = async (
  records: Record<string, unknown>[],
  config: DetailPageConfig,
  fetchFn: (url: string) => Promise<Buffer>
): Promise<void> => {
  const rateLimitMs = config.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;

  logger.info(`Enriching ${records.length} records from detail pages`, {
    urlField: config.urlField,
    fieldCount: config.fields.length,
    rateLimitMs,
  });

  let enriched = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const url = String((record[config.urlField] as string) ?? "").trim();

    if (!url) {
      skipped++;
      continue;
    }

    try {
      const html = await fetchFn(url);
      const $ = cheerio.load(html.toString("utf-8"));

      for (const field of config.fields) {
        const value = extractDetailField($, field);
        if (value) {
          record[field.name] = value;
        }
      }

      enriched++;
    } catch (error) {
      logger.warn(`Failed to fetch detail page`, { url, error: String(error) });
      skipped++;
    }

    if ((i + 1) % PROGRESS_LOG_INTERVAL === 0) {
      logger.info(`Detail page progress: ${i + 1}/${records.length}`, { enriched, skipped });
    }

    if (i < records.length - 1) {
      await delay(rateLimitMs);
    }
  }

  logger.info(`Detail page enrichment complete`, { total: records.length, enriched, skipped });
};
