/**
 * Live numeric bounds (min/max) for a dataset's numeric STRING columns.
 *
 * Range filters normalize stored raw text to a numeric value at QUERY time using
 * the column's resolved {@link NumberFormat}; the per-column convention lives on
 * the dataset's persisted interpretation plan (see `resolve-number-formats`).
 *
 * `numericStats` (schema-detection.ts) is populated ONLY for native JS numbers,
 * so EU string columns (e.g. "1.234,56") have no precomputed bounds. This route
 * therefore computes min/max with a LIVE SQL aggregate that parses each column
 * using its NumberFormat — exactly the normalization the SQL range-filter block
 * uses (strip thousands separator, convert decimal separator to ".", regex-guard
 * the ::numeric cast so it never throws on non-numeric/empty cells).
 *
 * Bounds reflect the currently visible subset: the standard event filter
 * parameters (time range, bounds, field filters) are applied to the same
 * canonical-filter scope, forced to this single dataset.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { z } from "zod";

import { apiRoute, NotFoundError } from "@/lib/api";
import { buildCanonicalFilters } from "@/lib/filters/build-canonical-filters";
import { isValidFieldKey } from "@/lib/filters/field-validation";
import { projectNumberFormats } from "@/lib/filters/resolve-number-formats";
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { EventFiltersSchema } from "@/lib/schemas/events";
import type { FieldStatistics } from "@/lib/types/schema-detection";
import type { NumberFormat } from "@/lib/utils/number-parsing";

/** US default convention for numeric columns lacking a resolved plan policy. */
const US_FORMAT: NumberFormat = { decimalSeparator: ".", thousandsSeparator: null };

interface NumericBoundsRow extends Record<string, unknown> {
  min: number | null;
  max: number | null;
  is_integer: boolean | null;
}

/**
 * Read a dataset's `fieldTypes.number` list (the schema-detection numeric group),
 * tolerating Payload's `json` field surfacing as `unknown`.
 */
const readNumberFieldTypes = (fieldTypes: unknown): string[] => {
  if (fieldTypes == null || typeof fieldTypes !== "object" || Array.isArray(fieldTypes)) return [];
  const numbers = (fieldTypes as Record<string, unknown>).number;
  if (!Array.isArray(numbers)) return [];
  return numbers.filter((v): v is string => typeof v === "string");
};

/** Derive a human-readable label from a field path (mirrors enum-stats). */
const labelFor = (path: string): string =>
  path
    .replaceAll("_", " ")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/\b\w/g, (c) => c.toUpperCase());

/** Build the regex-guarded normalized `::numeric` expression for one field/format. */
const normalizedNumericExpr = (fieldPath: string, format: NumberFormat) => {
  let normalized = sql`(e.transformed_data #>> string_to_array(${fieldPath}, '.'))`;
  // Strip thousands separator first, then convert the decimal separator to '.'.
  if (format.thousandsSeparator) {
    normalized = sql`replace(${normalized}, ${format.thousandsSeparator}, '')`;
  }
  if (format.decimalSeparator === ",") {
    normalized = sql`replace(${normalized}, ',', '.')`;
  }
  // Only US-canonical numeric text becomes ::numeric; everything else → NULL.
  // The `\.` must reach Postgres literally, hence `\\.` in this JS template.
  return sql`CASE WHEN ${normalized} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${normalized}::numeric ELSE NULL END`;
};

export const GET = apiRoute({
  auth: "optional",
  params: z.object({ id: z.string().regex(/^\d+$/) }),
  query: EventFiltersSchema,
  handler: async ({ payload, params, query, user }) => {
    const datasetId = Number(params.id);

    // Use Payload's built-in access control instead of overrideAccess.
    const dataset = await payload.findByID({
      collection: "datasets",
      id: datasetId,
      depth: 0,
      user,
      overrideAccess: false,
    });

    if (!dataset) throw new NotFoundError("Dataset not found");

    const fm = dataset.fieldMetadata as Record<string, FieldStatistics> | null;
    if (!fm) return { fields: [] };
    const validPaths = new Set(Object.keys(fm));

    // Candidate numeric paths: detection's `fieldTypes.number` group, restricted to
    // valid metadata paths and sanitized like enum-stats.
    const numberPaths = readNumberFieldTypes(dataset.fieldTypes).filter((path) => {
      if (!validPaths.has(path)) return false;
      const cleaned = path.replaceAll(/[^a-zA-Z0-9_.]/g, "");
      return cleaned === path && cleaned.length > 0 && cleaned.length <= 100 && isValidFieldKey(path);
    });
    if (numberPaths.length === 0) return { fields: [] };

    // Resolve each numeric path's NumberFormat from the dataset's interpretation
    // plan; columns with no number-kind policy fall back to the US default (the
    // path was still classified numeric by detection — e.g. native-number columns
    // that stringify as "42"/"1.5", which are US-canonical and ::numeric-castable).
    const planFormats = projectNumberFormats(dataset.interpretationPlan, numberPaths);

    // Force dataset filter to this dataset (regardless of URL params).
    const baseQuery = { ...query, datasets: [datasetId] };

    // The dataset scope/where is identical for every field, so resolve it once
    // rather than per field.
    const filters = buildCanonicalFilters({ parameters: baseQuery, includePublic: true, ownerId: user?.id ?? null });
    if (filters.denyResults) return { fields: [] };
    const whereClause = toSqlWhereClause(filters);

    // Run the per-field MIN/MAX bounds queries concurrently instead of N
    // sequential round-trips.
    const fields = (
      await Promise.all(
        numberPaths.map(async (path) => {
          const value = normalizedNumericExpr(path, planFormats[path] ?? US_FORMAT);
          // isInteger from precomputed numericStats when present (native numbers),
          // else from the live parse: all numeric rows whole.
          const knownIsInteger = fm[path]?.numericStats?.isInteger;
          const sqlQuery = sql`
            SELECT MIN(v)::float8 AS min, MAX(v)::float8 AS max, bool_and(v = trunc(v)) AS is_integer
            FROM (
              SELECT ${value} AS v
              FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
              WHERE ${whereClause}
            ) s
            WHERE v IS NOT NULL`;

          const result = await payload.db.drizzle.execute<NumericBoundsRow>(sqlQuery);
          const row = result.rows[0];
          if (row?.min == null || row.max == null) return null; // No numeric rows in scope.

          return {
            path,
            label: labelFor(path),
            min: Number(row.min),
            max: Number(row.max),
            isInteger: knownIsInteger ?? row.is_integer ?? false,
          };
        })
      )
    ).filter((field): field is NonNullable<typeof field> => field !== null);

    return { fields };
  },
});
