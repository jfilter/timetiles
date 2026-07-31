/**
 * `calculate_event_histogram` could return one bucket more than `maxBuckets`.
 *
 * The bucket count was derived as `CEIL(range / size)` while the rows actually come from
 * `generate_series(min, max, size)`, which is inclusive of its endpoint and therefore yields
 * `FLOOR(range / size) + 1` rows. The two agree whenever the range is not an exact multiple
 * of the bucket size and differ by one when it is — and a round range over round timestamps
 * is the common case, not the exotic one. `GET /api/v1/events/temporal` then answered with 51
 * buckets for `maxBuckets=50`.
 *
 * The trailing series point is not spurious and must stay: buckets are half-open
 * (`>= start AND < end`), so on an exactly divisible range it is the only bucket that
 * contains the event sitting on `v_max_date`. The fix is in the sizing, not the series —
 * count the inclusive endpoint, and pick the smallest integer size that keeps the total
 * within `p_max_buckets`.
 *
 * Fixing the `p_max_buckets` branch alone is not enough: the `p_min_buckets` branch runs
 * afterwards, unconditionally, and re-derives the size from `min`. The route clamps
 * `min = LEAST(min, max)`, so `min = max = 50` over a 100-second range re-introduced exactly
 * the 51 buckets the max branch had just avoided. A final floor makes `max` the hard ceiling
 * the caller (and the route's own comment) already assumes it is.
 *
 * In-place live-definition rewrite, same mechanism as 20260731_120000. Idempotent — each
 * replacement is a no-op once applied. down() is forward-only; use `make db-reset` to rebuild.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

/** int4 ceiling, as clamped by 20260731_120000. */
const INT_MAX = "2147483647";

const REPLACEMENTS: Array<{ from: string; to: string }> = [
  {
    from: "v_resulting_buckets := CEIL(v_range_seconds / v_bucket_size_seconds)::integer;",
    to: "v_resulting_buckets := FLOOR(v_range_seconds / v_bucket_size_seconds)::integer + 1;",
  },
  {
    // Smallest integer size s with FLOOR(range / s) + 1 <= max, i.e. s > range / max.
    from: `v_bucket_size_seconds := LEAST(${INT_MAX}, CEIL(v_range_seconds / p_max_buckets))::integer;`,
    to: `v_bucket_size_seconds := GREATEST(1, LEAST(${INT_MAX}, FLOOR(v_range_seconds / p_max_buckets) + 1))::integer;`,
  },
];

/** Smallest integer bucket size that keeps FLOOR(range / size) + 1 within p_max_buckets. */
const MAX_FITTING_SIZE = `GREATEST(1, LEAST(${INT_MAX}, FLOOR(v_range_seconds / p_max_buckets) + 1))::integer`;

const MIN_BUCKETS_BRANCH =
  "    IF v_resulting_buckets < p_min_buckets THEN\n" +
  `      v_bucket_size_seconds := GREATEST(1, LEAST(${INT_MAX}, FLOOR(v_range_seconds / p_min_buckets))::integer);\n` +
  "    END IF;";

const MAX_CEILING_MARKER = "-- p_max_buckets is a hard ceiling";

const MIN_BUCKETS_BRANCH_WITH_CEILING =
  `${MIN_BUCKETS_BRANCH}\n\n` +
  `    ${MAX_CEILING_MARKER}: the min branch above runs unconditionally and would otherwise\n` +
  "    -- undo the cap whenever the caller passes min = max.\n" +
  `    v_bucket_size_seconds := GREATEST(v_bucket_size_seconds, ${MAX_FITTING_SIZE});`;

const patchBucketCount = (definition: string): string => {
  const counted = REPLACEMENTS.reduce((acc, { from, to }) => acc.replaceAll(from, to), definition);
  // The replacement contains the search string, so guard on the marker instead.
  return counted.includes(MAX_CEILING_MARKER)
    ? counted
    : counted.replaceAll(MIN_BUCKETS_BRANCH, MIN_BUCKETS_BRANCH_WITH_CEILING);
};

// `cluster_events_temporal` sizes buckets from `p_target_buckets` alone — a target it may
// exceed by one, with no maximum to violate — so it is deliberately not touched here.
const FUNCTIONS = ["calculate_event_histogram"];

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
      const updated = patchBucketCount(row.definition);
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
