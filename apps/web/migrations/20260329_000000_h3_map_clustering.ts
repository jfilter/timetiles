/**
 * Consolidated H3 map clustering migration.
 *
 * Adds the geometry column, GiST index, auto-update trigger, H3 extension,
 * H3 generated columns (r2-r13) with B-tree indexes, helper functions
 * (array_cat_agg, find_optimal_k), and the cluster_events /
 * cluster_events_temporal SQL functions used by the geospatial and temporal
 * API endpoints.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Geometry column + GiST index + trigger
  // ------------------------------------------------------------------
  await db.execute(sql`
    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

    UPDATE payload.events
    SET geom = ST_SetSRID(ST_MakePoint(location_longitude, location_latitude), 4326)
    WHERE location_longitude IS NOT NULL
      AND location_latitude IS NOT NULL
      AND geom IS NULL;

    CREATE INDEX IF NOT EXISTS events_geom_gist_idx
      ON payload.events USING gist(geom);

    CREATE OR REPLACE FUNCTION update_events_geom()
      RETURNS trigger AS $fn$
    BEGIN
      NEW.geom := CASE
        WHEN NEW.location_longitude IS NOT NULL AND NEW.location_latitude IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(NEW.location_longitude, NEW.location_latitude), 4326)
        ELSE NULL
      END;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_events_geom ON payload.events;
    CREATE TRIGGER trg_events_geom
      BEFORE INSERT OR UPDATE OF location_longitude, location_latitude
      ON payload.events
      FOR EACH ROW EXECUTE FUNCTION update_events_geom();
  `);

  // ------------------------------------------------------------------
  // 2. H3 extension
  // ------------------------------------------------------------------
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS h3;
  `);

  // ------------------------------------------------------------------
  // 3. H3 generated columns r2-r13
  // ------------------------------------------------------------------
  await db.execute(sql`
    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r2 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 2)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r3 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 3)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r4 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 4)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r5 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 5)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r6 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 6)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r7 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 7)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r8 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 8)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r9 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 9)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r10 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 10)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r11 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 11)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r12 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 12)
        ELSE NULL END
      ) STORED;

    ALTER TABLE payload.events
      ADD COLUMN IF NOT EXISTS h3_r13 h3index GENERATED ALWAYS AS (
        CASE WHEN location_longitude IS NOT NULL AND location_latitude IS NOT NULL
        THEN h3_latlng_to_cell(POINT(location_longitude, location_latitude), 13)
        ELSE NULL END
      ) STORED;
  `);

  // ------------------------------------------------------------------
  // 4. B-tree indexes on H3 columns
  // ------------------------------------------------------------------
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_h3_r2_idx ON payload.events (h3_r2);
    CREATE INDEX IF NOT EXISTS events_h3_r3_idx ON payload.events (h3_r3);
    CREATE INDEX IF NOT EXISTS events_h3_r4_idx ON payload.events (h3_r4);
    CREATE INDEX IF NOT EXISTS events_h3_r5_idx ON payload.events (h3_r5);
    CREATE INDEX IF NOT EXISTS events_h3_r6_idx ON payload.events (h3_r6);
    CREATE INDEX IF NOT EXISTS events_h3_r7_idx ON payload.events (h3_r7);
    CREATE INDEX IF NOT EXISTS events_h3_r8_idx ON payload.events (h3_r8);
    CREATE INDEX IF NOT EXISTS events_h3_r9_idx ON payload.events (h3_r9);
    CREATE INDEX IF NOT EXISTS events_h3_r10_idx ON payload.events (h3_r10);
    CREATE INDEX IF NOT EXISTS events_h3_r11_idx ON payload.events (h3_r11);
    CREATE INDEX IF NOT EXISTS events_h3_r12_idx ON payload.events (h3_r12);
    CREATE INDEX IF NOT EXISTS events_h3_r13_idx ON payload.events (h3_r13);
  `);

  // ------------------------------------------------------------------
  // 5. Helper functions: array_cat_agg + find_optimal_k
  // ------------------------------------------------------------------
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.array_cat_agg_sfunc(text[], text[])
      RETURNS text[] AS $fn$
      SELECT array_cat($1, $2);
    $fn$ LANGUAGE sql IMMUTABLE;

    DROP AGGREGATE IF EXISTS public.array_cat_agg(text[]);
    CREATE AGGREGATE public.array_cat_agg(text[]) (
      sfunc = array_cat_agg_sfunc,
      stype = text[],
      initcond = '{}'
    );

    CREATE OR REPLACE FUNCTION public.find_optimal_k(
      points geometry[],
      k_values integer[] DEFAULT ARRAY[10, 20, 30, 40, 50, 60, 80, 100],
      threshold double precision DEFAULT 0.20
    )
    RETURNS integer
    LANGUAGE plpgsql
    STABLE
    AS $fn$
    DECLARE
      test_k integer;
      prev_var double precision := NULL;
      cur_var double precision;
      improvement double precision;
      best_k integer := 10;
      n integer;
    BEGIN
      n := array_length(points, 1);
      IF n IS NULL OR n <= 10 THEN RETURN COALESCE(n, 1); END IF;
      FOREACH test_k IN ARRAY k_values LOOP
        IF test_k >= n THEN EXIT; END IF;
        SELECT COALESCE(SUM(ST_Distance(sub.gp, sub.centroid)^2), 0) INTO cur_var
        FROM (SELECT gp, ST_Centroid(ST_Collect(gp) OVER (PARTITION BY cid)) as centroid
              FROM (SELECT ST_ClusterKMeans(gp, test_k) OVER () as cid, gp
                    FROM unnest(points) as gp) km) sub;
        IF prev_var IS NOT NULL AND prev_var > 0 THEN
          improvement := (prev_var - cur_var) / prev_var;
          IF improvement < threshold THEN EXIT; END IF;
        END IF;
        best_k := test_k; prev_var := cur_var;
      END LOOP;
      RETURN best_k;
    END;
    $fn$;
  `);

  // ------------------------------------------------------------------
  // 6. cluster_events() function
  // ------------------------------------------------------------------
  await db.execute(sql`
CREATE OR REPLACE FUNCTION public.cluster_events(p_min_lng double precision, p_min_lat double precision, p_max_lng double precision, p_max_lat double precision, p_zoom integer, p_filters jsonb DEFAULT '{}'::jsonb, p_target_clusters integer DEFAULT 25, p_algorithm text DEFAULT 'h3'::text, p_min_points integer DEFAULT 2, p_merge_overlapping boolean DEFAULT false, p_h3_resolution_scale double precision DEFAULT 0.6)
 RETURNS TABLE(cluster_id text, longitude double precision, latitude double precision, event_count integer, event_ids text[], event_id text, event_title text, extent_degrees double precision)
 LANGUAGE plpgsql
AS $fn$
DECLARE
  st integer; smp integer; optimal_k integer;
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
  h3_res := LEAST(13, GREATEST(2, ROUND(p_zoom::double precision * p_h3_resolution_scale)::integer));
  ground_res := 156543.03 * COS(RADIANS((p_min_lat + p_max_lat) / 2.0)) / POW(2, p_zoom);
  -- Cell size for ROUND-grid pre-aggregation (Grid-K)
  fc := SQRT(va / GREATEST(st, 5));

  -- H3 hex edge length in meters (approximate, used for merge eps)
  hex_edge_m := CASE h3_res
    WHEN 2 THEN 183000 WHEN 3 THEN 69000 WHEN 4 THEN 26000 WHEN 5 THEN 9900
    WHEN 6 THEN 3700 WHEN 7 THEN 1400 WHEN 8 THEN 531 WHEN 9 THEN 201
    WHEN 10 THEN 76 WHEN 11 THEN 29 WHEN 12 THEN 11 WHEN 13 THEN 4
    ELSE 100 END;
  -- Circles are capped at hex size, so max overlap = 2 * hex_edge
  merge_eps_m := 2.0 * hex_edge_m;

  -- ================================================================
  -- H3: Hexagonal grid clustering
  -- ================================================================
  IF p_algorithm = 'h3' THEN
    IF p_merge_overlapping THEN
      RETURN QUERY
      WITH fe AS (
        SELECT e.id, e.location_longitude as lng, e.location_latitude as lat,
               e.transformed_data->>'title' as title,
               CASE h3_res
                 WHEN 2 THEN h3_r2 WHEN 3 THEN h3_r3 WHEN 4 THEN h3_r4
                 WHEN 5 THEN h3_r5 WHEN 6 THEN h3_r6 WHEN 7 THEN h3_r7
                 WHEN 8 THEN h3_r8 WHEN 9 THEN h3_r9 WHEN 10 THEN h3_r10
                 WHEN 11 THEN h3_r11 WHEN 12 THEN h3_r12 WHEN 13 THEN h3_r13
                 ELSE h3_r13 END as h3_cell
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
      ), hc AS (
        SELECT h3_cell::text as cell,
          AVG(lng)::double precision as cx, AVG(lat)::double precision as cy,
          COUNT(*)::integer as cnt,
          GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
          ST_Transform(ST_SetSRID(ST_MakePoint(AVG(lng), AVG(lat)), 4326), 3857) as gp,
          MIN(id::text) as first_id, MIN(title) as first_title
        FROM fe GROUP BY h3_cell
      ), dbmerge AS (
        SELECT COALESCE(ST_ClusterDBSCAN(gp, eps := merge_eps_m, minpoints := 1) OVER (), -1) as merge_cid,
          cell, cx, cy, cnt, ext, first_id, first_title
        FROM hc
      ), merged AS (
        SELECT MIN(cell) as merge_key,
          (SUM(cx * cnt) / SUM(cnt))::double precision as mcx,
          (SUM(cy * cnt) / SUM(cnt))::double precision as mcy,
          SUM(cnt)::integer as mcnt,
          MAX(ext)::double precision as mext,
          MIN(first_id) as mfirst_id,
          MIN(first_title) as mfirst_title
        FROM dbmerge GROUP BY merge_cid
      )
      SELECT merge_key, mcx, mcy, mcnt, NULL::text[],
        CASE WHEN mcnt=1 THEN mfirst_id ELSE null END,
        CASE WHEN mcnt=1 THEN mfirst_title ELSE null END,
        CASE WHEN mcnt>1 THEN mext ELSE 0.0 END FROM merged;
    ELSE
      RETURN QUERY
      WITH fe AS (
        SELECT e.id, e.location_longitude as lng, e.location_latitude as lat,
               e.transformed_data->>'title' as title,
               CASE h3_res
                 WHEN 2 THEN h3_r2 WHEN 3 THEN h3_r3 WHEN 4 THEN h3_r4
                 WHEN 5 THEN h3_r5 WHEN 6 THEN h3_r6 WHEN 7 THEN h3_r7
                 WHEN 8 THEN h3_r8 WHEN 9 THEN h3_r9 WHEN 10 THEN h3_r10
                 WHEN 11 THEN h3_r11 WHEN 12 THEN h3_r12 WHEN 13 THEN h3_r13
                 ELSE h3_r13 END as h3_cell
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
      ), hc AS (
        SELECT h3_cell::text as cell,
          AVG(lng)::double precision as cx, AVG(lat)::double precision as cy,
          COUNT(*)::integer as cnt,
          GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
          MIN(id::text) as first_id, MIN(title) as first_title
        FROM fe GROUP BY h3_cell
      )
      SELECT cell, cx, cy, cnt, NULL::text[],
        CASE WHEN cnt=1 THEN first_id ELSE null END,
        CASE WHEN cnt=1 THEN first_title ELSE null END,
        CASE WHEN cnt>1 THEN ext ELSE 0.0 END FROM hc;
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

    -- Few events: return as individual points
    IF eiv <= optimal_k THEN
      RETURN QUERY
      SELECT e.id::text,
        e.location_longitude::double precision, e.location_latitude::double precision,
        1::integer, ARRAY[e.id::text], e.id::text,
        (e.transformed_data->>'title')::text, 0.0::double precision
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
        SELECT ST_ClusterKMeans(gp, optimal_k) OVER () as cid, id, lng, lat, title FROM fe
      ), cl AS (
        SELECT cid, AVG(lng)::double precision as clng, AVG(lat)::double precision as clat,
          COUNT(*)::integer as cnt,
          GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
          MIN(id::text) as first_id, MIN(title) as first_title
        FROM km GROUP BY cid
      )
      SELECT cid::text, clng, clat, cnt, NULL::text[],
        CASE WHEN cnt=1 THEN first_id ELSE null END,
        CASE WHEN cnt=1 THEN first_title ELSE null END,
        CASE WHEN cnt>1 THEN ext ELSE 0.0 END FROM cl;
    ELSE
      CREATE TEMP TABLE _grid_cells ON COMMIT DROP AS
      SELECT ROUND(e.location_longitude/fc)*fc as gx, ROUND(e.location_latitude/fc)*fc as gy,
        AVG(e.location_longitude)::double precision as cx, AVG(e.location_latitude)::double precision as cy,
        COUNT(*)::integer as cnt,
        GREATEST((MAX(e.location_longitude)-MIN(e.location_longitude))/2.0,
                 (MAX(e.location_latitude)-MIN(e.location_latitude))/2.0)::double precision as ext,
        ST_SetSRID(ST_MakePoint(AVG(e.location_longitude),AVG(e.location_latitude)),4326) as gp,
        MIN(e.id::text) as first_id, MIN(e.transformed_data->>'title') as first_title
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
          cx, cy, cnt, ext, first_id, first_title FROM _grid_cells
      ), mg AS (
        SELECT cid,
          (SUM(cx*cnt)/SUM(cnt))::double precision as clng,
          (SUM(cy*cnt)/SUM(cnt))::double precision as clat,
          SUM(cnt)::integer as tc,
          MAX(ext)::double precision as me,
          MIN(first_id) as mfirst_id, MIN(first_title) as mfirst_title
        FROM km GROUP BY cid
      )
      SELECT cid::text, clng, clat, tc, NULL::text[],
        CASE WHEN tc=1 THEN mfirst_id ELSE null END,
        CASE WHEN tc=1 THEN mfirst_title ELSE null END,
        CASE WHEN tc>1 THEN me ELSE 0.0 END FROM mg;
      DROP TABLE IF EXISTS _grid_cells;
    END IF;

  -- ================================================================
  -- DBSCAN: Direct density-based clustering
  -- ================================================================
  ELSIF p_algorithm = 'dbscan' THEN
    RETURN QUERY
    WITH fe AS (
      SELECT e.id, ST_Transform(e.geom, 3857) as gp, ST_X(e.geom) as lng, ST_Y(e.geom) as lat,
             e.transformed_data->>'title' as title
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
        id, lng, lat, title FROM fe
    ), cl AS (
      SELECT cid, AVG(lng)::double precision as clng, AVG(lat)::double precision as clat,
        COUNT(*)::integer as cnt,
        GREATEST((MAX(lng)-MIN(lng))/2.0,(MAX(lat)-MIN(lat))/2.0)::double precision as ext,
        MIN(id::text) as first_id, MIN(title) as first_title
      FROM dr WHERE cid IS NOT NULL GROUP BY cid
    )
    SELECT cid::text, clng, clat, cnt, NULL::text[],
      CASE WHEN cnt=1 THEN first_id ELSE null END,
      CASE WHEN cnt=1 THEN first_title ELSE null END,
      CASE WHEN cnt>1 THEN ext ELSE 0.0 END FROM cl
    UNION ALL
    SELECT ('n:' || id::text), lng, lat, 1, NULL::text[], id::text, title, 0.0
    FROM dr WHERE cid IS NULL;

  END IF;
END;
$fn$;
  `);

  // ------------------------------------------------------------------
  // 7. cluster_events_temporal() function
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
    -- Count total matching events and get date range
    SELECT COUNT(*), MIN(e.event_timestamp), MAX(e.event_timestamp)
    INTO v_total, v_min_date, v_max_date
    FROM payload.events e
    JOIN payload.datasets d ON e.dataset_id = d.id
    WHERE

        (p_filters->>'catalogId' IS NULL OR
         d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR
             d.catalog_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
             ))
        AND (p_filters->>'startDate' IS NULL OR
             e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR
             e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'datasets' IS NULL OR
             e.dataset_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'datasets')::int
             ))

          AND (p_filters->'bounds' IS NULL OR (
            CASE WHEN (p_filters->'bounds'->>'minLng')::double precision
                   <= (p_filters->'bounds'->>'maxLng')::double precision
              THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision
                 OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
            END
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))

          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))
        AND e.event_timestamp IS NOT NULL;

    IF v_total = 0 THEN
      RETURN;
    END IF;

    -- INDIVIDUAL MODE: return one row per event
    IF v_total <= p_individual_threshold THEN
      RETURN QUERY
      SELECT
        v_min_date AS bucket_start,
        v_max_date AS bucket_end,
        0 AS bucket_size_seconds,
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

        (p_filters->>'catalogId' IS NULL OR
         d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR
             d.catalog_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
             ))
        AND (p_filters->>'startDate' IS NULL OR
             e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR
             e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'datasets' IS NULL OR
             e.dataset_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'datasets')::int
             ))

          AND (p_filters->'bounds' IS NULL OR (
            CASE WHEN (p_filters->'bounds'->>'minLng')::double precision
                   <= (p_filters->'bounds'->>'maxLng')::double precision
              THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision
                 OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
            END
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))

          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))
        AND e.event_timestamp IS NOT NULL
      ORDER BY e.event_timestamp;
      RETURN;
    END IF;

    -- CLUSTERED MODE
    v_range_seconds := EXTRACT(EPOCH FROM (v_max_date - v_min_date));

    IF v_range_seconds = 0 THEN
      RETURN QUERY
      SELECT
        v_min_date AS bucket_start,
        v_min_date AS bucket_end,
        0 AS bucket_size_seconds,
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

        (p_filters->>'catalogId' IS NULL OR
         d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR
             d.catalog_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
             ))
        AND (p_filters->>'startDate' IS NULL OR
             e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR
             e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'datasets' IS NULL OR
             e.dataset_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'datasets')::int
             ))

          AND (p_filters->'bounds' IS NULL OR (
            CASE WHEN (p_filters->'bounds'->>'minLng')::double precision
                   <= (p_filters->'bounds'->>'maxLng')::double precision
              THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision
                 OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
            END
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))

          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))
        AND e.event_timestamp IS NOT NULL
      GROUP BY group_id, group_name;
      RETURN;
    END IF;

    v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_target_buckets)::integer);

    RETURN QUERY
    WITH
      filtered_events AS (
        SELECT
          e.id,
          e.event_timestamp,
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

        (p_filters->>'catalogId' IS NULL OR
         d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR
             d.catalog_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
             ))
        AND (p_filters->>'startDate' IS NULL OR
             e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR
             e.event_timestamp <= (p_filters->>'endDate')::timestamp)
        AND (p_filters->'datasets' IS NULL OR
             e.dataset_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'datasets')::int
             ))

          AND (p_filters->'bounds' IS NULL OR (
            CASE WHEN (p_filters->'bounds'->>'minLng')::double precision
                   <= (p_filters->'bounds'->>'maxLng')::double precision
              THEN e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              ELSE (e.location_longitude >= (p_filters->'bounds'->>'minLng')::double precision
                 OR e.location_longitude <= (p_filters->'bounds'->>'maxLng')::double precision)
            END
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))

          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))
        AND e.event_timestamp IS NOT NULL
      ),
      bucket_series AS (
        SELECT generate_series(
          v_min_date,
          v_max_date,
          (v_bucket_size_seconds || ' seconds')::interval
        ) AS bs_start
      ),
      buckets AS (
        SELECT
          bs_start AS b_start,
          bs_start + (v_bucket_size_seconds || ' seconds')::interval AS b_end
        FROM bucket_series
      )
    SELECT
      b.b_start AS bucket_start,
      b.b_end AS bucket_end,
      v_bucket_size_seconds AS bucket_size_seconds,
      fe.grp_id::text AS group_id,
      fe.grp_name::text AS group_name,
      COUNT(fe.id)::bigint AS event_count,
      NULL::integer AS event_id,
      NULL::text AS event_title,
      NULL::timestamp with time zone AS event_timestamp_val
    FROM buckets b
    LEFT JOIN filtered_events fe
      ON fe.event_timestamp >= b.b_start
      AND fe.event_timestamp < b.b_end
    WHERE fe.id IS NOT NULL
    GROUP BY b.b_start, b.b_end, fe.grp_id, fe.grp_name
    ORDER BY b.b_start, fe.grp_id;
  END;
$fn$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop SQL functions
  await db.execute(sql`
    DROP FUNCTION IF EXISTS public.cluster_events_temporal(jsonb, integer, integer, text);
    DROP FUNCTION IF EXISTS public.cluster_events(double precision, double precision, double precision, double precision, integer, jsonb, integer, text, integer, boolean, double precision);
    DROP FUNCTION IF EXISTS public.find_optimal_k(geometry[], integer[], double precision);
    DROP AGGREGATE IF EXISTS public.array_cat_agg(text[]);
    DROP FUNCTION IF EXISTS public.array_cat_agg_sfunc(text[], text[]);
  `);

  // Drop H3 indexes
  await db.execute(sql`
    DROP INDEX IF EXISTS payload.events_h3_r2_idx;
    DROP INDEX IF EXISTS payload.events_h3_r3_idx;
    DROP INDEX IF EXISTS payload.events_h3_r4_idx;
    DROP INDEX IF EXISTS payload.events_h3_r5_idx;
    DROP INDEX IF EXISTS payload.events_h3_r6_idx;
    DROP INDEX IF EXISTS payload.events_h3_r7_idx;
    DROP INDEX IF EXISTS payload.events_h3_r8_idx;
    DROP INDEX IF EXISTS payload.events_h3_r9_idx;
    DROP INDEX IF EXISTS payload.events_h3_r10_idx;
    DROP INDEX IF EXISTS payload.events_h3_r11_idx;
    DROP INDEX IF EXISTS payload.events_h3_r12_idx;
    DROP INDEX IF EXISTS payload.events_h3_r13_idx;
  `);

  // Drop H3 columns
  await db.execute(sql`
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r2;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r3;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r4;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r5;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r6;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r7;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r8;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r9;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r10;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r11;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r12;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS h3_r13;
  `);

  // Drop H3 extension
  await db.execute(sql`
    DROP EXTENSION IF EXISTS h3;
  `);

  // Drop trigger, trigger function, geom index, and geom column
  await db.execute(sql`
    DROP TRIGGER IF EXISTS trg_events_geom ON payload.events;
    DROP FUNCTION IF EXISTS update_events_geom();
    DROP INDEX IF EXISTS payload.events_geom_gist_idx;
    ALTER TABLE payload.events DROP COLUMN IF EXISTS geom;
  `);
}
