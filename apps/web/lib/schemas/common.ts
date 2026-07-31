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
 *
 * An absent parameter defaults to an empty object. Malformed JSON does NOT — it
 * fails validation, because silently substituting `{}` made a broken filter
 * return the full, unfiltered result set with HTTP 200.
 *
 * Keys are capped at MAX_FIELD_KEY_LENGTH (64, mirrored here to keep this module
 * dependency-free) so an over-long key is rejected rather than dropped later by
 * `sanitizeFieldFilters` — same reason.
 */
export const FieldFiltersParamSchema = z.preprocess(
  (val) => {
    if (val == null) return {};
    if (typeof val !== "string") return val;
    try {
      return JSON.parse(val) as Record<string, unknown>;
    } catch {
      // Surface as a validation error rather than an empty (fail-open) filter.
      return val;
    }
  },
  z
    .record(z.string().max(64), z.array(z.string().max(500)).max(100))
    .default({})
    .refine((rec) => Object.keys(rec).length <= 20, { message: "Field filters may contain at most 20 keys" })
);

/**
 * Numeric range filters parameter (JSON-encoded record of field paths to min/max).
 *
 * Parses `?rf={"price":{"min":10,"max":50}}` into
 * `Record<string, { min?: number | null; max?: number | null }>`.
 * Each entry must satisfy `min <= max` (open-ended when either side is null).
 * Invalid JSON silently defaults to an empty object. Keys are capped at 64
 * chars (matching MAX_FIELD_KEY_LENGTH) and the record at 20 entries.
 */
export const RangeFiltersParamSchema = z.preprocess(
  (val) => {
    if (val == null) return {};
    if (typeof val !== "string") return val;
    try {
      return JSON.parse(val) as Record<string, unknown>;
    } catch {
      // See FieldFiltersParamSchema: an empty fallback here silently returns unfiltered data.
      return val;
    }
  },
  z
    .record(
      z.string().max(64),
      z
        // z.number() already rejects NaN/Infinity in Zod 4, so no explicit .finite() needed.
        .object({ min: z.number().nullable().optional(), max: z.number().nullable().optional() })
        .refine((r) => r.min == null || r.max == null || r.min <= r.max, { message: "min must be ≤ max" })
    )
    .default({})
    .refine((rec) => Object.keys(rec).length <= 20, { message: "Range filters may contain at most 20 keys" })
);

/** Degrees a zero-height viewport is widened by — about 1 cm, far below any display precision. */
const DEGENERATE_BOUNDS_EPSILON = 1e-7;

/** Wrap an out-of-range longitude into [-180, 180]; in-range values (incl. ±180) pass through. */
const wrapLongitude = (lng: number): number =>
  lng >= -180 && lng <= 180 ? lng : ((((lng + 180) % 360) + 360) % 360) - 180;

/**
 * Normalize map-viewport bounds before validation.
 *
 * A fully zoomed-out or antimeridian-crossing map viewport is a legitimate
 * state, not malformed input: MapLibre's `getBounds()` reports *unwrapped*
 * longitudes (e.g. `west: -197.4` on the world view, or `east: 185` after
 * panning across the dateline). Rejecting those made `/api/v1/events/geo`
 * return 400 on the initial world view. Instead:
 *
 * - spans ≥ 360° collapse to the full world,
 * - out-of-range longitudes are wrapped into [-180, 180]; the result may have
 *   west > east, which is the established antimeridian-crossing encoding the
 *   query layer already handles with an OR longitude filter (see
 *   events-bounds-antimeridian tests),
 * - latitudes are clamped defensively.
 */
const normalizeBoundsObject = (parsed: Record<string, unknown>): Record<string, unknown> => {
  const { north, south, east, west } = parsed;
  if (
    typeof north !== "number" ||
    typeof south !== "number" ||
    typeof east !== "number" ||
    typeof west !== "number" ||
    !Number.isFinite(east) ||
    !Number.isFinite(west)
  ) {
    return parsed;
  }

  const spansWholeWorld = east - west >= 360;
  const normWest = spansWholeWorld ? -180 : wrapLongitude(west);
  const normEast = spansWholeWorld ? 180 : wrapLongitude(east);

  let normNorth = Number.isFinite(north) ? Math.min(north, 90) : north;
  let normSouth = Number.isFinite(south) ? Math.max(south, -90) : south;

  // A zero-height viewport is degenerate, not malformed: /api/v1/events/bounds returns raw
  // MIN/MAX with no padding, so a single event — or a filter narrowing to one latitude —
  // yields north === south, and the mobile explorer seeds the viewport straight from it.
  // Validation requires north > south, so without this widening those users would get a 422
  // on every bounded query instead of seeing their one event.
  // Only exact equality is widened. An INVERTED range (north < south) stays invalid — that is
  // a caller error, not a viewport, and silently repairing it would filter by something the
  // caller never asked for.
  if (typeof normNorth === "number" && typeof normSouth === "number" && normNorth === normSouth) {
    normNorth = Math.min(90, normSouth + DEGENERATE_BOUNDS_EPSILON);
    if (normNorth <= normSouth) normSouth = Math.max(-90, normNorth - DEGENERATE_BOUNDS_EPSILON);
  }

  return {
    ...parsed,
    // Non-finite latitudes pass through unchanged so validation still rejects them.
    north: normNorth,
    south: normSouth,
    east: normEast,
    west: normWest,
  };
};

/**
 * Parse, normalize and validate a JSON bounds string.
 *
 * An absent (or empty) parameter yields `undefined` — no spatial filter. A parameter that is
 * PRESENT but malformed is returned unchanged so the schema rejects it, for the same reason
 * `ff`/`rf` do: silently dropping it made a broken viewport return every event worldwide with
 * HTTP 200, which reads as "there is nothing here" rather than "your filter was invalid".
 */
export const parseBoundsString = (val: unknown): unknown => {
  if (typeof val !== "string" || !val) return undefined;
  try {
    const parsed = JSON.parse(val) as Record<string, unknown>;
    const normalized = normalizeBoundsObject(parsed);
    // Surface as a validation error rather than a fail-open (unbounded) query.
    if (!isValidBoundsObject(normalized)) return val;
    return normalized;
  } catch {
    return val;
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
 * An absent parameter means "no spatial filter"; a malformed one fails validation.
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
