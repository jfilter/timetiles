/**
 * Three arithmetic defects in the clustering and histogram functions.
 *
 * 1. `cluster_events` measured the viewport width with `ABS(p_max_lng - p_min_lng)`, but the
 *    bounds contract allows `west > east` to encode a viewport crossing the antimeridian —
 *    every WHERE clause in the same function handles that with an explicit CASE. A Fiji-sized
 *    view (west 170, east -170, really 20° wide) measured as 340°, so the derived cell size
 *    and DBSCAN eps came out ~4x too coarse and the whole viewport collapsed into one
 *    cluster. Affects the grid-k and dbscan algorithms.
 *
 * 2. The H3 merge pass compared a distance in ground metres (`2 * hex_edge_m`) against
 *    geometry transformed to EPSG:3857, where one unit is cos(lat) ground metres. Neighbouring
 *    hexes sit about 1.73*edge apart on the ground, i.e. 1.73*edge/cos(lat) in Mercator, which
 *    exceeds the 2*edge threshold from roughly 30° latitude onwards. Overlapping clusters
 *    merged at the equator and silently stopped merging over Europe — the primary use case.
 *    The `ground_res` variable was already computed with exactly this cosine and never used.
 *
 * 3. `calculate_event_histogram` and `cluster_events_temporal` cast the bucket size to
 *    `integer`, which overflows past 68 years. `GET /api/v1/events/temporal?targetBuckets=1`
 *    over a dataset spanning more than that — historical sources, or one row with a
 *    misparsed year — answered 500 (SQLSTATE 22003) instead of a histogram.
 *
 * In-place live-definition rewrite, same mechanism as 20260612_130000 / 20260612_140000:
 * read `pg_get_functiondef`, patch, re-execute. Idempotent — each replacement is a no-op once
 * applied. down() is forward-only (mirrors 20260602_000000); use `make db-reset` to rebuild.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const ABS_WIDTH = "vw := GREATEST(ABS(p_max_lng - p_min_lng), 0.0001);";

// Mirrors the CASE every bounds filter in these functions already uses.
const ANTIMERIDIAN_WIDTH =
  "vw := GREATEST(CASE WHEN p_max_lng >= p_min_lng THEN p_max_lng - p_min_lng " +
  "ELSE (p_max_lng + 360.0) - p_min_lng END, 0.0001);";

const MERCATOR_EPS = "eps := merge_eps_m";

// Ground metres -> Mercator units at the viewport's centre latitude. Clamped so a
// near-polar viewport cannot divide by ~0.
const MERCATOR_EPS_SCALED =
  "eps := merge_eps_m / GREATEST(COS(RADIANS((p_min_lat + p_max_lat) / 2.0)), 0.01)";

/** int4 ceiling — a bucket this size is already one bucket for any real range. */
const INT_MAX = "2147483647";

const BUCKET_CASTS: Array<{ from: string; to: string }> = [
  {
    from: "v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_target_buckets)::integer);",
    to: `v_bucket_size_seconds := GREATEST(1, LEAST(${INT_MAX}, FLOOR(v_range_seconds / p_target_buckets))::integer);`,
  },
  {
    from: "v_bucket_size_seconds := CEIL(v_range_seconds / p_max_buckets)::integer;",
    to: `v_bucket_size_seconds := LEAST(${INT_MAX}, CEIL(v_range_seconds / p_max_buckets))::integer;`,
  },
  {
    from: "v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_min_buckets)::integer);",
    to: `v_bucket_size_seconds := GREATEST(1, LEAST(${INT_MAX}, FLOOR(v_range_seconds / p_min_buckets))::integer);`,
  },
];

const PLAIN_TITLE = "e.transformed_data->>'title'";

// Same precedence as extractEventFields: the dataset's title role, then `title`, then `name`.
// The role holds a dot path, hence string_to_array + #>>. Every scan that selects a title in
// these functions already joins `payload.datasets d`.
const RESOLVED_TITLE =
  "COALESCE(e.transformed_data #>> string_to_array(d.interpretation_plan->'roles'->>'title', '.'), " +
  "e.transformed_data->>'title', e.transformed_data->>'name')";

const TITLE_MARKER = "string_to_array(d.interpretation_plan->'roles'->>'title'";

/**
 * Resolve the display title through the dataset's interpretation plan.
 *
 * The map, cluster previews and beeswarm read `->>'title'` directly while the events API
 * resolves `interpretationPlan.roles.title` first. Five of the ten shipped data packages point
 * that role elsewhere (`event_type`, `description`, `name`, `source_headline`), so their events
 * carried a real title in the list and rendered as "Event 12345" on the map.
 */
const patchTitleResolution = (definition: string): string =>
  definition.includes(TITLE_MARKER) ? definition : definition.replaceAll(PLAIN_TITLE, RESOLVED_TITLE);

const patchClusterEvents = (definition: string): string => {
  const widened = definition.replaceAll(ABS_WIDTH, ANTIMERIDIAN_WIDTH);
  // `MERCATOR_EPS` is a prefix of `MERCATOR_EPS_SCALED`, so a blind replace would append the
  // divisor a second time on re-run. Skip when the scaled form is already there.
  return widened.includes(MERCATOR_EPS_SCALED) ? widened : widened.replaceAll(MERCATOR_EPS, MERCATOR_EPS_SCALED);
};

const patchBucketSizing = (definition: string): string =>
  BUCKET_CASTS.reduce((acc, { from, to }) => acc.replaceAll(from, to), definition);

const patchers: Record<string, (definition: string) => string> = {
  cluster_events: (definition) => patchTitleResolution(patchBucketSizing(patchClusterEvents(definition))),
  cluster_events_temporal: (definition) => patchTitleResolution(patchBucketSizing(definition)),
  calculate_event_histogram: patchBucketSizing,
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [name, patch] of Object.entries(patchers)) {
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
      const updated = patch(row.definition);
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
