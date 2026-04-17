/**
 * Repair SQL access-control function defaults for `includePublic`.
 *
 * The original event-access migration introduced `includePublic` into the
 * PostgreSQL query functions, but earlier copies of that migration used
 * `COALESCE(..., false)`. Databases that already applied that version keep the
 * stale function bodies, which incorrectly exclude public events unless the
 * caller explicitly sets `includePublic`.
 *
 * This follow-up migration rewrites existing function definitions in-place so
 * previously migrated environments converge on the intended default of `true`.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal", "calculate_temporal_clusters"];
const OLD_TEXT = "COALESCE((p_filters->>'includePublic')::boolean, false)";
const NEW_TEXT = "COALESCE((p_filters->>'includePublic')::boolean, true)";

const rewriteFunctions = async (
  db: MigrateUpArgs["db"] | MigrateDownArgs["db"],
  fromText: string,
  toText: string
) => {
  const result = (await db.execute(sql.raw(`
    SELECT
      p.oid,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = ANY(ARRAY['${FUNCTIONS.join("','")}'])
      AND n.nspname IN ('public', 'payload')
  `))) as {
    rows: Array<{ definition: string; oid: number }>;
  };

  for (const row of result.rows) {
    if (!row.definition.includes(fromText)) {
      continue;
    }

    await db.execute(sql.raw(row.definition.replaceAll(fromText, toText)));
  }
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await rewriteFunctions(db, OLD_TEXT, NEW_TEXT);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await rewriteFunctions(db, NEW_TEXT, OLD_TEXT);
}
