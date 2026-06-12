/**
 * Honor `tagFields` in the field-filter blocks of the event SQL functions.
 *
 * Tag/array fields (multi-value columns, `FieldStatistics.isTagField`) are
 * surfaced as filterable values by enum-stats, but the field-filter predicate
 * in `cluster_events`, `calculate_event_histogram`, and
 * `cluster_events_temporal` only did a scalar text compare:
 * `transformed_data #>> path = ANY(values)`. For an array value `#>>` returns
 * the array's JSON text (`["music","art"]`), which never equals a selected
 * element — so any active tag filter emptied the map and all charts. The TS
 * SQL builder (events list) already has a containment branch keyed on
 * `filters.tagFields`; this migration adds the matching branch to the PG
 * functions: when `p_filters->'tagFields'` lists the field key, match via
 * jsonb containment (`#> path @> [value]` for ANY selected value) instead.
 *
 * `p_filters->'tagFields' ? ff.field_key` is NULL when tagFields is absent,
 * so the CASE falls through to the scalar branch for every existing caller.
 *
 * Same in-place live-definition rewrite as 20260612_130000; idempotent via
 * the `tagFields` containment check. down() restores the scalar-only form.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];

const SCALAR_PREDICATE =
  "(e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))) IS NOT TRUE";

const TAG_AWARE_PREDICATE =
  "(CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE";

const rewriteFunctions = async (
  db: MigrateUpArgs["db"] | MigrateDownArgs["db"],
  from: string,
  to: string
) => {
  const result = (await db.execute(
    sql.raw(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = ANY(ARRAY['${FUNCTIONS.join("','")}'])
      AND n.nspname IN ('public', 'payload')
  `)
  )) as { rows: Array<{ definition: string }> };

  for (const row of result.rows) {
    const updatedDefinition = row.definition.split(from).join(to);
    if (updatedDefinition === row.definition) {
      continue;
    }

    await db.execute(sql.raw(updatedDefinition));
  }
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await rewriteFunctions(db, SCALAR_PREDICATE, TAG_AWARE_PREDICATE);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await rewriteFunctions(db, TAG_AWARE_PREDICATE, SCALAR_PREDICATE);
}
