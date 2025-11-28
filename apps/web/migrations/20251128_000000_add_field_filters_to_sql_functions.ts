/**
 * Migration to add field filter support to PostgreSQL functions.
 *
 * This migration updates the `calculate_event_histogram()` and `cluster_events()`
 * functions to support filtering by arbitrary event data fields (categorical filters).
 *
 * Field filters are passed as a JSONB object like:
 * {
 *   "fieldFilters": {
 *     "category": ["Music", "Sports"],
 *     "status": ["Active"]
 *   }
 * }
 *
 * The filter logic is:
 * - Multiple values in one field = OR (any match is fine)
 * - Multiple fields = AND (all must match)
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Update cluster_events function with field filter support
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION cluster_events(
      p_min_lng double precision,
      p_min_lat double precision,
      p_max_lng double precision,
      p_max_lat double precision,
      p_zoom integer,
      p_filters jsonb DEFAULT '{}'::jsonb
    ) RETURNS TABLE(
      cluster_id text,
      longitude double precision,
      latitude double precision,
      event_count integer,
      event_ids text[],
      event_id text,
      event_title text
    ) AS $$
    DECLARE
      -- Dynamic pixel radius based on zoom level
      -- Lower zoom = larger radius for more aggressive clustering
      pixel_radius double precision;
      -- Tile size in pixels (Web Mercator standard)
      tile_size constant double precision := 512.0;
      -- World size at this zoom level in pixels
      world_size_pixels double precision;
      -- Cluster radius in degrees
      cluster_radius_degrees double precision;
    BEGIN
      -- Dynamic pixel radius based on zoom level
      -- Lower zoom = larger radius for more aggressive clustering
      pixel_radius := CASE
        WHEN p_zoom <= 5 THEN 120.0   -- Very aggressive clustering
        WHEN p_zoom <= 7 THEN 80.0    -- Moderate clustering
        WHEN p_zoom <= 10 THEN 60.0   -- Standard clustering
        ELSE 40.0                      -- Fine-grained clustering at high zoom
      END;

      -- Calculate world size in pixels at this zoom level
      world_size_pixels := tile_size * POW(2, p_zoom);

      -- Convert pixel radius to degrees
      cluster_radius_degrees := (pixel_radius / world_size_pixels) * 360.0;

      RETURN QUERY
      WITH filtered_events AS (
        SELECT
          e.id,
          e.location_longitude as lng,
          e.location_latitude as lat,
          e.dataset_id,
          d.catalog_id,
          e.event_timestamp,
          e.data->>'title' as title
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE
          -- Spatial bounds filter
          e.location_longitude BETWEEN p_min_lng AND p_max_lng
          AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
          -- Ensure we have valid coordinates
          AND e.location_longitude IS NOT NULL
          AND e.location_latitude IS NOT NULL
          -- Optional filters
          AND (p_filters->>'datasetId' IS NULL OR
               e.dataset_id = (p_filters->>'datasetId')::int)
          AND (p_filters->>'catalogId' IS NULL OR
               d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR
               d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
          AND (p_filters->>'startDate' IS NULL OR
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          -- Field filters: for each field, event data must match one of the values
          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   e.data->>ff.field_key = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))
      ),
      grid_clustered AS (
        -- Round coordinates to grid cells based on cluster radius
        SELECT
          -- Use ROUND to create grid cells, cast to double precision
          (ROUND(lng / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lng,
          (ROUND(lat / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lat,
          -- Calculate actual centroid for smooth positioning (not grid center)
          AVG(lng)::double precision as cluster_lng,
          AVG(lat)::double precision as cluster_lat,
          array_agg(id::text) as ids,
          array_agg(title) as titles,
          COUNT(*) as count
        FROM filtered_events
        GROUP BY grid_lng, grid_lat
      )
      SELECT
        -- Generate deterministic cluster ID based on grid position and zoom
        encode(sha256((p_zoom::text || '@' || grid_lng::text || ',' || grid_lat::text)::bytea), 'hex') as cluster_id,
        cluster_lng::double precision as longitude,
        cluster_lat::double precision as latitude,
        count::integer as event_count,
        ids as event_ids,
        -- For single events, return the event ID and title
        CASE WHEN count = 1 THEN ids[1] ELSE null END as event_id,
        CASE WHEN count = 1 THEN titles[1] ELSE null END as event_title
      FROM grid_clustered;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // Update calculate_event_histogram function with field filter support
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION calculate_event_histogram(
      p_filters jsonb DEFAULT '{}'::jsonb,
      p_target_buckets integer DEFAULT 30,
      p_min_buckets integer DEFAULT 20,
      p_max_buckets integer DEFAULT 50
    ) RETURNS TABLE(
      bucket_start timestamp with time zone,
      bucket_end timestamp with time zone,
      bucket_size_seconds integer,
      event_count bigint
    ) AS $$
    DECLARE
      v_min_date timestamp with time zone;
      v_max_date timestamp with time zone;
      v_range_seconds numeric;
      v_bucket_size_seconds integer;
      v_resulting_buckets integer;
    BEGIN
      -- Step 1: Get actual date range from filtered data
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
          AND (p_filters->>'startDate' IS NULL OR
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          AND (p_filters->'datasets' IS NULL OR
               e.dataset_id = ANY(
                 SELECT jsonb_array_elements_text(p_filters->'datasets')::int
               ))
          AND (p_filters->'bounds' IS NULL OR (
            e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
              AND (p_filters->'bounds'->>'maxLng')::double precision
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))
          -- Field filters: for each field, event data must match one of the values
          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   e.data->>ff.field_key = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))
          AND e.event_timestamp IS NOT NULL
      )
      SELECT
        MIN(event_timestamp),
        MAX(event_timestamp)
      INTO v_min_date, v_max_date
      FROM filtered_events;

      -- Handle edge cases
      IF v_min_date IS NULL OR v_max_date IS NULL THEN
        RETURN; -- No data
      END IF;

      IF v_min_date = v_max_date THEN
        -- All events at same timestamp - return single bucket
        RETURN QUERY
        WITH filtered AS (
          SELECT e.id
          FROM payload.events e
          JOIN payload.datasets d ON e.dataset_id = d.id
          WHERE e.event_timestamp = v_min_date
            AND (p_filters->>'catalogId' IS NULL OR
                 d.catalog_id = (p_filters->>'catalogId')::int)
            AND (p_filters->'catalogIds' IS NULL OR
                 d.catalog_id = ANY(
                   SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
                 ))
            AND (p_filters->'datasets' IS NULL OR
                 e.dataset_id = ANY(
                   SELECT jsonb_array_elements_text(p_filters->'datasets')::int
                 ))
            -- Field filters
            AND (p_filters->'fieldFilters' IS NULL OR
                 NOT EXISTS (
                   SELECT 1
                   FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                   WHERE NOT (
                     e.data->>ff.field_key = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                   )
                 ))
        )
        SELECT
          v_min_date,
          v_min_date,
          0,
          COUNT(*)::bigint
        FROM filtered;
        RETURN;
      END IF;

      -- Step 2: Calculate optimal bucket size
      v_range_seconds := EXTRACT(EPOCH FROM (v_max_date - v_min_date));

      -- Calculate bucket size to hit target
      v_bucket_size_seconds := GREATEST(
        1, -- At least 1 second
        FLOOR(v_range_seconds / p_target_buckets)::integer
      );

      -- Calculate resulting bucket count with this size
      v_resulting_buckets := CEIL(v_range_seconds / v_bucket_size_seconds)::integer;

      -- Adjust if this would create too many buckets
      IF v_resulting_buckets > p_max_buckets THEN
        v_bucket_size_seconds := CEIL(v_range_seconds / p_max_buckets)::integer;
        v_resulting_buckets := CEIL(v_range_seconds / v_bucket_size_seconds)::integer;
      END IF;

      -- Adjust if this would create too few buckets
      IF v_resulting_buckets < p_min_buckets THEN
        v_bucket_size_seconds := FLOOR(v_range_seconds / p_min_buckets)::integer;
        -- But don't go below 1 second
        v_bucket_size_seconds := GREATEST(1, v_bucket_size_seconds);
      END IF;

      -- Step 3: Generate buckets and aggregate
      RETURN QUERY
      WITH
        filtered_events AS (
          SELECT
            e.id,
            e.event_timestamp
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
              e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
                AND (p_filters->'bounds'->>'maxLat')::double precision
            ))
            -- Field filters
            AND (p_filters->'fieldFilters' IS NULL OR
                 NOT EXISTS (
                   SELECT 1
                   FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                   WHERE NOT (
                     e.data->>ff.field_key = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                   )
                 ))
            AND e.event_timestamp IS NOT NULL
        ),
        bucket_series AS (
          SELECT
            generate_series(
              v_min_date,
              v_max_date,
              (v_bucket_size_seconds || ' seconds')::interval
            ) as bs_start
        ),
        buckets AS (
          SELECT
            bs_start as bucket_start,
            bs_start + (v_bucket_size_seconds || ' seconds')::interval as bucket_end
          FROM bucket_series
        )
      SELECT
        buckets.bucket_start,
        buckets.bucket_end,
        v_bucket_size_seconds,
        COUNT(e.id)::bigint
      FROM buckets
      LEFT JOIN filtered_events e
        ON e.event_timestamp >= buckets.bucket_start
        AND e.event_timestamp < buckets.bucket_end
      GROUP BY buckets.bucket_start, buckets.bucket_end
      ORDER BY buckets.bucket_start;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Restore original cluster_events function without field filters
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION cluster_events(
      p_min_lng double precision,
      p_min_lat double precision,
      p_max_lng double precision,
      p_max_lat double precision,
      p_zoom integer,
      p_filters jsonb DEFAULT '{}'::jsonb
    ) RETURNS TABLE(
      cluster_id text,
      longitude double precision,
      latitude double precision,
      event_count integer,
      event_ids text[],
      event_id text,
      event_title text
    ) AS $$
    DECLARE
      pixel_radius double precision;
      tile_size constant double precision := 512.0;
      world_size_pixels double precision;
      cluster_radius_degrees double precision;
    BEGIN
      pixel_radius := CASE
        WHEN p_zoom <= 5 THEN 120.0
        WHEN p_zoom <= 7 THEN 80.0
        WHEN p_zoom <= 10 THEN 60.0
        ELSE 40.0
      END;

      world_size_pixels := tile_size * POW(2, p_zoom);
      cluster_radius_degrees := (pixel_radius / world_size_pixels) * 360.0;

      RETURN QUERY
      WITH filtered_events AS (
        SELECT
          e.id,
          e.location_longitude as lng,
          e.location_latitude as lat,
          e.dataset_id,
          d.catalog_id,
          e.event_timestamp,
          e.data->>'title' as title
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE
          e.location_longitude BETWEEN p_min_lng AND p_max_lng
          AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
          AND e.location_longitude IS NOT NULL
          AND e.location_latitude IS NOT NULL
          AND (p_filters->>'datasetId' IS NULL OR
               e.dataset_id = (p_filters->>'datasetId')::int)
          AND (p_filters->>'catalogId' IS NULL OR
               d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->'catalogIds' IS NULL OR
               d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
          AND (p_filters->>'startDate' IS NULL OR
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
      ),
      grid_clustered AS (
        SELECT
          (ROUND(lng / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lng,
          (ROUND(lat / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lat,
          AVG(lng)::double precision as cluster_lng,
          AVG(lat)::double precision as cluster_lat,
          array_agg(id::text) as ids,
          array_agg(title) as titles,
          COUNT(*) as count
        FROM filtered_events
        GROUP BY grid_lng, grid_lat
      )
      SELECT
        encode(sha256((p_zoom::text || '@' || grid_lng::text || ',' || grid_lat::text)::bytea), 'hex') as cluster_id,
        cluster_lng::double precision as longitude,
        cluster_lat::double precision as latitude,
        count::integer as event_count,
        ids as event_ids,
        CASE WHEN count = 1 THEN ids[1] ELSE null END as event_id,
        CASE WHEN count = 1 THEN titles[1] ELSE null END as event_title
      FROM grid_clustered;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // Restore original calculate_event_histogram function without field filters
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION calculate_event_histogram(
      p_filters jsonb DEFAULT '{}'::jsonb,
      p_target_buckets integer DEFAULT 30,
      p_min_buckets integer DEFAULT 20,
      p_max_buckets integer DEFAULT 50
    ) RETURNS TABLE(
      bucket_start timestamp with time zone,
      bucket_end timestamp with time zone,
      bucket_size_seconds integer,
      event_count bigint
    ) AS $$
    DECLARE
      v_min_date timestamp with time zone;
      v_max_date timestamp with time zone;
      v_range_seconds numeric;
      v_bucket_size_seconds integer;
      v_resulting_buckets integer;
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
          AND (p_filters->>'startDate' IS NULL OR
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          AND (p_filters->'datasets' IS NULL OR
               e.dataset_id = ANY(
                 SELECT jsonb_array_elements_text(p_filters->'datasets')::int
               ))
          AND (p_filters->'bounds' IS NULL OR (
            e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
              AND (p_filters->'bounds'->>'maxLng')::double precision
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))
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
            AND (p_filters->>'catalogId' IS NULL OR
                 d.catalog_id = (p_filters->>'catalogId')::int)
            AND (p_filters->'catalogIds' IS NULL OR
                 d.catalog_id = ANY(
                   SELECT jsonb_array_elements_text(p_filters->'catalogIds')::int
                 ))
            AND (p_filters->'datasets' IS NULL OR
                 e.dataset_id = ANY(
                   SELECT jsonb_array_elements_text(p_filters->'datasets')::int
                 ))
        )
        SELECT
          v_min_date,
          v_min_date,
          0,
          COUNT(*)::bigint
        FROM filtered;
        RETURN;
      END IF;

      v_range_seconds := EXTRACT(EPOCH FROM (v_max_date - v_min_date));
      v_bucket_size_seconds := GREATEST(1, FLOOR(v_range_seconds / p_target_buckets)::integer);
      v_resulting_buckets := CEIL(v_range_seconds / v_bucket_size_seconds)::integer;

      IF v_resulting_buckets > p_max_buckets THEN
        v_bucket_size_seconds := CEIL(v_range_seconds / p_max_buckets)::integer;
        v_resulting_buckets := CEIL(v_range_seconds / v_bucket_size_seconds)::integer;
      END IF;

      IF v_resulting_buckets < p_min_buckets THEN
        v_bucket_size_seconds := FLOOR(v_range_seconds / p_min_buckets)::integer;
        v_bucket_size_seconds := GREATEST(1, v_bucket_size_seconds);
      END IF;

      RETURN QUERY
      WITH
        filtered_events AS (
          SELECT
            e.id,
            e.event_timestamp
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
              e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision
                AND (p_filters->'bounds'->>'maxLng')::double precision
              AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision
                AND (p_filters->'bounds'->>'maxLat')::double precision
            ))
            AND e.event_timestamp IS NOT NULL
        ),
        bucket_series AS (
          SELECT
            generate_series(
              v_min_date,
              v_max_date,
              (v_bucket_size_seconds || ' seconds')::interval
            ) as bs_start
        ),
        buckets AS (
          SELECT
            bs_start as bucket_start,
            bs_start + (v_bucket_size_seconds || ' seconds')::interval as bucket_end
          FROM bucket_series
        )
      SELECT
        buckets.bucket_start,
        buckets.bucket_end,
        v_bucket_size_seconds,
        COUNT(e.id)::bigint
      FROM buckets
      LEFT JOIN filtered_events e
        ON e.event_timestamp >= buckets.bucket_start
        AND e.event_timestamp < buckets.bucket_end
      GROUP BY buckets.bucket_start, buckets.bucket_end
      ORDER BY buckets.bucket_start;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
}
