/**
 * Fix two latent correctness bugs in the event-query PostgreSQL functions.
 *
 * 1. NULL field-filter handling in `cluster_events_temporal`.
 *    Migration 20260401 fixed the `WHERE NOT (... = ANY(...))` pattern (which
 *    incorrectly INCLUDES events whose filtered field is NULL/missing) in
 *    `cluster_events` and `calculate_event_histogram`, but its function list
 *    named a non-existent `calculate_temporal_clusters` instead of the real
 *    `cluster_events_temporal`. As a result the temporal-cluster (beeswarm)
 *    endpoint still over-includes NULL-field events when a field filter is
 *    active, diverging from every other query path. We apply the same
 *    `IS NOT TRUE` fix here, scoped to `cluster_events_temporal`.
 *
 * 2. Date-filter timezone handling across all three event-query functions.
 *    The functions cast `(p_filters->>'startDate')::timestamp` (timestamp
 *    WITHOUT time zone), while the canonical filter model emits UTC instants
 *    (e.g. `2026-01-01T23:59:59.999Z`) and the SQL-conditions adapter casts
 *    `::timestamptz`. Casting a `...Z` string to `::timestamp` strips the
 *    offset and re-interprets the value in the database session timezone when
 *    compared against the `timestamptz` `event_timestamp` column, so the
 *    PG-function query path can include/exclude up to a day of edge events
 *    differently from the event list/bounds whenever the session TZ is not
 *    UTC. We cast `::timestamptz` consistently to match the canonical model.
 *
 * Both fixes rewrite the live function bodies in place (via
 * `pg_get_functiondef` + targeted string replacement) so they survive the
 * various overloads/schemas (`public` + `payload`) the functions may exist in.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

// All event-query functions that cast the startDate/endDate filters.
const DATE_FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];
// Only this function still carries the buggy NULL-handling pattern; the other
// two were already fixed by 20260401.
const NULL_FIX_FUNCTION = "cluster_events_temporal";

// NULL-handling patterns (identical to 20260401_000000).
const NULL_OLD_REGEX =
  "WHERE\\s+NOT\\s*\\(\\s*e\\.transformed_data\\s+#>>\\s+string_to_array\\(ff\\.field_key,\\s*'\\.'\\)\\s*=\\s*ANY\\(ARRAY\\(SELECT\\s+jsonb_array_elements_text\\(ff\\.field_values\\)\\)\\)\\s*\\)";
const NULL_NEW_TEXT =
  "WHERE (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))) IS NOT TRUE";
const NULL_NEW_REGEX =
  "WHERE\\s*\\(\\s*e\\.transformed_data\\s+#>>\\s+string_to_array\\(ff\\.field_key,\\s*'\\.'\\)\\s*=\\s*ANY\\(ARRAY\\(SELECT\\s+jsonb_array_elements_text\\(ff\\.field_values\\)\\)\\)\\s*\\)\\s*IS\\s+NOT\\s+TRUE";
const NULL_OLD_TEXT =
  "WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))";

/**
 * Rewrite every overload of `fnName` (in public + payload schemas) by applying
 * the plpgsql `transform` expression to the function source text. `transform`
 * is a SQL expression operating on the variable `_src` and returning the new
 * source. Anchoring date casts on the trailing `)` keeps the timestamptz
 * replacement idempotent (`::timestamptz)` never contains `::timestamp)`).
 */
const rewrite = async (db: MigrateUpArgs["db"] | MigrateDownArgs["db"], fnName: string, transform: string) => {
  await db.execute(
    sql.raw(`
      DO $$
      DECLARE
        _rec record;
        _src text;
      BEGIN
        FOR _rec IN
          SELECT p.oid
          FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = '${fnName}'
            AND n.nspname IN ('payload', 'public')
        LOOP
          _src := pg_get_functiondef(_rec.oid);
          _src := ${transform};
          EXECUTE _src;
        END LOOP;
      END $$;
    `)
  );
};

// Replace ::timestamp casts with ::timestamptz for the date filters.
const TIMESTAMPTZ_UP = `replace(
  replace(_src,
    $ts$(p_filters->>'startDate')::timestamp)$ts$,
    $ts$(p_filters->>'startDate')::timestamptz)$ts$),
  $ts$(p_filters->>'endDate')::timestamp)$ts$,
  $ts$(p_filters->>'endDate')::timestamptz)$ts$)`;

const TIMESTAMPTZ_DOWN = `replace(
  replace(_src,
    $ts$(p_filters->>'startDate')::timestamptz)$ts$,
    $ts$(p_filters->>'startDate')::timestamp)$ts$),
  $ts$(p_filters->>'endDate')::timestamptz)$ts$,
  $ts$(p_filters->>'endDate')::timestamp)$ts$)`;

const NULL_UP = `regexp_replace(_src, $old$${NULL_OLD_REGEX}$old$, $new$${NULL_NEW_TEXT}$new$, 'g')`;
const NULL_DOWN = `regexp_replace(_src, $new$${NULL_NEW_REGEX}$new$, $old$${NULL_OLD_TEXT}$old$, 'g')`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Bug 8: timestamptz casts for every date-filtering function.
  for (const fnName of DATE_FUNCTIONS) {
    await rewrite(db, fnName, TIMESTAMPTZ_UP);
  }
  // Bug 1: NULL-handling fix for the temporal-cluster function only.
  await rewrite(db, NULL_FIX_FUNCTION, NULL_UP);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Revert NULL-handling only on the function this migration changed, so we do
  // not undo 20260401's fix on cluster_events / calculate_event_histogram.
  await rewrite(db, NULL_FIX_FUNCTION, NULL_DOWN);
  for (const fnName of DATE_FUNCTIONS) {
    await rewrite(db, fnName, TIMESTAMPTZ_DOWN);
  }
}
