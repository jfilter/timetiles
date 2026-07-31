/**
 * Widen the histogram bucket size from int4 to int8.
 *
 * `bucket_size_seconds` was an `integer` in both functions' `RETURNS TABLE`, capping a bucket
 * at 2147483647 seconds — about 68 years. `20260731_120000` clamped the computation to that
 * ceiling to stop `GET /api/v1/events/temporal?targetBuckets=1` from answering 500
 * (SQLSTATE 22003) over a longer-spanning dataset, but a clamp only converts the crash into a
 * wrong answer: past 68 years the derived size can no longer cover the range, so
 * `maxBuckets=1` still produced two buckets and `cluster_events_temporal` silently bucketed
 * at the wrong granularity. Historical sources legitimately span centuries.
 *
 * A return type cannot be changed with CREATE OR REPLACE, so unlike every other migration in
 * this chain these two functions are DROPped and re-created in full. That makes THIS FILE the
 * definition of record for both — a later in-place `pg_get_functiondef` patch must be written
 * against the bodies below, not against the ones in the earlier migrations.
 *
 * The bodies are the live post-migration definitions as of `20260731_200000`, with three
 * mechanical changes: `bucket_size_seconds` and the two locals widened to `bigint`, and the
 * `LEAST(2147483647, …)` clamps dropped (an int8 second count cannot overflow for any range
 * a timestamptz can express).
 *
 * The pg driver returns int8 as a STRING — the temporal routes coerce with Number().
 *
 * down() is forward-only, consistent with the rest of this chain; use `make db-reset`.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const DROP_STATEMENTS = [
  "DROP FUNCTION IF EXISTS public.calculate_event_histogram(jsonb, integer, integer, integer)",
  "DROP FUNCTION IF EXISTS public.cluster_events_temporal(jsonb, integer, integer, text)",
];

const CALCULATE_EVENT_HISTOGRAM = `CREATE FUNCTION public.calculate_event_histogram(p_filters jsonb DEFAULT '{}'::jsonb, p_target_buckets integer DEFAULT 30, p_min_buckets integer DEFAULT 20, p_max_buckets integer DEFAULT 50)
 RETURNS TABLE(bucket_start timestamp with time zone, bucket_end timestamp with time zone, bucket_size_seconds bigint, event_count bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
  DECLARE
    v_min_date timestamp with time zone;
    v_max_date timestamp with time zone;
    v_range_seconds numeric;
    v_bucket_size_seconds bigint;
    v_resulting_buckets bigint;
  BEGIN
    WITH filtered_events AS (
      SELECT e.event_timestamp
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE
        (p_filters->>'catalogId' IS NULL OR
         d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR
             d.catalog_id = ANY(
               SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
             ))
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
        AND (p_filters->>'startDate' IS NULL OR
             e.event_timestamp >= (p_filters->>'startDate')::timestamptz)
        AND (p_filters->>'endDate' IS NULL OR
             e.event_timestamp <= (p_filters->>'endDate')::timestamptz)
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
                 WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
               ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
          AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
        AND e.event_timestamp IS NOT NULL
    )
    SELECT
      MIN(event_timestamp),
      MAX(event_timestamp)
    INTO v_min_date, v_max_date
    FROM filtered_events;

    IF v_min_date IS NULL OR v_max_date IS NULL THEN
      RETURN;
    END IF;

    IF v_min_date = v_max_date THEN
      RETURN QUERY
      WITH filtered AS (
        SELECT e.id
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.event_timestamp = v_min_date
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
          AND (p_filters->>'catalogId' IS NULL OR
               d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR
               d.catalog_id = ANY(
                 SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
               ))
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
          AND (p_filters->'datasets' IS NULL OR
               e.dataset_id = ANY(
                 SELECT jsonb_array_elements_text(p_filters->'datasets')::int
               ))

          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
               ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
          AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
      )
      SELECT
        v_min_date,
        v_min_date,
        0::bigint,
        COUNT(*)::bigint
      FROM filtered;
      RETURN;
    END IF;

    v_range_seconds := EXTRACT(EPOCH FROM (v_max_date - v_min_date));
    v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_target_buckets)::bigint);
    v_resulting_buckets := FLOOR(v_range_seconds / v_bucket_size_seconds)::bigint + 1;

    IF v_resulting_buckets > p_max_buckets THEN
      v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_max_buckets)::bigint + 1);
    END IF;

    IF v_resulting_buckets < p_min_buckets THEN
      v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_min_buckets)::bigint);
    END IF;

    -- p_max_buckets is a hard ceiling: the min branch above runs unconditionally and would otherwise
    -- undo the cap whenever the caller passes min = max.
    v_bucket_size_seconds := GREATEST(v_bucket_size_seconds, GREATEST(1, FLOOR(v_range_seconds / p_max_buckets)::bigint + 1));

    RETURN QUERY
    WITH
      filtered_events AS (
        SELECT e.id, e.event_timestamp
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE
          (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR
               d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
          AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamptz)
          AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamptz)
          AND (p_filters->'datasets' IS NULL OR
               e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
          
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
                 WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
               ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
          AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
          AND e.event_timestamp IS NOT NULL
      ),
      bucket_series AS (
        SELECT generate_series(v_min_date, v_max_date, (v_bucket_size_seconds || ' seconds')::interval) as bs_start
      ),
      buckets AS (
        SELECT bs_start as bucket_start, bs_start + (v_bucket_size_seconds || ' seconds')::interval as bucket_end
        FROM bucket_series
      )
    SELECT buckets.bucket_start, buckets.bucket_end, v_bucket_size_seconds, COUNT(e.id)::bigint
    FROM buckets
    LEFT JOIN filtered_events e ON e.event_timestamp >= buckets.bucket_start AND e.event_timestamp < buckets.bucket_end
    GROUP BY buckets.bucket_start, buckets.bucket_end
    ORDER BY buckets.bucket_start;
  END;
  $function$`;

const CLUSTER_EVENTS_TEMPORAL = `CREATE FUNCTION public.cluster_events_temporal(p_filters jsonb DEFAULT '{}'::jsonb, p_target_buckets integer DEFAULT 40, p_individual_threshold integer DEFAULT 500, p_group_by text DEFAULT 'dataset'::text)
 RETURNS TABLE(bucket_start timestamp with time zone, bucket_end timestamp with time zone, bucket_size_seconds bigint, group_id text, group_name text, event_count bigint, event_id integer, event_title text, event_timestamp_val timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
AS $function$
    DECLARE
      v_total bigint;
      v_min_date timestamp with time zone;
      v_max_date timestamp with time zone;
      v_range_seconds numeric;
      v_bucket_size_seconds bigint;
    BEGIN
      SELECT COUNT(*), MIN(e.event_timestamp), MAX(e.event_timestamp)
      INTO v_total, v_min_date, v_max_date
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE
          (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
          AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamptz)
          AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamptz)
          AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
          AND (p_filters->'bounds' IS NULL OR (
            e.geom IS NOT NULL AND ST_Intersects(e.geom, CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision THEN ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326) ELSE ST_Union(ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, 180.0, (p_filters->'bounds'->>'maxLat')::double precision, 4326), ST_MakeEnvelope(-180.0, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326)) END)
          ))
          AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
            SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
            WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
          ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
          AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
          AND e.event_timestamp IS NOT NULL;

      IF v_total = 0 THEN RETURN; END IF;

      -- INDIVIDUAL MODE
      IF v_total <= p_individual_threshold THEN
        RETURN QUERY
        SELECT
          v_min_date AS bucket_start, v_max_date AS bucket_end, 0::bigint AS bucket_size_seconds,
          CASE p_group_by
            WHEN 'dataset' THEN e.dataset_id::text
            WHEN 'catalog' THEN d.catalog_id::text
            ELSE COALESCE(e.transformed_data #>> string_to_array(p_group_by, '.'), '(empty)')
          END AS group_id,
          CASE p_group_by
            WHEN 'dataset' THEN d.name
            WHEN 'catalog' THEN (SELECT c.name FROM payload.catalogs c WHERE c.id = d.catalog_id)
            ELSE COALESCE(e.transformed_data #>> string_to_array(p_group_by, '.'), '(empty)')
          END AS group_name,
          1::bigint AS event_count,
          e.id::integer AS event_id,
          (COALESCE(NULLIF(e.transformed_data #>> string_to_array(d.interpretation_plan->'roles'->>'title', '.'), ''), NULLIF(e.transformed_data->>'title', ''), NULLIF(e.transformed_data->>'name', '')))::text AS event_title,
          e.event_timestamp AS event_timestamp_val
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE
            (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
            AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
            AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamptz)
            AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamptz)
            AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
            AND (p_filters->'bounds' IS NULL OR (
              e.geom IS NOT NULL AND ST_Intersects(e.geom, CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision THEN ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326) ELSE ST_Union(ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, 180.0, (p_filters->'bounds'->>'maxLat')::double precision, 4326), ST_MakeEnvelope(-180.0, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326)) END)
            ))
            AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
              SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
              WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
            ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
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
          v_min_date AS bucket_start, v_min_date AS bucket_end, 0::bigint AS bucket_size_seconds,
          CASE p_group_by
            WHEN 'dataset' THEN e.dataset_id::text
            WHEN 'catalog' THEN d.catalog_id::text
            ELSE COALESCE(e.transformed_data #>> string_to_array(p_group_by, '.'), '(empty)')
          END AS group_id,
          CASE p_group_by
            WHEN 'dataset' THEN d.name
            WHEN 'catalog' THEN (SELECT c.name FROM payload.catalogs c WHERE c.id = d.catalog_id)
            ELSE COALESCE(e.transformed_data #>> string_to_array(p_group_by, '.'), '(empty)')
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
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
            AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamptz)
            AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamptz)
            AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
            AND (p_filters->'bounds' IS NULL OR (
              e.geom IS NOT NULL AND ST_Intersects(e.geom, CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision THEN ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326) ELSE ST_Union(ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, 180.0, (p_filters->'bounds'->>'maxLat')::double precision, 4326), ST_MakeEnvelope(-180.0, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326)) END)
            ))
            AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
              SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
              WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
            ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
            AND (p_filters->'clusterCells' IS NULL OR (CASE (p_filters->>'h3Resolution')::int WHEN 2 THEN e.h3_r2 WHEN 3 THEN e.h3_r3 WHEN 4 THEN e.h3_r4 WHEN 5 THEN e.h3_r5 WHEN 6 THEN e.h3_r6 WHEN 7 THEN e.h3_r7 WHEN 8 THEN e.h3_r8 WHEN 9 THEN e.h3_r9 WHEN 10 THEN e.h3_r10 WHEN 11 THEN e.h3_r11 WHEN 12 THEN e.h3_r12 WHEN 13 THEN e.h3_r13 WHEN 14 THEN e.h3_r14 WHEN 15 THEN e.h3_r15 ELSE e.h3_r15 END)::text = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'clusterCells'))))
            AND e.event_timestamp IS NOT NULL
        GROUP BY group_id, group_name;
        RETURN;
      END IF;

      v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_target_buckets)::bigint);

      RETURN QUERY
      WITH
        filtered_events AS (
          SELECT
            e.id, e.event_timestamp,
            CASE p_group_by
              WHEN 'dataset' THEN e.dataset_id::text
              WHEN 'catalog' THEN d.catalog_id::text
              ELSE COALESCE(e.transformed_data #>> string_to_array(p_group_by, '.'), '(empty)')
            END AS grp_id,
            CASE p_group_by
              WHEN 'dataset' THEN d.name
              WHEN 'catalog' THEN (SELECT c.name FROM payload.catalogs c WHERE c.id = d.catalog_id)
              ELSE COALESCE(e.transformed_data #>> string_to_array(p_group_by, '.'), '(empty)')
            END AS grp_name
          FROM payload.events e
          JOIN payload.datasets d ON e.dataset_id = d.id
          WHERE
              (p_filters->>'catalogId' IS NULL OR d.catalog_id = (p_filters->>'catalogId')::int)
              AND (p_filters->'catalogIds' IS NULL OR d.catalog_id = ANY(SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int))
        AND (
          (COALESCE((p_filters->>'includePublic')::boolean, true) IS TRUE AND e.dataset_is_public = true)
          OR ((p_filters->>'ownerId') IS NOT NULL AND e.catalog_owner_id = (p_filters->>'ownerId')::int)
        )
              AND (p_filters->>'startDate' IS NULL OR e.event_timestamp >= (p_filters->>'startDate')::timestamptz)
              AND (p_filters->>'endDate' IS NULL OR e.event_timestamp <= (p_filters->>'endDate')::timestamptz)
              AND (p_filters->'datasets' IS NULL OR e.dataset_id = ANY(SELECT jsonb_array_elements_text(p_filters->'datasets')::int))
              AND (p_filters->'bounds' IS NULL OR (
                e.geom IS NOT NULL AND ST_Intersects(e.geom, CASE WHEN (p_filters->'bounds'->>'minLng')::double precision <= (p_filters->'bounds'->>'maxLng')::double precision THEN ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326) ELSE ST_Union(ST_MakeEnvelope((p_filters->'bounds'->>'minLng')::double precision, (p_filters->'bounds'->>'minLat')::double precision, 180.0, (p_filters->'bounds'->>'maxLat')::double precision, 4326), ST_MakeEnvelope(-180.0, (p_filters->'bounds'->>'minLat')::double precision, (p_filters->'bounds'->>'maxLng')::double precision, (p_filters->'bounds'->>'maxLat')::double precision, 4326)) END)
              ))
              AND (p_filters->'fieldFilters' IS NULL OR NOT EXISTS (
                SELECT 1 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                WHERE (CASE WHEN p_filters->'tagFields' ? ff.field_key THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(ff.field_values) AS fv(val) WHERE (e.transformed_data #> string_to_array(ff.field_key, '.')) @> jsonb_build_array(fv.val)) ELSE e.transformed_data #>> string_to_array(ff.field_key, '.') = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values))) END) IS NOT TRUE
              ))
          AND (p_filters->'rangeFilters' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_filters->'rangeFilters') AS rf(field_key, bounds) WHERE ((CASE WHEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(replace(e.transformed_data #>> string_to_array(rf.field_key, '.'), COALESCE(p_filters->'numberFormats'->rf.field_key->>'thousandsSeparator',''), ''), COALESCE(p_filters->'numberFormats'->rf.field_key->>'decimalSeparator','.'), '.')::numeric ELSE NULL END) BETWEEN COALESCE((rf.bounds->>'min')::numeric, '-Infinity'::numeric) AND COALESCE((rf.bounds->>'max')::numeric, 'Infinity'::numeric)) IS NOT TRUE))
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
    $function$`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const statement of DROP_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }

  await db.execute(sql.raw(CALCULATE_EVENT_HISTOGRAM));
  await db.execute(sql.raw(CLUSTER_EVENTS_TEMPORAL));
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only, like the rest of this chain. Rebuild from scratch (make db-reset) instead.
}
