import {
  type MigrateUpArgs,
  type MigrateDownArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // FORCE drop any existing function with this name
  await db.execute(sql`
    DROP FUNCTION IF EXISTS calculate_event_histogram(text, jsonb) CASCADE;
  `);

  // Recreate with the correct definition (no nested aggregates)
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
      -- Aggregate by time bucket only (NO NESTED AGGREGATES!)
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
    DROP FUNCTION IF EXISTS calculate_event_histogram(text, jsonb);
  `);
}
