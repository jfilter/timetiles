/**
 * Live enum value counts for categorical filters.
 *
 * Computes counts via SQL GROUP BY on events.transformed_data JSONB,
 * using the existing GIN index for performance.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { z } from "zod";

import { apiRoute, NotFoundError } from "@/lib/api";
import type { FieldStatistics } from "@/lib/types/schema-detection";

const MAX_VALUES = 30;

export const GET = apiRoute({
  auth: "optional",
  params: z.object({ id: z.string().min(1) }),
  handler: async ({ payload, params, user }) => {
    const datasetId = Number(params.id);

    // Use Payload's built-in access control instead of overrideAccess.
    // This respects catalog/dataset visibility rules automatically.
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

    // Find enum candidate fields — trust isEnumCandidate from schema detection
    const candidates = Object.values(fm).filter((f) => f.isEnumCandidate);
    if (candidates.length === 0) return { fields: [] };

    // Validate field paths against fieldMetadata keys to prevent injection.
    // Only query fields that actually exist in the metadata.
    const validPaths = new Set(Object.keys(fm));

    // Sort by cardinality — fields closer to 5-15 unique values are most useful for filtering
    candidates.sort((a, b) => Math.abs((a.enumValues?.length ?? 0) - 10) - Math.abs((b.enumValues?.length ?? 0) - 10));

    // Live SQL counts for all qualifying fields
    const fields = [];
    for (const field of candidates) {
      if (!validPaths.has(field.path)) continue;

      // Sanitize field path (alphanumeric + underscore + dot only)
      const fieldPath = field.path.replaceAll(/[^a-zA-Z0-9_.]/g, "");
      if (fieldPath !== field.path || fieldPath.length === 0 || fieldPath.length > 100) continue;

      // Build query with sql.raw for the JSONB field path. The path is safe because:
      // 1. It must exist in dataset.fieldMetadata (validated against validPaths set)
      // 2. It's sanitized to [a-zA-Z0-9_.] and must match the original exactly
      // 3. It's length-limited to 100 characters
      const rows = await payload.db.drizzle.execute<{ value: string; count: number }>(
        sql.raw(
          `SELECT transformed_data ->> '${fieldPath}' AS value, COUNT(*)::integer AS count ` +
            `FROM payload.events ` +
            `WHERE dataset_id = ${String(datasetId)} AND transformed_data ->> '${fieldPath}' IS NOT NULL ` +
            `GROUP BY transformed_data ->> '${fieldPath}' ORDER BY count DESC LIMIT ${String(MAX_VALUES)}`
        )
      );

      const total = rows.rows.reduce((s, r) => s + Number(r.count), 0);
      const label = field.path
        .replaceAll("_", " ")
        .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll(/\b\w/g, (c) => c.toUpperCase());

      fields.push({
        path: field.path,
        label,
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
