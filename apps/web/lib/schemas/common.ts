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
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
  })
  .openapi("Pagination");

/**
 * Standard error response format.
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    details: z.unknown().optional(),
  })
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
 */
export const CatalogParamSchema = z.coerce.number().int().optional();

/**
 * Date string parameter (ISO 8601 date format).
 */
export const DateParamSchema = z.string().date().optional();

/**
 * Bounds as JSON string parameter (parsed separately for validation).
 */
export const BoundsParamSchema = z.string().optional();

export { z };
