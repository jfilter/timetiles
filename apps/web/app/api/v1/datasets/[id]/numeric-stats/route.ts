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
 * Cross-filtering (mirrors enum-stats): when computing bounds for field X, all
 * OTHER active filters are applied but X's own range filter is excluded, so a
 * slider's domain never collapses onto its own selection.
 *
 * Only fields whose column has a resolved number-kind policy get bounds — those
 * are exactly the fields whose range filter the event endpoints actually
 * execute, so the UI never offers a slider that does nothing.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { z } from "zod";

import { apiRoute, NotFoundError } from "@/lib/api";
import { buildCanonicalFilters } from "@/lib/filters/build-canonical-filters";
import { isValidFieldKey } from "@/lib/filters/field-validation";
import { projectNumberFormats } from "@/lib/filters/resolve-number-formats";
import { buildNormalizedNumericExpr, toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { EventFiltersSchema } from "@/lib/schemas/events";
import type { FieldStatistics } from "@/lib/types/schema-detection";
import { toFieldLabel } from "@/lib/utils/strings";

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
      disableErrors: true,
    });

    if (!dataset) throw new NotFoundError("Dataset not found");

    const fm = dataset.fieldMetadata as Record<string, FieldStatistics> | null;
    if (!fm) return { fields: [] };
    const validPaths = new Set(Object.keys(fm));

    // Candidate numeric paths: detection's `fieldTypes.number` group, restricted to
    // valid metadata paths and sanitized like enum-stats.
    const numberPaths = readNumberFieldTypes(dataset.fieldTypes).filter((path) => {
      if (!validPaths.has(path)) return false;
      // Unicode-aware validation (isValidFieldKey) — the prior ASCII strip-and-
      // compare skipped every non-ASCII-named numeric field. The path reaches SQL
      // only as a bound parameter, so no ASCII restriction is needed for safety.
      return isValidFieldKey(path);
    });
    if (numberPaths.length === 0) return { fields: [] };

    // Resolve each numeric path's NumberFormat from the dataset's interpretation
    // plan. A path with NO number-kind policy is dropped rather than defaulted:
    // `resolveDatasetFieldContext` deletes exactly those keys from `rf` on every
    // event endpoint and `buildRangeFilterConditions` skips them, so advertising
    // a slider for them offered the user a control that silently does nothing.
    // The two sides must agree on one rule, and the query side owns it ("never
    // cast blind" — an unknown convention cannot be safely ::numeric-normalized).
    const planFormats = projectNumberFormats(dataset.interpretationPlan, numberPaths);
    const filterablePaths = numberPaths.filter((path) => path in planFormats);
    if (filterablePaths.length === 0) return { fields: [] };

    // Force dataset filter to this dataset (regardless of URL params).
    const baseQuery = { ...query, datasets: [datasetId] };

    /**
     * Build the WHERE scope for one field's bounds query.
     *
     * Cross-filtering mirrors enum-stats: every OTHER active filter applies, but
     * the field's own range filter is excluded. Sharing one clause across all
     * fields computed each slider's domain THROUGH its own filter, so dragging a
     * handle progressively collapsed that slider's own range.
     *
     * Tag containment and number formats are resolved from the already-loaded
     * `dataset` (rather than `resolveDatasetFieldContext`, which would re-fetch
     * it once per field) — without them an active tag filter takes the scalar
     * SQL branch and zeroes every bound, and range filters are dropped.
     */
    const scopeFor = (ownPath: string) => {
      const { [ownPath]: _ownRange, ...otherRanges } = baseQuery.rf ?? {};
      const filters = buildCanonicalFilters({
        parameters: { ...baseQuery, rf: otherRanges },
        includePublic: true,
        ownerId: user?.id ?? null,
      });
      if (filters.denyResults) return null;

      const tagKeys = Object.keys(filters.fieldFilters ?? {}).filter((key) => fm[key]?.isTagField === true);
      if (tagKeys.length > 0) {
        filters.tagFields = new Set(tagKeys);
      }

      if (filters.rangeFilters && Object.keys(filters.rangeFilters).length > 0) {
        filters.numberFormats = projectNumberFormats(dataset.interpretationPlan, Object.keys(filters.rangeFilters));
      }

      return toSqlWhereClause(filters);
    };

    // Run the per-field MIN/MAX bounds queries concurrently instead of N
    // sequential round-trips.
    const fields = (
      await Promise.all(
        filterablePaths.map(async (path) => {
          const whereClause = scopeFor(path);
          if (whereClause == null) return null;

          const value = buildNormalizedNumericExpr(path, planFormats[path]!);
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
            label: toFieldLabel(path),
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
