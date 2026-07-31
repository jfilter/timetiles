/**
 * An empty string is not a title.
 *
 * `20260731_120000` taught the map, cluster and beeswarm SQL to resolve a display title
 * through the dataset's `interpretationPlan.roles.title`, matching `extractEventFields`. It
 * matched the precedence but not the emptiness rule: `extractFieldFromData` ends in
 * `return value || null`, so a blank cell falls through to `title` and then `name`, while
 * `COALESCE` treats `''` as a perfectly good value and stops there. A dataset whose title
 * role points at a column that is blank for some rows rendered those markers with an empty
 * label instead of the fallback the list beside them shows.
 *
 * In-place live-definition rewrite, same mechanism as 20260731_120000 / 20260731_170000.
 * Idempotent via the `NULLIF` marker — the replacement contains its own search string.
 * down() is forward-only; use `make db-reset` to rebuild.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const ROLE_PATH = "e.transformed_data #>> string_to_array(d.interpretation_plan->'roles'->>'title', '.')";

const RESOLVED_TITLE = `COALESCE(${ROLE_PATH}, e.transformed_data->>'title', e.transformed_data->>'name')`;

const MARKER = "NULLIF(e.transformed_data->>'title', '')";

const RESOLVED_TITLE_SKIPPING_EMPTY =
  `COALESCE(NULLIF(${ROLE_PATH}, ''), ${MARKER}, NULLIF(e.transformed_data->>'name', ''))`;

const FUNCTIONS = ["cluster_events", "cluster_events_temporal"];

const patchTitle = (definition: string): string =>
  definition.includes(MARKER) ? definition : definition.replaceAll(RESOLVED_TITLE, RESOLVED_TITLE_SKIPPING_EMPTY);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const name of FUNCTIONS) {
    const result = (await db.execute(
      sql.raw(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = '${name}'
        AND n.nspname IN ('public', 'payload')
    `)
    )) as { rows: Array<{ definition: string }> };

    for (const row of result.rows) {
      const updated = patchTitle(row.definition);
      if (updated === row.definition) {
        continue;
      }
      await db.execute(sql.raw(updated));
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: reversing string surgery on a live definition risks silent corruption.
  // Rebuild from scratch (make db-reset) instead.
}
