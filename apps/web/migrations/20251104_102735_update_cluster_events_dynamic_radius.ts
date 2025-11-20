import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Replace cluster_events function with dynamic radius clustering
  // This version uses zoom-dependent pixel radius for optimal clustering at all zoom levels
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
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Restore fixed 40px radius clustering
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
      -- Fixed pixel radius (consistent with previous version)
      pixel_radius constant double precision := 40.0;
      tile_size constant double precision := 512.0;
      world_size_pixels double precision;
      cluster_radius_degrees double precision;
    BEGIN
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
}
