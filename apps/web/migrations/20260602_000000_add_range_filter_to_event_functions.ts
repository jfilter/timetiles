/**
 * Add numeric range filtering to the event-query PostgreSQL functions.
 *
 * The list path (TS Drizzle builder in `lib/filters/to-sql-conditions.ts`) gained
 * locale-aware numeric range filtering in earlier phases. For map clusters and
 * the temporal histogram to return matching counts, the SAME normalization must
 * live in the PG functions that back those endpoints: `cluster_events`,
 * `calculate_event_histogram`, and `cluster_events_temporal`.
 *
 * Approach: inject a range-filter block immediately after EVERY field-filter
 * block in all three functions. Rather than re-pasting the ~500-line bodies (and
 * risking divergence from the prior in-place patches — 20260401 NULL-handling,
 * 20260417_190000 gist-index rewrite, 20260528 timestamptz casts), we rewrite the
 * LIVE function bodies via `pg_get_functiondef` + a single regex replacement that
 * matches the (already-patched) field-filter clause and emits it followed by the
 * range block. This is the same established pattern used by 20260401 /
 * 20260417_190000 / 20260528, so all prior fixes are carried forward verbatim.
 *
 * The injected range block is behaviorally IDENTICAL to the TS builder's
 * `buildNormalizedNumericExpr` (`lib/filters/to-sql-conditions.ts`):
 *   - strip the column's thousands separator (no-op when null),
 *   - convert its decimal separator to '.',
 *   - guard with `~ '^-?[0-9]+(\.[0-9]+)?$'` so the `::numeric` cast NEVER throws
 *     on non-numeric/empty cells (NULL otherwise — matches `parseLocaleNumber`),
 *   - compare with `BETWEEN min AND max`, COALESCEing open ends to ±Infinity.
 * Null-safety reuses the EXACT `(<predicate>) IS NOT TRUE` idiom the field-filter
 * block was fixed to in 20260401: a non-numeric/out-of-range/missing field
 * excludes the event from the `NOT EXISTS` match, so it is dropped — never
 * silently included. With `p_filters->'rangeFilters'` absent the block short-
 * circuits to `IS NULL OR ...`, so existing call sites are unaffected.
 *
 * Down(): forward-only no-op (mirrors 20260417_190000). A reverse regex across 15
 * copies would be fragile with real silent-corruption risk; use `make db-reset`
 * to rebuild from scratch if a rollback is ever needed.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const RANGE_FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];

// Matches the CURRENT (post-20260401 null-handling fix) field-filter clause with
// flexible whitespace — cluster_events is single-line; histogram/temporal are
// multi-line after pg_get_functiondef reformatting. Captured as group 1 so the
// replacement re-emits it unchanged, then appends the range block right after.
const FIELD_FILTER_REGEX =
  "(AND\\s*\\(p_filters->'fieldFilters'\\s+IS\\s+NULL\\s+OR\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+jsonb_each\\(p_filters->'fieldFilters'\\)\\s+AS\\s+ff\\(field_key,\\s*field_values\\)\\s+WHERE\\s+\\(e\\.transformed_data\\s+#>>\\s+string_to_array\\(ff\\.field_key,\\s*'\\.'\\)\\s*=\\s*ANY\\(ARRAY\\(SELECT\\s+jsonb_array_elements_text\\(ff\\.field_values\\)\\)\\)\\)\\s+IS\\s+NOT\\s+TRUE\\s*\\)\\))";

// The range-filter block appended after each field-filter clause. `\1` re-emits
// the matched field-filter clause; the rest is the range predicate. The literal
// `\\.` reaches Postgres as `\.` (a literal-dot match) — exactly the regex the TS
// builder emits, so the SQL/PG/parser all agree on what is a clean number. The
// normalized expression is written twice (guard + cast) to stay verbatim-parallel
// to the field-filter copy-paste convention and keep each block self-contained.
const RANGE_BLOCK_REPLACEMENT =
  "\\1\n          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))";

/**
 * Rewrite every overload of `fnName` (public + payload schemas) by appending the
 * range block after each field-filter block. Idempotent: a second run finds no
 * bare field-filter clause to match once the range block is interleaved? No — the
 * field-filter regex still matches its own clause, so re-running would inject a
 * second copy. Guard against that by skipping any function that already contains
 * `rangeFilters`. Mirrors the DO-block driver in 20260401 / 20260417_190000.
 */
const rewriteSql = (fnName: string): string => `
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
        AND pg_get_functiondef(p.oid) NOT LIKE '%rangeFilters%'
    LOOP
      _src := pg_get_functiondef(_rec.oid);
      _src := regexp_replace(
        _src,
        $old$${FIELD_FILTER_REGEX}$old$,
        $new$${RANGE_BLOCK_REPLACEMENT}$new$,
        'g'
      );
      EXECUTE _src;
    END LOOP;
  END $$;
`;

// Assert every target function carries the range block after the rewrite, so a
// missed insertion (e.g. a future formatting change to the field-filter clause
// that breaks the regex) fails loudly instead of silently diverging the map /
// histogram counts from the list. Mirrors VERIFY_UP in 20260417_190000.
const VERIFY_UP = `
  DO $$
  DECLARE _bad text;
  BEGIN
    SELECT p.proname INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('cluster_events', 'calculate_event_histogram', 'cluster_events_temporal')
      AND pg_get_functiondef(p.oid) NOT LIKE '%rangeFilters%'
    LIMIT 1;
    IF _bad IS NOT NULL THEN
      RAISE EXCEPTION 'range-filter injection failed: % has no rangeFilters block', _bad;
    END IF;
  END $$;
`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const fnName of RANGE_FUNCTIONS) {
    await db.execute(sql.raw(rewriteSql(fnName)));
  }
  await db.execute(sql.raw(VERIFY_UP));
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only migration: use `make db-reset` to rebuild from scratch if a
  // rollback is ever needed. A reverse regex across 15 range-block copies would
  // be fragile string-matching with real silent-corruption risk (same rationale
  // as 20260417_190000_cluster_events_gist_index_use).
}
