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
import { extractRelationId } from "@/lib/utils/relation-id";

const MAX_VALUES = 30;

export const GET = apiRoute({
  auth: "optional",
  params: z.object({ id: z.string().min(1) }),
  handler: async ({ payload, params, user }) => {
    const datasetId = Number(params.id);
    const dataset = await payload.findByID({ collection: "datasets", id: datasetId, depth: 0, overrideAccess: true });
    if (!dataset) throw new NotFoundError("Dataset not found");

    // Access control
    if (!dataset.isPublic) {
      const ownerId = extractRelationId(dataset.createdBy);
      if (!user || (user.role !== "admin" && user.id !== ownerId)) throw new NotFoundError("Dataset not found");
    }

    const fm = dataset.fieldMetadata as Record<string, FieldStatistics> | null;
    if (!fm) return { fields: [] };

    // Find enum candidate fields — trust isEnumCandidate from schema detection
    const candidates = Object.values(fm).filter((f) => f.isEnumCandidate);
    if (candidates.length === 0) return { fields: [] };

    // Sort by cardinality — fields closer to 5-15 unique values are most useful for filtering
    candidates.sort((a, b) => Math.abs((a.enumValues?.length ?? 0) - 10) - Math.abs((b.enumValues?.length ?? 0) - 10));

    // Live SQL counts for all qualifying fields
    const fields = [];
    for (const field of candidates) {
      const fieldPath = field.path.replaceAll(/[^a-zA-Z0-9_.]/g, "");
      const rows = await payload.db.drizzle.execute<{ value: string; count: number }>(
        sql.raw(`
          SELECT transformed_data ->> '${fieldPath}' AS value, COUNT(*)::integer AS count
          FROM payload.events WHERE dataset_id = ${datasetId} AND transformed_data ->> '${fieldPath}' IS NOT NULL
          GROUP BY transformed_data ->> '${fieldPath}' ORDER BY count DESC LIMIT ${MAX_VALUES}
        `)
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
