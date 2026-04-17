/**
 * Make cluster_events / cluster_events_temporal actually use the gist index.
 *
 * The h3_map_clustering migration created a GIST index on events.geom, but
 * the H3 and Grid-K branches of cluster_events (and all branches of
 * cluster_events_temporal's bounds filter) filtered on raw location_longitude
 * / location_latitude columns via BETWEEN. PostgreSQL can't use a gist index
 * on `geom` to satisfy BETWEEN predicates on separate numeric columns, so
 * every clustering query was a full sequential scan.
 *
 * This migration rewrites those bbox filters to use
 * `ST_Intersects(e.geom, CASE WHEN ... THEN ST_MakeEnvelope(...) ELSE ST_Union(...) END)`,
 * which mirrors the existing DBSCAN branch and lets the planner use the
 * `events_geom_gist_idx` gist index. Also replaces the paired
 * `location_longitude IS NOT NULL AND location_latitude IS NOT NULL` guard
 * with `e.geom IS NOT NULL` (equivalent via the geom trigger + backfill).
 *
 * Uses the same pg_get_functiondef + regex rewrite pattern as
 * 20260401_000000_fix_field_filter_null_handling.ts, so we don't re-paste
 * the full ~500-line cluster_events body. A final assertion checks that no
 * BETWEEN-on-raw-coords pattern remains, so a regex miss fails loudly.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

// ---------------------------------------------------------------------------
// cluster_events uses direct parameters (p_min_lng, p_max_lng, ...).
// The bbox filter appears ~7x across H3 and Grid-K branches; DBSCAN already
// uses ST_Intersects and needs no rewrite.
// ---------------------------------------------------------------------------

// Matches the antimeridian-safe BETWEEN pair used in H3 / Grid-K:
//   AND ( CASE WHEN p_min_lng <= p_max_lng
//           THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng
//           ELSE ( e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng )
//         END )
//   AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
const DIRECT_BBOX_OLD =
  String.raw`AND\s*\(\s*CASE\s+WHEN\s+p_min_lng\s*<=\s*p_max_lng\s+THEN\s+e\.location_longitude\s+BETWEEN\s+p_min_lng\s+AND\s+p_max_lng\s+ELSE\s*\(\s*e\.location_longitude\s*>=\s*p_min_lng\s+OR\s+e\.location_longitude\s*<=\s*p_max_lng\s*\)\s+END\s*\)\s+AND\s+e\.location_latitude\s+BETWEEN\s+p_min_lat\s+AND\s+p_max_lat`;
const DIRECT_BBOX_NEW =
  "AND ST_Intersects(e.geom, CASE WHEN p_min_lng <= p_max_lng THEN ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326) ELSE ST_Union(ST_MakeEnvelope(p_min_lng, p_min_lat, 180.0, p_max_lat, 4326), ST_MakeEnvelope(-180.0, p_min_lat, p_max_lng, p_max_lat, 4326)) END)";

// cluster_events_temporal uses JSONB bounds (p_filters->'bounds'->>'minLng').
// Matches the inner block of AND (p_filters->'bounds' IS NULL OR (...)).
const JSONB_BOUNDS_OLD = String.raw`CASE\s+WHEN\s*\(p_filters->'bounds'->>'minLng'\)::double\s+precision\s*<=\s*\(p_filters->'bounds'->>'maxLng'\)::double\s+precision\s+THEN\s+e\.location_longitude\s+BETWEEN\s*\(p_filters->'bounds'->>'minLng'\)::double\s+precision\s+AND\s*\(p_filters->'bounds'->>'maxLng'\)::double\s+precision\s+ELSE\s*\(\s*e\.location_longitude\s*>=\s*\(p_filters->'bounds'->>'minLng'\)::double\s+precision\s+OR\s+e\.location_longitude\s*<=\s*\(p_filters->'bounds'->>'maxLng'\)::double\s+precision\s*\)\s+END\s+AND\s+e\.location_latitude\s+BETWEEN\s*\(p_filters->'bounds'->>'minLat'\)::double\s+precision\s+AND\s*\(p_filters->'bounds'->>'maxLat'\)::double\s+precision`;
const JSONB_BOUNDS_NEW =
  "e.geom IS NOT NULL AND ST_Intersects(e.geom, CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision THEN ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326) ELSE ST_Union(ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, 180.0, (p_filters->'bounds'->>'maxLat')::double precision, 4326), ST_MakeEnvelope(-180.0, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326)) END)";

// IS NOT NULL pair → geom IS NOT NULL (cluster_events only).
const COORDS_NOT_NULL_OLD = String.raw`e\.location_longitude\s+IS\s+NOT\s+NULL\s+AND\s+e\.location_latitude\s+IS\s+NOT\s+NULL`;
const COORDS_NOT_NULL_NEW = "e.geom IS NOT NULL";

const rewriteFunction = (
  fnName: string,
  replacements: { oldRegex: string; newText: string }[],
): string => {
  const replacementBlocks = replacements
    .map(
      ({ oldRegex, newText }) => `
          _src := regexp_replace(
            _src,
            $old$${oldRegex}$old$,
            $new$${newText}$new$,
            'g'
          );`,
    )
    .join("\n");

  return `
    DO $$
    DECLARE
      _rec record;
      _src text;
    BEGIN
      FOR _rec IN
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = '${fnName}' AND n.nspname = 'public'
      LOOP
        _src := pg_get_functiondef(_rec.oid);
        ${replacementBlocks}
        EXECUTE _src;
      END LOOP;
    END $$;
  `;
};

// Assert no BETWEEN-on-raw-coords patterns remain after the rewrite.
const VERIFY_UP = `
  DO $$
  DECLARE _bad text;
  BEGIN
    SELECT p.proname INTO _bad
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('cluster_events', 'cluster_events_temporal')
      AND (
        pg_get_functiondef(p.oid) LIKE '%e.location_longitude BETWEEN p_min_lng%'
        OR pg_get_functiondef(p.oid) LIKE '%e.location_longitude BETWEEN (p_filters->''bounds''%'
      )
    LIMIT 1;
    IF _bad IS NOT NULL THEN
      RAISE EXCEPTION 'cluster_events gist rewrite failed: % still contains BETWEEN on raw coords', _bad;
    END IF;
  END $$;
`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(
      rewriteFunction("cluster_events", [
        { oldRegex: DIRECT_BBOX_OLD, newText: DIRECT_BBOX_NEW },
        { oldRegex: COORDS_NOT_NULL_OLD, newText: COORDS_NOT_NULL_NEW },
      ]),
    ),
  );

  await db.execute(
    sql.raw(
      rewriteFunction("cluster_events_temporal", [
        { oldRegex: JSONB_BOUNDS_OLD, newText: JSONB_BOUNDS_NEW },
      ]),
    ),
  );

  await db.execute(sql.raw(VERIFY_UP));
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only migration: use `make db-reset` to rebuild from scratch if
  // rollback is ever needed. A reverse regex here would add ~40 lines of
  // fragile string-matching with real silent-corruption risk.
}
