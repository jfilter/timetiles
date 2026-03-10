/**
 * Common Zod schemas shared across API endpoints.
 *
 * These schemas provide runtime validation AND automatic OpenAPI spec generation.
 * Changes to these schemas automatically update the OpenAPI documentation.
 *
 * @module
 * @category Schemas
 */
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI methods
extendZodWithOpenApi(z);

/**
 * Geographic bounding box for spatial queries.
 */
export const BoundsSchema = z
  .object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .openapi("Bounds");

/**
 * Pagination parameters.
 */
export const PaginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
  })
  .openapi("Pagination");

/**
 * Standard error response format.
 */
export const ErrorResponseSchema = z
  .object({ error: z.string(), code: z.string().optional(), details: z.unknown().optional() })
  .openapi("ErrorResponse");

/**
 * Dataset IDs parameter.
 *
 * Supports multiple input formats:
 * - Comma-separated: "1,2,3"
 * - Array: ["1", "2", "3"]
 * - Mixed: ["1,2", "3"]
 */
export const DatasetsParamSchema = z
  .preprocess((val) => {
    if (Array.isArray(val)) {
      return val.flatMap((v) => String(v).split(",")).filter(Boolean);
    }
    if (typeof val === "string") {
      return val.split(",").filter(Boolean);
    }
    return [];
  }, z.array(z.coerce.number().int()))
  .openapi({ type: "array", items: { type: "integer" } });

/**
 * Catalog ID parameter (coerced from string to number).
 * Empty strings are treated as undefined (no catalog filter).
 */
export const CatalogParamSchema = z.preprocess(
  (val) => (val === "" || val == null ? undefined : val),
  z.coerce.number().int().optional()
);

/**
 * Date string parameter (ISO 8601 date format).
 * Empty strings are treated as undefined (no date filter).
 */
export const DateParamSchema = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
  z.iso.date().optional()
);

/**
 * Field filters parameter (JSON-encoded record of field paths to value arrays).
 *
 * Parses `?ff={"category":["A","B"]}` into `Record<string, string[]>`.
 * Invalid JSON silently defaults to an empty object.
 */
export const FieldFiltersParamSchema = z.preprocess(
  (val) => {
    if (typeof val !== "string") return {};
    try {
      return JSON.parse(val) as Record<string, unknown>;
    } catch {
      return {};
    }
  },
  z.record(z.string(), z.array(z.string())).default({})
);

/**
 * Bounds as JSON string parameter, parsed and validated into a MapBounds object.
 *
 * Accepts a JSON string like `{"north":37.8,"south":37.7,"east":-122.4,"west":-122.5}`.
 * Invalid or malformed bounds silently become `undefined`.
 */
export const BoundsParamSchema = z.preprocess((val) => {
  if (typeof val !== "string" || !val) return undefined;
  try {
    const parsed = JSON.parse(val) as Record<string, unknown>;
    if (
      typeof parsed === "object" &&
      parsed != null &&
      typeof parsed.north === "number" &&
      typeof parsed.south === "number" &&
      typeof parsed.east === "number" &&
      typeof parsed.west === "number" &&
      parsed.north > parsed.south &&
      parsed.north <= 90 &&
      parsed.south >= -90 &&
      parsed.east <= 180 &&
      parsed.west >= -180 &&
      Number.isFinite(parsed.north) &&
      Number.isFinite(parsed.south) &&
      Number.isFinite(parsed.east) &&
      Number.isFinite(parsed.west)
    ) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}, BoundsSchema.optional());

export { z };
