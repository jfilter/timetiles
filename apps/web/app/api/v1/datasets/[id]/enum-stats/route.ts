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
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";
import { EventFiltersSchema } from "@/lib/schemas/events";
import type { FieldStatistics } from "@/lib/types/schema-detection";

const MAX_VALUES = 30;

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

      const fieldPath = field.path.replaceAll(/[^a-zA-Z0-9_.]/g, "");
      if (fieldPath !== field.path || fieldPath.length === 0 || fieldPath.length > 100) continue;

      // Cross-filter: remove this field from field filters so its own
      // selection doesn't hide other values in the dropdown
      const { [field.path]: _excluded, ...otherFieldFilters } = baseQuery.ff;
      const crossFilterQuery = { ...baseQuery, ff: otherFieldFilters };

      const filters = buildCanonicalFilters({
        parameters: crossFilterQuery,
        includePublic: true,
        ownerId: user?.id ?? null,
      });

      if (filters.denyResults) continue;

      const whereClause = toSqlWhereClause(filters);
      const isTag = field.isTagField === true;
      const limit = String(MAX_VALUES);

      // Join datasets table — toSqlConditions references d.catalog_id for access control.
      // fieldPath is used as a JSONB key (not a value), so use sql.raw — it's already sanitized above.
      const quotedPath = "'" + fieldPath + "'";
      const key = sql.raw(quotedPath);
      const sqlQuery = isTag
        ? sql`SELECT elem AS value, COUNT(*)::integer AS count
              FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id, jsonb_array_elements_text(e.transformed_data -> ${key}) AS elem
              WHERE ${whereClause} AND jsonb_typeof(e.transformed_data -> ${key}) = 'array'
              GROUP BY elem ORDER BY count DESC LIMIT ${sql.raw(limit)}`
        : sql`SELECT e.transformed_data ->> ${key} AS value, COUNT(*)::integer AS count
              FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
              WHERE ${whereClause} AND e.transformed_data ->> ${key} IS NOT NULL
              GROUP BY e.transformed_data ->> ${key} ORDER BY count DESC LIMIT ${sql.raw(limit)}`;

      const rows = await payload.db.drizzle.execute<{ value: string; count: number }>(sqlQuery);

      const total = rows.rows.reduce((s, r) => s + Number(r.count), 0);
      const label = field.path
        .replaceAll("_", " ")
        .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll(/\b\w/g, (c) => c.toUpperCase());

      fields.push({
        path: field.path,
        label,
        isTag,
        values: rows.rows.map((r) => ({
          value: String(r.value),
          count: Number(r.count),
          percent: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
        })),
        cardinality: rows.rows.length,
      });
    }

    return { fields };
  },
});
