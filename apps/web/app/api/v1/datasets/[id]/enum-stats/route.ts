/**
 * Live enum value counts for categorical filters.
 *
 * Computes counts via SQL GROUP BY on events.transformed_data JSONB,
 * using the existing GIN index for performance. Accepts the standard
 * event filter parameters (time range, bounds, field filters) so
 * dropdown values reflect the currently visible subset of data.
 *
 * Cross-filtering: when computing values for field X, all OTHER active
 * field filters are applied but X's own filter is excluded.
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

/** A composable SQL fragment, matching the alias used in lib/filters/to-sql-conditions. */
type SqlFragment = ReturnType<typeof sql>;

const MAX_VALUES = 30;

/** Turn a raw field path into a human label: "event_type" / "eventType" -> "Event Type". */
const toFieldLabel = (path: string): string =>
  path
    .replaceAll("_", " ")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/\b\w/g, (c) => c.toUpperCase());

/**
 * Top-N value counts for one field, plus the FULL totals as window aggregates.
 *
 * `total_count` and `distinct_count` are computed over the whole grouped set: Postgres
 * evaluates window functions after GROUP BY but before LIMIT, so they survive the top-N
 * truncation. Deriving them from the returned rows instead made percentages sum to ~100%
 * of the visible slice (a value with a true 3% share rendered as 10%) and reported
 * cardinality as MAX_VALUES for any field with more distinct values than that — enum
 * detection allows up to 50, and tag fields up to 200.
 *
 * The datasets join is required: toSqlConditions references d.catalog_id for access control.
 */
const buildEnumStatsQuery = (fieldPath: string, isTag: boolean, whereClause: SqlFragment) => {
  const arrayValue = sql`e.transformed_data #> string_to_array(${fieldPath}, '.')`;
  const normalizedArrayValue = sql`CASE
        WHEN jsonb_typeof(${arrayValue}) = 'array' THEN ${arrayValue}
        ELSE '[]'::jsonb
      END`;
  const scalarValue = sql`e.transformed_data #>> string_to_array(${fieldPath}, '.')`;
  const totals = sql`(SUM(COUNT(*)) OVER ())::bigint AS total_count, (COUNT(*) OVER ())::integer AS distinct_count`;

  return isTag
    ? sql`SELECT elem AS value, COUNT(*)::integer AS count, ${totals}
              FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id, jsonb_array_elements_text(${normalizedArrayValue}) AS elem
              WHERE ${whereClause}
              GROUP BY elem ORDER BY count DESC LIMIT ${MAX_VALUES}`
    : sql`SELECT ${scalarValue} AS value, COUNT(*)::integer AS count, ${totals}
              FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
              WHERE ${whereClause} AND ${scalarValue} IS NOT NULL
              GROUP BY 1 ORDER BY count DESC LIMIT ${MAX_VALUES}`;
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

    // Find enum candidate fields
    const candidates = Object.values(fm).filter((f) => f.isEnumCandidate);
    if (candidates.length === 0) return { fields: [] };

    const validPaths = new Set(Object.keys(fm));

    // Sort by cardinality — fields closer to 5-15 unique values are most useful for filtering
    candidates.sort((a, b) => Math.abs((a.enumValues?.length ?? 0) - 10) - Math.abs((b.enumValues?.length ?? 0) - 10));

    // Force dataset filter to this dataset (regardless of URL params)
    const baseQuery = { ...query, datasets: [datasetId] };

    // Live SQL counts for all qualifying fields
    const fields = [];
    for (const field of candidates) {
      if (!validPaths.has(field.path)) continue;

      // Validate the key (Unicode-aware) instead of an ASCII strip-and-compare,
      // which skipped every non-ASCII-named field entirely. isValidFieldKey bounds
      // length/depth and the path is passed to SQL only as a bound parameter.
      if (!isValidFieldKey(field.path)) continue;
      const fieldPath = field.path;

      // Cross-filter: remove this field from field filters so its own
      // selection doesn't hide other values in the dropdown
      const { [field.path]: _excluded, ...otherFieldFilters } = baseQuery.ff ?? {};
      const crossFilterQuery = { ...baseQuery, ff: otherFieldFilters };

      const filters = buildCanonicalFilters({
        parameters: crossFilterQuery,
        includePublic: true,
        ownerId: user?.id ?? null,
      });

      if (filters.denyResults) continue;

      // Cross-filter tag fields with containment, not scalar IN — otherwise an
      // active tag filter zeroes out every other field's counts.
      const tagKeys = Object.keys(otherFieldFilters).filter((key) => fm[key]?.isTagField === true);
      if (tagKeys.length > 0) {
        filters.tagFields = new Set(tagKeys);
      }

      // Resolve number formats for active range filters — without them
      // buildRangeFilterConditions silently drops every range filter, so the enum
      // counts would ignore an active numeric range and read too high.
      if (filters.rangeFilters && Object.keys(filters.rangeFilters).length > 0) {
        filters.numberFormats = projectNumberFormats(dataset.interpretationPlan, Object.keys(filters.rangeFilters));
      }

      const whereClause = toSqlWhereClause(filters);
      const isTag = field.isTagField === true;

      const rows = await payload.db.drizzle.execute<{
        value: string;
        count: number;
        total_count: number | string;
        distinct_count: number;
      }>(buildEnumStatsQuery(fieldPath, isTag, whereClause));

      const firstRow = rows.rows[0];
      const total = firstRow ? Number(firstRow.total_count) : 0;
      const cardinality = firstRow ? Number(firstRow.distinct_count) : 0;

      fields.push({
        path: field.path,
        label: toFieldLabel(field.path),
        isTag,
        values: rows.rows.map((r) => ({
          value: String(r.value),
          count: Number(r.count),
          percent: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
        })),
        cardinality,
      });
    }

    return { fields };
  },
});
