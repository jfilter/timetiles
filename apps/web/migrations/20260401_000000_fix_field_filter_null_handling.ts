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

// Regex pattern matches with flexible whitespace (pg_get_functiondef may reformat)
const OLD_REGEX =
  "WHERE\\s+NOT\\s*\\(\\s*e\\.transformed_data\\s+#>>\\s+string_to_array\\(ff\\.field_key,\\s*'\\.'\\)\\s*=\\s*ANY\\(ARRAY\\(SELECT\\s+jsonb_array_elements_text\\(ff\\.field_values\\)\\)\\)\\s*\\)";
const NEW_TEXT =
  "WHERE (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))) IS NOT TRUE";
// Reverse: match the fixed pattern to restore original
const NEW_REGEX =
  "WHERE\\s*\\(\\s*e\\.transformed_data\\s+#>>\\s+string_to_array\\(ff\\.field_key,\\s*'\\.'\\)\\s*=\\s*ANY\\(ARRAY\\(SELECT\\s+jsonb_array_elements_text\\(ff\\.field_values\\)\\)\\)\\s*\\)\\s*IS\\s+NOT\\s+TRUE";
const OLD_TEXT =
  "WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const fnName of FUNCTIONS) {
    // Process ALL overloads in any schema (public + payload may both exist)
    await db.execute(sql.raw(`
      DO $$
      DECLARE
        _rec record;
        _src text;
      BEGIN
        FOR _rec IN
          SELECT p.oid, n.nspname
          FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = '${fnName}'
            AND n.nspname IN ('payload', 'public')
        LOOP
          _src := pg_get_functiondef(_rec.oid);
          _src := regexp_replace(_src,
            $old$${OLD_REGEX}$old$,
            $new$${NEW_TEXT}$new$,
            'g'
          );
          EXECUTE _src;
        END LOOP;
      END $$;
    `));

    // Drop obsolete duplicates: payload-schema copies and superseded
    // public-schema overloads (e.g. old 6-param cluster_events replaced by 13-param)
    await db.execute(sql.raw(`
      DO $$
      DECLARE
        _rec record;
        _max_args int;
      BEGIN
        -- Drop payload-schema copies when a public version exists
        IF EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = '${fnName}' AND n.nspname = 'public'
        ) THEN
          FOR _rec IN
            SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE p.proname = '${fnName}' AND n.nspname = 'payload'
          LOOP
            EXECUTE format('DROP FUNCTION payload.%I(%s)', '${fnName}', _rec.args);
          END LOOP;
        END IF;

        -- Drop superseded public-schema overloads (keep only the one with most params)
        SELECT max(pronargs) INTO _max_args
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = '${fnName}' AND n.nspname = 'public';

        FOR _rec IN
          SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = '${fnName}' AND n.nspname = 'public'
            AND p.pronargs < _max_args
        LOOP
          EXECUTE format('DROP FUNCTION public.%I(%s)', '${fnName}', _rec.args);
        END LOOP;
      END $$;
    `));
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const fnName of FUNCTIONS) {
    await db.execute(sql.raw(`
      DO $$
      DECLARE
        _rec record;
        _src text;
      BEGIN
        FOR _rec IN
          SELECT p.oid, n.nspname
          FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = '${fnName}'
            AND n.nspname IN ('payload', 'public')
        LOOP
          _src := pg_get_functiondef(_rec.oid);
          _src := regexp_replace(_src,
            $new$${NEW_REGEX}$new$,
            $old$${OLD_TEXT}$old$,
            'g'
          );
          EXECUTE _src;
        END LOOP;
      END $$;
    `));
  }
}
