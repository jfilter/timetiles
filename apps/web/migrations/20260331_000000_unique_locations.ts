/**
 * Add H3 r14/r15 columns and update cluster_events() to return
 * location_count and location_name for the unique-locations model.
 *
 * Location = H3 r15 cell (~0.5 m edge, ~0.9 m²). The map shows locations
 * (with event counts) instead of individual event dots.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Add H3 r14 and r15 generated columns + indexes
  // ------------------------------------------------------------------
  await db.execute(sql`
    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r14 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 14)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r15 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 15)
        ELSE NULL END
      ) STORED;

    CREATE INDEX IF NOT EXISTS events_h3_r14_idx ON payload.events (h3_r14);
    CREATE INDEX IF NOT EXISTS events_h3_r15_idx ON payload.events (h3_r15);
  `);

  // ------------------------------------------------------------------
  // 2. Replace cluster_events() with version that returns location_count
  //    and location_name columns.
  //
  //    PostgreSQL requires DROP+CREATE to change the return type.
  // ------------------------------------------------------------------
  await db.execute(sql`
    DROP FUNCTION IF EXISTS public.cluster_events(
      double precision, double precision, double precision, double precision,
      integer, jsonb, integer, text, integer, boolean, double precision, text[], boolean
    );
  `);

  await db.execute(sql`
CREATE OR REPLACE FUNCTION public.cluster_events(
  p_min_lng double precision, p_min_lat double precision,
  p_max_lng double precision, p_max_lat double precision,
  p_zoom integer,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_target_clusters integer DEFAULT 25,
  p_algorithm text DEFAULT 'h3'::text,
  p_min_points integer DEFAULT 2,
  p_merge_overlapping boolean DEFAULT false,
  p_h3_resolution_scale double precision DEFAULT 0.6,
  p_parent_cells text[] DEFAULT NULL,
  p_use_hex_center boolean DEFAULT false
)
RETURNS TABLE(
  cluster_id text,
  longitude double precision,
  latitude double precision,
  event_count integer,
  event_ids text[],
  event_id text,
  event_title text,
  extent_degrees double precision,
  source_cells text[],
  location_count integer,
  location_name text
)
LANGUAGE plpgsql
AS $fn$
DECLARE
  st integer; smp integer; optimal_k integer; parent_res integer;
  vw double precision; vh double precision; va double precision;
  fc double precision; eiv integer; mc integer;
  h3_res integer;
  ground_res double precision;
  hex_edge_m double precision;
  merge_eps_m double precision;
BEGIN
  st := LEAST(500, GREATEST(5, p_target_clusters));
  smp := LEAST(20, GREATEST(2, p_min_points));
  vw := GREATEST(ABS(p_max_lng - p_min_lng), 0.0001);
  vh := GREATEST(ABS(p_max_lat - p_min_lat), 0.0001);
  va := vw * vh;
  h3_res := LEAST(15, GREATEST(2, ROUND(p_zoom::double precision * p_h3_resolution_scale)::integer));
  ground_res := 156543.03 * COS(RADIANS((p_min_lat + p_max_lat) / 2.0)) / POW(2, p_zoom);
  fc := SQRT(va / GREATEST(st, 5));

  hex_edge_m := CASE h3_res
    WHEN 2 THEN 183000 WHEN 3 THEN 69000 WHEN 4 THEN 26000 WHEN 5 THEN 9900
    WHEN 6 THEN 3700 WHEN 7 THEN 1400 WHEN 8 THEN 531 WHEN 9 THEN 201
    WHEN 10 THEN 76 WHEN 11 THEN 29 WHEN 12 THEN 11 WHEN 13 THEN 4
    WHEN 14 THEN 1.5 WHEN 15 THEN 0.5
    ELSE 100 END;
  merge_eps_m := 2.0 * hex_edge_m;

  IF p_parent_cells IS NOT NULL AND p_algorithm = 'h3' THEN
    parent_res := h3_res;
    h3_res := LEAST(15, h3_res + 2);
    hex_edge_m := CASE h3_res
      WHEN 2 THEN 183000 WHEN 3 THEN 69000 WHEN 4 THEN 26000 WHEN 5 THEN 9900
      WHEN 6 THEN 3700 WHEN 7 THEN 1400 WHEN 8 THEN 531 WHEN 9 THEN 201
      WHEN 10 THEN 76 WHEN 11 THEN 29 WHEN 12 THEN 11 WHEN 13 THEN 4
      WHEN 14 THEN 1.5 WHEN 15 THEN 0.5
      ELSE 100 END;
    merge_eps_m := 2.0 * hex_edge_m;
  END IF;

  -- ================================================================
  -- H3: Hexagonal grid clustering
  -- ================================================================
  IF p_algorithm = 'h3' THEN
    IF p_merge_overlapping THEN
      RETURN QUERY
      WITH fe AS (
        SELECT e.id, e.location_longitude as lng, e.location_latitude as lat,
               e.transformed_data->>'title' as title,
               e.location_name as loc_name,
               e.h3_r15 as loc_cell,
               CASE h3_res
                 WHEN 2 THEN h3_r2 WHEN 3 THEN h3_r3 WHEN 4 THEN h3_r4
                 WHEN 5 THEN h3_r5 WHEN 6 THEN h3_r6 WHEN 7 THEN h3_r7
                 WHEN 8 THEN h3_r8 WHEN 9 THEN h3_r9 WHEN 10 THEN h3_r10
                 WHEN 11 THEN h3_r11 WHEN 12 THEN h3_r12 WHEN 13 THEN h3_r13
                 WHEN 14 THEN h3_r14 WHEN 15 THEN h3_r15
                 ELSE h3_r15 END as h3_cell
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
          AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
          AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
          AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
          AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->>'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
          AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))))
          AND (p_parent_cells IS NULL OR (CASE parent_res WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(p_parent_cells))
      ), hc AS (
        SELECT h3_cell::text as cell,
          CASE WHEN p_use_hex_center THEN (h3_cell_to_latlng(h3_cell))[0] ELSE AVG(lng) END::double precision as cx,
          CASE WHEN p_use_hex_center THEN (h3_cell_to_latlng(h3_cell))[1] ELSE AVG(lat) END::double precision as cy,
          COUNT(*)::integer as cnt,
          GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
          ST_Transform(ST_SetSRID(ST_MakePoint(
            CASE WHEN p_use_hex_center THEN (h3_cell_to_latlng(h3_cell))[0] ELSE AVG(lng) END,
            CASE WHEN p_use_hex_center THEN (h3_cell_to_latlng(h3_cell))[1] ELSE AVG(lat) END
          ), 4326), 3857) as gp,
          MIN(id::text) as first_id, MIN(title) as first_title,
          COUNT(DISTINCT loc_cell)::integer as loc_count,
          MODE() WITHIN GROUP (ORDER BY loc_name) as loc_nm
        FROM fe GROUP BY h3_cell
      ), dbmerge AS (
        SELECT COALESCE(ST_ClusterDBSCAN(gp, eps := merge_eps_m, minpoints := 1) OVER (), -1) as merge_cid,
          cell, cx, cy, cnt, ext, first_id, first_title, loc_count, loc_nm
        FROM hc
      ), merge_groups AS (
        SELECT merge_cid, array_agg(cell ORDER BY cell) as group_cells, COUNT(*)::integer as group_size
        FROM dbmerge GROUP BY merge_cid
      )
      SELECT d.cell, d.cx, d.cy, d.cnt, NULL::text[],
        CASE WHEN d.cnt=1 THEN d.first_id ELSE null END,
        CASE WHEN d.cnt=1 THEN d.first_title ELSE null END,
        CASE WHEN d.cnt>1 THEN d.ext ELSE 0.0 END,
        CASE WHEN mg.group_size > 1 THEN mg.group_cells ELSE NULL END,
        d.loc_count, d.loc_nm::text
      FROM dbmerge d JOIN merge_groups mg ON d.merge_cid = mg.merge_cid;
    ELSE
      RETURN QUERY
      WITH fe AS (
        SELECT e.id, e.location_longitude as lng, e.location_latitude as lat,
               e.transformed_data->>'title' as title,
               e.location_name as loc_name,
               e.h3_r15 as loc_cell,
               CASE h3_res
                 WHEN 2 THEN h3_r2 WHEN 3 THEN h3_r3 WHEN 4 THEN h3_r4
                 WHEN 5 THEN h3_r5 WHEN 6 THEN h3_r6 WHEN 7 THEN h3_r7
                 WHEN 8 THEN h3_r8 WHEN 9 THEN h3_r9 WHEN 10 THEN h3_r10
                 WHEN 11 THEN h3_r11 WHEN 12 THEN h3_r12 WHEN 13 THEN h3_r13
                 WHEN 14 THEN h3_r14 WHEN 15 THEN h3_r15
                 ELSE h3_r15 END as h3_cell
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
          AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
          AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
          AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
          AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->>'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
          AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))))
          AND (p_parent_cells IS NULL OR (CASE parent_res WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(p_parent_cells))
      ), hc AS (
        SELECT h3_cell::text as cell,
          CASE WHEN p_use_hex_center THEN (h3_cell_to_latlng(h3_cell))[0] ELSE AVG(lng) END::double precision as cx,
          CASE WHEN p_use_hex_center THEN (h3_cell_to_latlng(h3_cell))[1] ELSE AVG(lat) END::double precision as cy,
          COUNT(*)::integer as cnt,
          GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
          MIN(id::text) as first_id, MIN(title) as first_title,
          COUNT(DISTINCT loc_cell)::integer as loc_count,
          MODE() WITHIN GROUP (ORDER BY loc_name) as loc_nm
        FROM fe GROUP BY h3_cell
      )
      SELECT cell, cx, cy, cnt, NULL::text[],
        CASE WHEN cnt=1 THEN first_id ELSE null END,
        CASE WHEN cnt=1 THEN first_title ELSE null END,
        CASE WHEN cnt>1 THEN ext ELSE 0.0 END, NULL::text[],
        loc_count, loc_nm::text FROM hc;
    END IF;

  -- ================================================================
  -- Grid-K: ROUND-grid pre-aggregation + K-Means with elbow detection
  -- ================================================================
  ELSIF p_algorithm = 'grid-k' THEN
    SELECT COUNT(*) INTO eiv FROM payload.events e
    JOIN payload.datasets d ON e.dataset_id = d.id
    WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
      AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
      AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
      AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
      AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
      AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
      AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
      AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
      AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))));

    IF eiv > 10 THEN
      SELECT find_optimal_k(array_agg(ST_SetSRID(ST_MakePoint(e.location_longitude, e.location_latitude), 4326)))
      INTO optimal_k FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
        AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
        AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
        AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
        AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
        AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))));
    ELSE
      optimal_k := st;
    END IF;

    -- Few events: return as individual points (with location metadata)
    IF eiv <= optimal_k THEN
      RETURN QUERY
      SELECT e.id::text,
        e.location_longitude::double precision, e.location_latitude::double precision,
        1::integer, ARRAY[e.id::text], e.id::text,
        (e.transformed_data->>'title')::text, 0.0::double precision, NULL::text[],
        1::integer, e.location_name::text
      FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
        AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
        AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
        AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
        AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
        AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))));
    ELSIF eiv <= 5000 THEN
      RETURN QUERY
      WITH fe AS (
        SELECT e.id, e.location_longitude as lng, e.location_latitude as lat,
               e.transformed_data->>'title' as title,
               e.location_name as loc_name,
               e.h3_r15 as loc_cell,
               ST_SetSRID(ST_MakePoint(e.location_longitude, e.location_latitude), 4326) as gp
        FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
          AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
          AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
          AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
          AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
          AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))))
      ), km AS (
        SELECT ST_ClusterKMeans(gp, optimal_k) OVER () as cid, id, lng, lat, title, loc_name, loc_cell FROM fe
      ), cl AS (
        SELECT cid, AVG(lng)::double precision as clng, AVG(lat)::double precision as clat,
          COUNT(*)::integer as cnt,
          GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
          MIN(id::text) as first_id, MIN(title) as first_title,
          COUNT(DISTINCT loc_cell)::integer as loc_count,
          MODE() WITHIN GROUP (ORDER BY loc_name) as loc_nm
        FROM km GROUP BY cid
      )
      SELECT cid::text, clng, clat, cnt, NULL::text[],
        CASE WHEN cnt=1 THEN first_id ELSE null END,
        CASE WHEN cnt=1 THEN first_title ELSE null END,
        CASE WHEN cnt>1 THEN ext ELSE 0.0 END, NULL::text[],
        loc_count, loc_nm::text FROM cl;
    ELSE
      CREATE TEMP TABLE _grid_cells ON COMMIT DROP AS
      SELECT ROUND(e.location_longitude/fc)*fc as gx, ROUND(e.location_latitude/fc)*fc as gy,
        AVG(e.location_longitude)::double precision as cx, AVG(e.location_latitude)::double precision as cy,
        COUNT(*)::integer as cnt,
        GREATEST((MAX(e.location_longitude)-MIN(e.location_longitude))/2.0,
                 (MAX(e.location_latitude)-MIN(e.location_latitude))/2.0)::double precision as ext,
        ST_SetSRID(ST_MakePoint(AVG(e.location_longitude),AVG(e.location_latitude)),4326) as gp,
        MIN(e.id::text) as first_id, MIN(e.transformed_data->>'title') as first_title,
        COUNT(DISTINCT e.h3_r15)::integer as loc_count,
        MODE() WITHIN GROUP (ORDER BY e.location_name) as loc_nm
      FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE e.location_longitude IS NOT NULL AND e.location_latitude IS NOT NULL
        AND (CASE WHEN p_min_lng <= p_max_lng THEN e.location_longitude BETWEEN p_min_lng AND p_max_lng ELSE (e.location_longitude >= p_min_lng OR e.location_longitude <= p_max_lng) END)
        AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
        AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
        AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
        AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))))
      GROUP BY gx, gy;
      SELECT COUNT(*) INTO mc FROM _grid_cells;
      RETURN QUERY
      WITH km AS (
        SELECT ST_ClusterKMeans(gp, LEAST(optimal_k, mc)) OVER () as cid,
          cx, cy, cnt, ext, first_id, first_title, loc_count, loc_nm FROM _grid_cells
      ), mg AS (
        SELECT cid,
          (SUM(cx*cnt)/SUM(cnt))::double precision as clng,
          (SUM(cy*cnt)/SUM(cnt))::double precision as clat,
          SUM(cnt)::integer as tc,
          MAX(ext)::double precision as me,
          MIN(first_id) as mfirst_id, MIN(first_title) as mfirst_title,
          SUM(loc_count)::integer as total_loc_count,
          MODE() WITHIN GROUP (ORDER BY loc_nm) as merged_loc_nm
        FROM km GROUP BY cid
      )
      SELECT cid::text, clng, clat, tc, NULL::text[],
        CASE WHEN tc=1 THEN mfirst_id ELSE null END,
        CASE WHEN tc=1 THEN mfirst_title ELSE null END,
        CASE WHEN tc>1 THEN me ELSE 0.0 END, NULL::text[],
        total_loc_count, merged_loc_nm::text FROM mg;
      DROP TABLE IF EXISTS _grid_cells;
    END IF;

  -- ================================================================
  -- DBSCAN: Direct density-based clustering
  -- ================================================================
  ELSIF p_algorithm = 'dbscan' THEN
    RETURN QUERY
    WITH fe AS (
      SELECT e.id, ST_Transform(e.geom, 3857) as gp, ST_X(e.geom) as lng, ST_Y(e.geom) as lat,
             e.transformed_data->>'title' as title,
             e.location_name as loc_name,
             e.h3_r15 as loc_cell
      FROM payload.events e JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE e.geom IS NOT NULL
        AND ST_Intersects(e.geom, CASE WHEN p_min_lng <= p_max_lng THEN ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326) ELSE ST_Union(ST_MakeEnvelope(p_min_lng, p_min_lat, 180.0, p_max_lat, 4326), ST_MakeEnvelope(-180.0, p_min_lat, p_max_lng, p_max_lat, 4326)) END)
        AND ((p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL) OR (p_filters->>'datasetId' IS NOT NULL AND e.dataset_id = (p_filters->>'datasetId')::int) OR (p_filters->'datasets' IS NOT NULL AND e.dataset_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[])))
        AND (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
        AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values) WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))))
    ), dr AS (
      SELECT ST_ClusterDBSCAN(gp, eps := SQRT(va / st) * 111320.0 * 0.5, minpoints := smp) OVER () AS cid,
        id, lng, lat, title, loc_name, loc_cell FROM fe
    ), cl AS (
      SELECT cid, AVG(lng)::double precision as clng, AVG(lat)::double precision as clat,
        COUNT(*)::integer as cnt,
        GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
        MIN(id::text) as first_id, MIN(title) as first_title,
        COUNT(DISTINCT loc_cell)::integer as loc_count,
        MODE() WITHIN GROUP (ORDER BY loc_name) as loc_nm
      FROM dr WHERE cid IS NOT NULL GROUP BY cid
    )
    SELECT cid::text, clng, clat, cnt, NULL::text[],
      CASE WHEN cnt=1 THEN first_id ELSE null END,
      CASE WHEN cnt=1 THEN first_title ELSE null END,
      CASE WHEN cnt>1 THEN ext ELSE 0.0 END, NULL::text[],
      loc_count, loc_nm::text FROM cl
    UNION ALL
    SELECT ('n:' || id::text), lng, lat, 1, NULL::text[], id::text, title, 0.0, NULL::text[],
      1::integer, loc_name::text FROM dr WHERE cid IS NULL;

  END IF;
END;
$fn$;
  `);

  // ------------------------------------------------------------------
  // 3. Update cluster_events_temporal() to support r14/r15 in
  //    clusterCells filter CASE statements.
  // ------------------------------------------------------------------
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.cluster_events_temporal(p_filters jsonb DEFAULT '{}'::jsonb, p_target_buckets integer DEFAULT 40, p_individual_threshold integer DEFAULT 500, p_group_by text DEFAULT 'dataset'::text)
     RETURNS TABLE(bucket_start timestamp with time zone, bucket_end timestamp with time zone, bucket_size_seconds integer, group_id text, group_name text, event_count bigint, event_id integer, event_title text, event_timestamp_val timestamp with time zone)
     LANGUAGE plpgsql
     STABLE
    AS $fn$
    DECLARE
      v_total bigint;
      v_min_date timestamp with time zone;
      v_max_date timestamp with time zone;
      v_range_seconds numeric;
      v_bucket_size_seconds integer;
    BEGIN
      SELECT COUNT(*), MIN(e.event_timestamp), MAX(e.event_timestamp)
      INTO v_total, v_min_date, v_max_date
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE
          (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
          AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
          AND (p_filters->'bounds' IS NULL OR (
            CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision
              THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision AND (p_filters->'bounds'->>'maxLng')::double precision
              ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
            END
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision AND (p_filters->'bounds'->>'maxLat')::double precision
          ))
          AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
            SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
            WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))
          ))
          AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
          AND e.event_timestamp IS NOT NULL;

      IF v_total = 0 THEN RETURN; END IF;

      -- INDIVIDUAL MODE
      IF v_total <= p_individual_threshold THEN
        RETURN QUERY
        SELECT
          v_min_date AS bucket_start, v_max_date AS bucket_end, 0 AS bucket_size_seconds,
          CASE p_group_by
            WHEN 'dataset' THEN e.dataset_id::text
            WHEN 'catalog' THEN d.catalog_id::text
            ELSE COALESCE(e.transformed_data ->> p_group_by, '(empty)')
          END AS group_id,
          CASE p_group_by
            WHEN 'dataset' THEN d.name
            WHEN 'catalog' THEN (SELECT c.name FROM payload.catalogs c WHERE c.id = d.catalog_id)
            ELSE COALESCE(e.transformed_data ->> p_group_by, '(empty)')
          END AS group_name,
          1::bigint AS event_count,
          e.id::integer AS event_id,
          (e.transformed_data->>'title')::text AS event_title,
          e.event_timestamp AS event_timestamp_val
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE
            (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
            AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
            AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
            AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
            AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
            AND (p_filters->'bounds' IS NULL OR (
              CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision
                THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision AND (p_filters->'bounds'->>'maxLng')::double precision
                ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
              END
              AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision AND (p_filters->'bounds'->>'maxLat')::double precision
            ))
            AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
              SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
              WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))
            ))
            AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
            AND e.event_timestamp IS NOT NULL
        ORDER BY e.event_timestamp;
        RETURN;
      END IF;

      -- CLUSTERED MODE
      v_range_seconds := EXTRACT(EPOCH FROM (v_max_date - v_min_date));

      IF v_range_seconds = 0 THEN
        RETURN QUERY
        SELECT
          v_min_date AS bucket_start, v_min_date AS bucket_end, 0 AS bucket_size_seconds,
          CASE p_group_by
            WHEN 'dataset' THEN e.dataset_id::text
            WHEN 'catalog' THEN d.catalog_id::text
            ELSE COALESCE(e.transformed_data ->> p_group_by, '(empty)')
          END AS group_id,
          CASE p_group_by
            WHEN 'dataset' THEN d.name
            WHEN 'catalog' THEN (SELECT c.name FROM payload.catalogs c WHERE c.id = d.catalog_id)
            ELSE COALESCE(e.transformed_data ->> p_group_by, '(empty)')
          END AS group_name,
          COUNT(*)::bigint AS event_count,
          NULL::integer AS event_id,
          NULL::text AS event_title,
          NULL::timestamp with time zone AS event_timestamp_val
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE
            (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
            AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
            AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
            AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
            AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
            AND (p_filters->'bounds' IS NULL OR (
              CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision
                THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision AND (p_filters->'bounds'->>'maxLng')::double precision
                ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
              END
              AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision AND (p_filters->'bounds'->>'maxLat')::double precision
            ))
            AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
              SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
              WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))
            ))
            AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
            AND e.event_timestamp IS NOT NULL
        GROUP BY group_id, group_name;
        RETURN;
      END IF;

      v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_target_buckets)::integer);

      RETURN QUERY
      WITH
        filtered_events AS (
          SELECT
            e.id, e.event_timestamp,
            CASE p_group_by
              WHEN 'dataset' THEN e.dataset_id::text
              WHEN 'catalog' THEN d.catalog_id::text
              ELSE COALESCE(e.transformed_data ->> p_group_by, '(empty)')
            END AS grp_id,
            CASE p_group_by
              WHEN 'dataset' THEN d.name
              WHEN 'catalog' THEN (SELECT c.name FROM payload.catalogs c WHERE c.id = d.catalog_id)
              ELSE COALESCE(e.transformed_data ->> p_group_by, '(empty)')
            END AS grp_name
          FROM payload.events e
          JOIN payload.datasets d ON e.dataset_id = d.id
          WHERE
              (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
              AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
              AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamp)
              AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamp)
              AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
              AND (p_filters->'bounds' IS NULL OR (
                CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision
                  THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision AND (p_filters->'bounds'->>'maxLng')::double precision
                  ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
                END
                AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision AND (p_filters->'bounds'->>'maxLat')::double precision
              ))
              AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
                SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                WHERE NOT (e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))))
              ))
              AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
              AND e.event_timestamp IS NOT NULL
        ),
        bucket_series AS (
          SELECT generate_series(v_min_date, v_max_date, (v_bucket_size_seconds || ' seconds')::interval) AS bs_start
        ),
        buckets AS (
          SELECT bs_start AS b_start, bs_start + (v_bucket_size_seconds || ' seconds')::interval AS b_end FROM bucket_series
        )
      SELECT
        b.b_start AS bucket_start, b.b_end AS bucket_end,
        v_bucket_size_seconds AS bucket_size_seconds,
        fe.grp_id::text AS group_id, fe.grp_name::text AS group_name,
        COUNT(fe.id)::bigint AS event_count,
        NULL::integer AS event_id, NULL::text AS event_title,
        NULL::timestamp with time zone AS event_timestamp_val
      FROM buckets b
      LEFT JOIN filtered_events fe ON fe.event_timestamp >= b.b_start AND fe.event_timestamp < b.b_end
      WHERE fe.id IS NOT NULL
      GROUP BY b.b_start, b.b_end, fe.grp_id, fe.grp_name
      ORDER BY b.b_start, fe.grp_id;
    END;
    $fn$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The down migration restores the original cluster_events() signature
  // (without location_count/location_name). In practice, running the
  // original h3_map_clustering migration's up() again would restore it,
  // but we handle it explicitly here.

  // Drop H3 r14/r15 indexes
  await db.execute(sql`
    DROP INDEX IF EXISTS payload.events_h3_r14_idx;
    DROP INDEX IF EXISTS payload.events_h3_r15_idx;
  `);

  // Drop H3 r14/r15 columns
  await db.execute(sql`
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r14;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r15;
  `);

  // Note: cluster_events() and cluster_events_temporal() would need to be
  // restored from the original migration. This is handled by running the
  // original migration's up() after this down().
}
