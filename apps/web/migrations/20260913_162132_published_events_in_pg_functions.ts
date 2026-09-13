/**
 * Hide unpublished events from the public grant of the PL/pgSQL read paths.
 *
 * The events read access and `toSqlConditions` only grant public rows once `_status` is
 * `published`; catalog owners keep their own drafts through the owner grant. The three
 * PL/pgSQL functions granted every public row, so draft events reached map clusters, the
 * temporal histogram and the beeswarm, and their counts disagreed with the event list.
 *
 * In-place live-definition rewrite, same mechanism as 20260813_180000: every event scan
 * closes its public grant with `IS TRUE AND e.dataset_is_public = true)`. Idempotent via
 * the marker. down() is forward-only; use `make db-reset` to rebuild.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "cluster_events_temporal", "calculate_event_histogram"];

const MARKER = "e._status = 'published'";

const PUBLIC_GRANT = "IS TRUE AND e.dataset_is_public = true)";

const patchDefinition = (definition: string): string =>
  definition.includes(MARKER)
    ? definition
    : definition.replaceAll(PUBLIC_GRANT, `IS TRUE AND e.dataset_is_public = true AND ${MARKER})`);

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
      const updated = patchDefinition(row.definition);
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
