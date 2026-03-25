/**
 * Refine cluster_events() zoom steps and adaptive scaling for better visual
 * differentiation. Adds 7 zoom bands (was 4) with larger grid cells at city
 * zoom (11-13), and steepens the adaptive scaling curve to consolidate dense
 * clusters more aggressively.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

// --- Shared helpers (same as previous migration) ---

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

/** Shared WHERE clause for both the COUNT query and the filtered_events CTE. */
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

// --- Refined adaptive cluster function (7 zoom bands, steeper scaling) ---

const buildRefinedClusterFunction = (dataColumn: string, fieldExpression: string, lngFilter: string) => `
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
    total_events integer;
    scale_factor double precision;
  BEGIN
    -- 7 zoom bands (was 4) for finer control at city/district level
    pixel_radius := CASE
      WHEN p_zoom <= 3 THEN 150.0   -- Continental
      WHEN p_zoom <= 5 THEN 120.0   -- Country
      WHEN p_zoom <= 7 THEN 90.0    -- Regional
      WHEN p_zoom <= 9 THEN 70.0    -- Metro area
      WHEN p_zoom <= 11 THEN 55.0   -- City level (was 40)
      WHEN p_zoom <= 13 THEN 45.0   -- District level (was 40)
      ELSE 35.0                      -- Street level
    END;

    -- Count filtered events in viewport for adaptive scaling
    SELECT COUNT(*) INTO total_events
    FROM payload.events e
    JOIN payload.datasets d ON e.dataset_id = d.id
    WHERE ${buildWhereClause(lngFilter, fieldExpression)};

    -- Steeper adaptive scaling: lower threshold (200), higher coefficient (0.4), cap at 4x
    IF total_events > 200 THEN
      scale_factor := LEAST(4.0, 1.0 + LN(total_events::double precision / 200.0) / LN(2.0) * 0.4);
    ELSE
      scale_factor := 1.0;
    END IF;
    pixel_radius := pixel_radius * scale_factor;

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
`;

// --- Previous adaptive function for down migration ---

const buildPreviousClusterFunction = (dataColumn: string, fieldExpression: string, lngFilter: string) => `
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
    total_events integer;
    scale_factor double precision;
  BEGIN
    pixel_radius := CASE
      WHEN p_zoom <= 5 THEN 120.0
      WHEN p_zoom <= 7 THEN 80.0
      WHEN p_zoom <= 10 THEN 60.0
      ELSE 40.0
    END;

    SELECT COUNT(*) INTO total_events
    FROM payload.events e
    JOIN payload.datasets d ON e.dataset_id = d.id
    WHERE ${buildWhereClause(lngFilter, fieldExpression)};

    IF total_events > 500 THEN
      scale_factor := LEAST(3.0, 1.0 + LN(total_events::double precision / 500.0) / LN(2.0) * 0.25);
    ELSE
      scale_factor := 1.0;
    END IF;
    pixel_radius := pixel_radius * scale_factor;

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
`;

const TRANSFORMED_FIELD_EXPRESSION = "e.transformed_data #>> string_to_array(ff.field_key, '.')";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const lngFilter = buildDirectLngFilter("e.location_longitude", "p_min_lng", "p_max_lng");

  await db.execute(
    sql`${sql.raw(buildRefinedClusterFunction("transformed_data", TRANSFORMED_FIELD_EXPRESSION, lngFilter))}`,
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const lngFilter = buildDirectLngFilter("e.location_longitude", "p_min_lng", "p_max_lng");

  await db.execute(
    sql`${sql.raw(buildPreviousClusterFunction("transformed_data", TRANSFORMED_FIELD_EXPRESSION, lngFilter))}`,
  );
}
