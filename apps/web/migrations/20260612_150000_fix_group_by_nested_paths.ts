/**
 * Resolve `p_group_by` as a dot-path in `cluster_events_temporal`.
 *
 * Enum field paths can be nested dot-paths (`meta.category`) — the enum-stats
 * route, the field-filter blocks, and the TS SQL builder all resolve them via
 * `#>> string_to_array(key, '.')`. The temporal grouping however used
 * `e.transformed_data ->> p_group_by`, which looks up the literal key
 * `"meta.category"`, returns NULL, and collapses every event into a single
 * `(empty)` group for any nested groupBy selection.
 *
 * For single-segment paths `#>> string_to_array('key', '.')` is identical to
 * `->> 'key'`, so flat fields are unaffected.
 *
 * Same in-place live-definition rewrite as 20260612_130000; inherently
 * idempotent (plain text substitution). down() restores the literal-key form.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const LITERAL_KEY = "e.transformed_data ->> p_group_by";
const DOT_PATH = "e.transformed_data #>> string_to_array(p_group_by, '.')";

const rewriteFunction = async (
  db: MigrateUpArgs["db"] | MigrateDownArgs["db"],
  from: string,
  to: string
) => {
  const result = (await db.execute(
    sql.raw(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'cluster_events_temporal'
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
  await rewriteFunction(db, LITERAL_KEY, DOT_PATH);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await rewriteFunction(db, DOT_PATH, LITERAL_KEY);
}
