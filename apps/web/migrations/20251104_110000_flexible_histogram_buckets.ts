/**
 * Migration to replace the histogram function with flexible bucketing.
 *
 * This migration replaces the existing `calculate_event_histogram()` function with
 * a new implementation that allows users to specify a target bucket count range
 * (min/max) rather than fixed time intervals. The function dynamically calculates
 * the optimal bucket size to stay within the specified range.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Drop the old function first (with its specific signature)
  await db.execute(sql`
    DROP FUNCTION IF EXISTS calculate_event_histogram(text, jsonb);
  `);

  // Create the new flexible version
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

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rollback would need to restore the old function implementation
  // For now, we'll just drop the function since we're replacing it
  await db.execute(sql`
    DROP FUNCTION IF EXISTS calculate_event_histogram(jsonb, integer, integer, integer);
  `);
}
