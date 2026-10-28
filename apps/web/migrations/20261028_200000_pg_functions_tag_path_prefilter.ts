/**
 * Let the PL/pgSQL event functions use the `transformed_data` GIN index for tag filters.
 *
 * Their field-filter clause runs per row in a correlated `NOT EXISTS (… jsonb_each …)`, which no
 * index can serve. Every event scan now first checks `transformed_data @@ tagPath`, a jsonpath that
 * `buildTagJsonPath` derives from the same filters and that matches a superset of the exact clause,
 * which stays in place. `force_custom_plan` keeps the plan bound to the actual filter values: a
 * generic plan cannot use the index and was slower even without filters.
 *
 * In-place live-definition rewrite, same mechanism as 20260813_180000: every event scan carries the
 * field-filter clause. Idempotent via `tagPath`. down() is forward-only; use `make db-reset`.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "cluster_events_temporal", "calculate_event_histogram"];

const FIELD_FILTER_CLAUSE = "AND (p_filters->'fieldFilters' IS NULL OR";

const EVENT_SCAN = "JOIN payload.datasets d ON e.dataset_id = d.id";

const TAG_PATH_CLAUSE =
  "AND (p_filters->>'tagPath' IS NULL OR e.transformed_data @@ (p_filters->>'tagPath')::jsonpath) ";

const patchDefinition = (name: string, definition: string): string => {
  if (definition.includes("tagPath")) return definition;
  const scans = definition.split(EVENT_SCAN).length - 1;
  const anchors = definition.split(FIELD_FILTER_CLAUSE).length - 1;
  if (scans === 0 || anchors !== scans) {
    throw new Error(`${name}: expected one field-filter clause per event scan, found ${anchors} for ${scans}`);
  }
  return definition.replaceAll(FIELD_FILTER_CLAUSE, `${TAG_PATH_CLAUSE}${FIELD_FILTER_CLAUSE}`);
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const name of FUNCTIONS) {
    const result = (await db.execute(
      sql.raw(`
      SELECT pg_get_functiondef(p.oid) AS definition, p.oid::regprocedure::text AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = '${name}'
        AND n.nspname IN ('public', 'payload')
    `)
    )) as { rows: Array<{ definition: string; signature: string }> };

    for (const row of result.rows) {
      const updated = patchDefinition(name, row.definition);
      if (updated !== row.definition) {
        await db.execute(sql.raw(updated));
      }
      await db.execute(sql.raw(`ALTER FUNCTION ${row.signature} SET plan_cache_mode = force_custom_plan`));
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: reversing string surgery on a live definition risks silent corruption.
  // Rebuild from scratch (make db-reset) instead.
}
