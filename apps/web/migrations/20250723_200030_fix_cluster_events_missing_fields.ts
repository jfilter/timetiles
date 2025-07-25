import { type MigrateUpArgs, type MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export const up = async ({ db }: MigrateUpArgs): Promise<void> => {
  // Drop existing function first since we're changing the return type
  await db.execute(sql`
    DROP FUNCTION IF EXISTS cluster_events(
      double precision, 
      double precision, 
      double precision, 
      double precision, 
      integer, 
      jsonb
    );
  `);

  await db.execute(sql`
    CREATE FUNCTION cluster_events(
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
      cluster_distance double precision;
    BEGIN
      -- Updated zoom-based clustering distance with finer granularity
      cluster_distance := CASE
        WHEN p_zoom >= 16 THEN 0.0005   -- ~55m
        WHEN p_zoom >= 15 THEN 0.001    -- ~110m
        WHEN p_zoom >= 14 THEN 0.002    -- ~220m
        WHEN p_zoom >= 13 THEN 0.005    -- ~550m
        WHEN p_zoom >= 12 THEN 0.008    -- ~880m
        WHEN p_zoom >= 11 THEN 0.01     -- ~1.1km
        WHEN p_zoom >= 10 THEN 0.02     -- ~2.2km
        WHEN p_zoom >= 9 THEN 0.05      -- ~5.5km
        WHEN p_zoom >= 8 THEN 0.08      -- ~8.8km
        WHEN p_zoom >= 7 THEN 0.1       -- ~11km
        WHEN p_zoom >= 6 THEN 0.2       -- ~22km
        ELSE 0.5                         -- ~55km
      END;
      
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
          AND (p_filters->>'startDate' IS NULL OR 
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR 
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
      ),
      clustered AS (
        -- Group nearby points using grid-based clustering
        SELECT 
          round(lng / cluster_distance) * cluster_distance as cluster_lng,
          round(lat / cluster_distance) * cluster_distance as cluster_lat,
          array_agg(id::text) as ids,
          array_agg(title) as titles,
          COUNT(*) as count
        FROM filtered_events
        GROUP BY cluster_lng, cluster_lat
      )
      SELECT 
        -- Generate a deterministic cluster ID based on position
        encode(sha256((cluster_lng::text || ',' || cluster_lat::text)::bytea), 'hex') as cluster_id,
        cluster_lng as longitude,
        cluster_lat as latitude,
        count::integer as event_count,
        ids as event_ids,
        -- For single events, return the event ID and title
        CASE WHEN count = 1 THEN ids[1] ELSE null END as event_id,
        CASE WHEN count = 1 THEN titles[1] ELSE null END as event_title
      FROM clustered;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
};

export const down = async ({ db }: MigrateDownArgs): Promise<void> => {
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
      event_ids text[]
    ) AS $$
    DECLARE
      cluster_distance double precision;
    BEGIN
      -- Updated zoom-based clustering distance with finer granularity
      cluster_distance := CASE
        WHEN p_zoom >= 16 THEN 0.0005   -- ~55m
        WHEN p_zoom >= 15 THEN 0.001    -- ~110m
        WHEN p_zoom >= 14 THEN 0.002    -- ~220m
        WHEN p_zoom >= 13 THEN 0.005    -- ~550m
        WHEN p_zoom >= 12 THEN 0.008    -- ~880m
        WHEN p_zoom >= 11 THEN 0.01     -- ~1.1km
        WHEN p_zoom >= 10 THEN 0.02     -- ~2.2km
        WHEN p_zoom >= 9 THEN 0.05      -- ~5.5km
        WHEN p_zoom >= 8 THEN 0.08      -- ~8.8km
        WHEN p_zoom >= 7 THEN 0.1       -- ~11km
        WHEN p_zoom >= 6 THEN 0.2       -- ~22km
        ELSE 0.5                         -- ~55km
      END;
      
      RETURN QUERY
      WITH filtered_events AS (
        SELECT 
          e.id,
          e.location_longitude as lng,
          e.location_latitude as lat,
          e.dataset_id,
          d.catalog_id,
          e.event_timestamp
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
          AND (p_filters->>'startDate' IS NULL OR 
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR 
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
      ),
      clustered AS (
        -- Group nearby points using grid-based clustering
        SELECT 
          round(lng / cluster_distance) * cluster_distance as cluster_lng,
          round(lat / cluster_distance) * cluster_distance as cluster_lat,
          array_agg(id::text) as ids
        FROM filtered_events
        GROUP BY cluster_lng, cluster_lat
      )
      SELECT 
        -- Generate a deterministic cluster ID based on position
        encode(sha256((cluster_lng::text || ',' || cluster_lat::text)::bytea), 'hex') as cluster_id,
        cluster_lng as longitude,
        cluster_lat as latitude,
        array_length(ids, 1) as event_count,
        ids as event_ids
      FROM clustered;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
};
