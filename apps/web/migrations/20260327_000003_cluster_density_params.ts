/**
 * Add configurable cluster density parameters to cluster_events().
 * Replaces hardcoded pixel_radius with two user-configurable parameters:
 * - p_base_radius: base pixel radius at zoom 8 (default 60, clamped 20-200)
 * - p_zoom_factor: how fast radius grows with zoom (default 1.4, clamped 1.0-1.8)
 *
 * Formula: pixel_radius = p_base_radius * p_zoom_factor ^ max(zoom - 8, 0)
 * No adaptive scaling — zoom alone determines spatial resolution.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

// --- Shared helpers ---

const buildFieldFilterClause = (fieldExpression: string) => `
          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   ${fieldExpression} = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))`;

const buildDirectLngFilter = (col: string, minVar: string, maxVar: string) => `
        AND (
          CASE WHEN ${minVar} <= ${maxVar}
            THEN ${col} BETWEEN ${minVar} AND ${maxVar}
            ELSE (${col} >= ${minVar} OR ${col} <= ${maxVar})
          END
        )`;

const buildWhereClause = (lngFilter: string, fieldExpression: string) => `
        e.location_longitude IS NOT NULL
        AND e.location_latitude IS NOT NULL
        ${lngFilter}
        AND e.location_latitude BETWEEN p_min_lat AND p_max_lat
        AND (
             (p_filters->>'datasetId' IS NULL AND p_filters->'datasets' IS NULL)
             OR (p_filters->>'datasetId' IS NOT NULL AND
                 e.dataset_id = (p_filters->>'datasetId')::int)
             OR (p_filters->'datasets' IS NOT NULL AND
                 e.dataset_id = ANY(
                   ARRAY(SELECT jsonb_array_elements_text(p_filters->'datasets'))::int[]
                 ))
        )
        AND (p_filters->>'catalogId' IS NULL OR
             d.catalog_id = (p_filters->>'catalogId')::int)
        AND (p_filters->'catalogIds' IS NULL OR
             d.catalog_id = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filters->'catalogIds'))::int[]))
        AND (p_filters->>'startDate' IS NULL OR
             e.event_timestamp >= (p_filters->>'startDate')::timestamp)
        AND (p_filters->>'endDate' IS NULL OR
             e.event_timestamp <= (p_filters->>'endDate')::timestamp)
${buildFieldFilterClause(fieldExpression)}`;

const DROP_FUNCTION_8ARGS = `DROP FUNCTION IF EXISTS cluster_events(double precision, double precision, double precision, double precision, integer, jsonb, double precision, double precision)`;
const DROP_FUNCTION_6ARGS = `DROP FUNCTION IF EXISTS cluster_events(double precision, double precision, double precision, double precision, integer, jsonb)`;

// --- New function with density parameters ---

const buildParameterizedClusterFunction = (dataColumn: string, fieldExpression: string, lngFilter: string) => `
  CREATE FUNCTION cluster_events(
    p_min_lng double precision,
    p_min_lat double precision,
    p_max_lng double precision,
    p_max_lat double precision,
    p_zoom integer,
    p_filters jsonb DEFAULT '{}'::jsonb,
    p_base_radius double precision DEFAULT 60.0,
    p_zoom_factor double precision DEFAULT 1.4
  ) RETURNS TABLE(
    cluster_id text,
    longitude double precision,
    latitude double precision,
    event_count integer,
    event_ids text[],
    event_id text,
    event_title text,
    extent_degrees double precision
  ) AS $$
  DECLARE
    safe_base double precision;
    safe_factor double precision;
    pixel_radius double precision;
    tile_size constant double precision := 512.0;
    world_size_pixels double precision;
    cluster_radius_degrees double precision;
  BEGIN
    -- Clamp inputs to safe ranges
    safe_base := LEAST(200.0, GREATEST(20.0, p_base_radius));
    safe_factor := LEAST(1.8, GREATEST(1.0, p_zoom_factor));

    -- Scale pixel radius with zoom: base * factor ^ max(zoom - 8, 0)
    pixel_radius := safe_base * POW(safe_factor, GREATEST(p_zoom - 8, 0));

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
        e.${dataColumn}->>'title' as title
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${buildWhereClause(lngFilter, fieldExpression)}
    ),
    grid_clustered AS (
      SELECT
        (ROUND(lng / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lng,
        (ROUND(lat / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lat,
        AVG(lng)::double precision as cluster_lng,
        AVG(lat)::double precision as cluster_lat,
        array_agg(id::text) as ids,
        array_agg(title) as titles,
        COUNT(*) as count,
        GREATEST(
          (MAX(lng) - MIN(lng)) / 2.0,
          (MAX(lat) - MIN(lat)) / 2.0
        )::double precision as extent_deg
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
      CASE WHEN count = 1 THEN titles[1] ELSE null END as event_title,
      CASE WHEN count > 1 THEN extent_deg ELSE 0.0 END as extent_degrees
    FROM grid_clustered;
  END;
  $$ LANGUAGE plpgsql STABLE;
`;

// --- Previous function without density params (for down migration) ---

const buildPreviousClusterFunction = (dataColumn: string, fieldExpression: string, lngFilter: string) => `
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
    event_title text,
    extent_degrees double precision
  ) AS $$
  DECLARE
    pixel_radius double precision;
    tile_size constant double precision := 512.0;
    world_size_pixels double precision;
    cluster_radius_degrees double precision;
  BEGIN
    pixel_radius := CASE
      WHEN p_zoom <= 3 THEN 100.0
      WHEN p_zoom <= 5 THEN 80.0
      WHEN p_zoom <= 7 THEN 60.0
      WHEN p_zoom <= 9 THEN 50.0
      WHEN p_zoom <= 11 THEN 50.0
      WHEN p_zoom <= 13 THEN 50.0
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
        e.${dataColumn}->>'title' as title
      FROM payload.events e
      JOIN payload.datasets d ON e.dataset_id = d.id
      WHERE ${buildWhereClause(lngFilter, fieldExpression)}
    ),
    grid_clustered AS (
      SELECT
        (ROUND(lng / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lng,
        (ROUND(lat / cluster_radius_degrees) * cluster_radius_degrees)::double precision as grid_lat,
        AVG(lng)::double precision as cluster_lng,
        AVG(lat)::double precision as cluster_lat,
        array_agg(id::text) as ids,
        array_agg(title) as titles,
        COUNT(*) as count,
        GREATEST(
          (MAX(lng) - MIN(lng)) / 2.0,
          (MAX(lat) - MIN(lat)) / 2.0
        )::double precision as extent_deg
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
      CASE WHEN count = 1 THEN titles[1] ELSE null END as event_title,
      CASE WHEN count > 1 THEN extent_deg ELSE 0.0 END as extent_degrees
    FROM grid_clustered;
  END;
  $$ LANGUAGE plpgsql STABLE;
`;

const TRANSFORMED_FIELD_EXPRESSION = "e.transformed_data #>> string_to_array(ff.field_key, '.')";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const lngFilter = buildDirectLngFilter("e.location_longitude", "p_min_lng", "p_max_lng");

  // Drop old 6-arg version, create new 8-arg version
  await db.execute(sql`${sql.raw(DROP_FUNCTION_6ARGS)}`);
  await db.execute(
    sql`${sql.raw(buildParameterizedClusterFunction("transformed_data", TRANSFORMED_FIELD_EXPRESSION, lngFilter))}`,
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const lngFilter = buildDirectLngFilter("e.location_longitude", "p_min_lng", "p_max_lng");

  // Drop new 8-arg version, restore old 6-arg version
  await db.execute(sql`${sql.raw(DROP_FUNCTION_8ARGS)}`);
  await db.execute(
    sql`${sql.raw(buildPreviousClusterFunction("transformed_data", TRANSFORMED_FIELD_EXPRESSION, lngFilter))}`,
  );
}
