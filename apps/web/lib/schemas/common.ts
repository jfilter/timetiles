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
 * Parse and validate a JSON bounds string. Returns the parsed object or undefined.
 */
export const parseBoundsString = (val: unknown): Record<string, unknown> | undefined => {
  if (typeof val !== "string" || !val) return undefined;
  try {
    const parsed = JSON.parse(val) as Record<string, unknown>;
    if (!isValidBoundsObject(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

const isValidBoundsObject = (parsed: unknown): boolean => {
  if (typeof parsed !== "object" || parsed == null) return false;
  const { north, south, east, west } = parsed as Record<string, unknown>;
  return (
    typeof north === "number" &&
    typeof south === "number" &&
    typeof east === "number" &&
    typeof west === "number" &&
    Number.isFinite(north) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(west) &&
    north > south &&
    north <= 90 &&
    south >= -90 &&
    east <= 180 &&
    west >= -180
  );
};

/**
 * Bounds as JSON string parameter, parsed and validated into a MapBounds object.
 *
 * Accepts a JSON string like `{"north":37.8,"south":37.7,"east":-122.4,"west":-122.5}`.
 * Invalid or malformed bounds silently become `undefined`.
 */
export const BoundsParamSchema = z.preprocess(parseBoundsString, BoundsSchema.optional());

/**
 * Scope IDs parameter for view data scoping.
 * Same format as DatasetsParamSchema — comma-separated string → number array.
 */
export const ScopeIdsParamSchema = z
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

export { z };
