/**
 * Fix NULL-handling bug in field filter conditions across PostgreSQL functions.
 *
 * The `NOT EXISTS ... WHERE NOT (value = ANY(...))` pattern incorrectly
 * includes events where the filtered field is NULL/missing. When a JSONB
 * field value is NULL, `NULL = ANY(...)` returns NULL, `NOT NULL` is also
 * NULL, so the WHERE clause excludes that row from the subquery — making
 * `NOT EXISTS` return TRUE and including the event.
 *
 * Fix: change `WHERE NOT (expr)` to `WHERE expr IS NOT TRUE` so that
 * NULL is treated the same as FALSE (field doesn't match → exclude event).
 *
 * Affected functions: cluster_events, calculate_event_histogram,
 * calculate_temporal_clusters.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FUNCTIONS = ["cluster_events", "calculate_event_histogram", "calculate_temporal_clusters"];

const OLD_PATTERN =
  "WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.'') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))";
const NEW_PATTERN =
  "WHERE (e.transformed_data #>> string_to_array(ff.field_key, '.'') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))) IS NOT TRUE";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const fnName of FUNCTIONS) {
    await db.execute(sql.raw(`
      DO $$
      DECLARE
        _oid oid;
        _src text;
      BEGIN
        SELECT p.oid INTO _oid
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'payload' AND p.proname = '${fnName}';

        IF _oid IS NULL THEN
          RAISE NOTICE 'Function payload.${fnName} not found, skipping';
          RETURN;
        END IF;

        _src := pg_get_functiondef(_oid);
        _src := replace(_src,
          '${OLD_PATTERN}',
          '${NEW_PATTERN}'
        );
        EXECUTE _src;
      END $$;
    `));
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const fnName of FUNCTIONS) {
    await db.execute(sql.raw(`
      DO $$
      DECLARE
        _oid oid;
        _src text;
      BEGIN
        SELECT p.oid INTO _oid
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'payload' AND p.proname = '${fnName}';

        IF _oid IS NULL THEN
          RAISE NOTICE 'Function payload.${fnName} not found, skipping';
          RETURN;
        END IF;

        _src := pg_get_functiondef(_oid);
        _src := replace(_src,
          '${NEW_PATTERN}',
          '${OLD_PATTERN}'
        );
        EXECUTE _src;
      END $$;
    `));
  }
}
