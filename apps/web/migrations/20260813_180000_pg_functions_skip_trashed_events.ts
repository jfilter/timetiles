/**
 * Hide trashed events from the PL/pgSQL read paths.
 *
 * Events are a trash-enabled collection: Payload's `find` hides soft-deleted rows and
 * `toSqlConditions` adds `e.deleted_at IS NULL` to every raw-SQL path in TypeScript. The three
 * PL/pgSQL functions never got that clause, so a deleted event still appeared in map clusters,
 * the temporal histogram and the beeswarm — and their counts disagreed with the list beside them.
 *
 * In-place live-definition rewrite, same mechanism as 20260731_120000 / 20260731_200000: every
 * event scan in these functions has the shape `FROM payload.events e JOIN payload.datasets d …
 * WHERE`, so the clause goes in right behind that WHERE. Idempotent via the marker.
 * down() is forward-only; use `make db-reset` to rebuild.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "cluster_events_temporal", "calculate_event_histogram"];

const MARKER = "e.deleted_at IS NULL";

/** `JOIN payload.datasets d ON e.dataset_id = d.id` followed by the scan's own WHERE. */
const EVENT_SCAN = /(JOIN payload\.datasets d ON e\.dataset_id = d\.id\s+WHERE\s+)/g;

const patchDefinition = (definition: string): string =>
  definition.includes(MARKER) ? definition : definition.replaceAll(EVENT_SCAN, `$1${MARKER} AND `);

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
