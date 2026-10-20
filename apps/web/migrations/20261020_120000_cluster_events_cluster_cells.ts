/**
 * Apply the `clusterCells` focus filter in `cluster_events`.
 *
 * `toClusteringJsonb` serializes `clusterCells` + `h3Resolution` for `/api/v1/events/geo`, and
 * `calculate_event_histogram` and `cluster_events_temporal` honour them, but `cluster_events` had
 * no clause: a cell-focused request got clusters for the whole viewport.
 *
 * In-place live-definition rewrite, same mechanism and anchor as 20260813_180000: every event scan
 * has the shape `JOIN payload.datasets d ON e.dataset_id = d.id … WHERE`, so the clause goes right
 * behind that WHERE. Idempotent via `clusterCells`. down() is forward-only; use `make db-reset`.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

// Same h3-column CASE block the histogram carries (20260612_140000).
const CLUSTER_CELLS_CLAUSE =
  "(p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))";

const EVENT_SCAN = /(JOIN payload\.datasets d ON e\.dataset_id = d\.id\s+WHERE\s+)/g;

const patchDefinition = (definition: string): string =>
  definition.includes("clusterCells")
    ? definition
    : definition.replaceAll(EVENT_SCAN, `$1${CLUSTER_CELLS_CLAUSE} AND `);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const result = (await db.execute(
    sql.raw(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'cluster_events'
      AND n.nspname IN ('public', 'payload')
  `)
  )) as { rows: Array<{ definition: string }> };

  for (const row of result.rows) {
    const updated = patchDefinition(row.definition);
    if (updated === row.definition) {
      continue;
    }
    await db.execute(sql.raw(updated));
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: reversing string surgery on a live definition risks silent corruption.
  // Rebuild from scratch (make db-reset) instead.
}
