import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DROP FUNCTION IF EXISTS calculate_event_histogram(text, jsonb);
  `);
  
  await db.execute(sql`
    CREATE FUNCTION calculate_event_histogram(
      p_interval text, -- 'hour', 'day', 'week', 'month', 'year'
      p_filters jsonb DEFAULT '{}'::jsonb
    ) RETURNS TABLE(
      bucket timestamp with time zone,
      event_count bigint
    ) AS $$
    BEGIN
      RETURN QUERY
      WITH filtered_events AS (
        SELECT 
          e.id,
          e.event_timestamp,
          e.dataset_id,
          d.catalog_id,
          e.location_longitude,
          e.location_latitude
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE 
          -- Apply filters
          (p_filters->>'catalogId' IS NULL OR 
           d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->>'startDate' IS NULL OR 
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR 
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          -- Support multiple datasets via JSON array
          AND (p_filters->'datasets' IS NULL OR 
               e.dataset_id = ANY(
                 SELECT jsonb_array_elements_text(p_filters->'datasets')::int
               ))
          -- Support single dataset for backward compatibility
          AND (p_filters->>'datasetId' IS NULL OR 
               e.dataset_id = (p_filters->>'datasetId')::int)
          -- Spatial bounds if provided
          AND (p_filters->'bounds' IS NULL OR (
            e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision 
              AND (p_filters->'bounds'->>'maxLng')::double precision
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision 
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))
      )
      -- Aggregate by time bucket only
      SELECT 
        date_trunc(p_interval, event_timestamp) as bucket,
        COUNT(*)::bigint as event_count
      FROM filtered_events
      WHERE event_timestamp IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION calculate_event_histogram(
      p_interval text, -- 'hour', 'day', 'week', 'month', 'year'
      p_filters jsonb DEFAULT '{}'::jsonb
    ) RETURNS TABLE(
      bucket timestamp,
      event_count bigint,
      dataset_counts jsonb,
      catalog_counts jsonb
    ) AS $$
    BEGIN
      RETURN QUERY
      WITH filtered_events AS (
        SELECT 
          e.id,
          e.event_timestamp,
          e.dataset_id,
          d.catalog_id,
          e.location_longitude,
          e.location_latitude
        FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE 
          -- Apply filters
          (p_filters->>'catalogId' IS NULL OR 
           d.catalog_id = (p_filters->>'catalogId')::int)
          AND (p_filters->>'startDate' IS NULL OR 
               e.event_timestamp >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR 
               e.event_timestamp <= (p_filters->>'endDate')::timestamp)
          -- Support multiple datasets via JSON array
          AND (p_filters->'datasets' IS NULL OR 
               e.dataset_id = ANY(
                 SELECT jsonb_array_elements_text(p_filters->'datasets')::int
               ))
          -- Support single dataset for backward compatibility
          AND (p_filters->>'datasetId' IS NULL OR 
               e.dataset_id = (p_filters->>'datasetId')::int)
          -- Spatial bounds if provided
          AND (p_filters->'bounds' IS NULL OR (
            e.location_longitude BETWEEN (p_filters->'bounds'->>'minLng')::double precision 
              AND (p_filters->'bounds'->>'maxLng')::double precision
            AND e.location_latitude BETWEEN (p_filters->'bounds'->>'minLat')::double precision 
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))
      ),
      -- First aggregate to get counts per dataset/catalog per bucket
      time_buckets AS (
        SELECT 
          date_trunc(p_interval, event_timestamp) as bucket,
          dataset_id,
          catalog_id,
          COUNT(*) as count
        FROM filtered_events
        WHERE event_timestamp IS NOT NULL
        GROUP BY bucket, dataset_id, catalog_id
      )
      -- Then aggregate into final result
      SELECT 
        tb.bucket,
        SUM(tb.count)::bigint as event_count,
        jsonb_object_agg(
          COALESCE(tb.dataset_id::text, 'unknown'), 
          SUM(tb.count)
        ) FILTER (WHERE tb.dataset_id IS NOT NULL) as dataset_counts,
        jsonb_object_agg(
          COALESCE(tb.catalog_id::text, 'unknown'), 
          SUM(tb.count)
        ) FILTER (WHERE tb.catalog_id IS NOT NULL) as catalog_counts
      FROM time_buckets tb
      GROUP BY tb.bucket
      ORDER BY tb.bucket;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
}