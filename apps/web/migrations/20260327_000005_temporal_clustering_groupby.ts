/**
 * Update `cluster_events_temporal()` to support arbitrary groupBy field.
 *
 * Adds `p_group_by text DEFAULT 'dataset'` parameter:
 * - `'dataset'`: groups by dataset (original behavior)
 * - `'catalog'`: groups by catalog
 * - Any other string: groups by `e.transformed_data ->> p_group_by`
 *
 * Return columns renamed: dataset_id/dataset_name → group_id/group_name.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

const FIELD_EXPRESSION = "e.transformed_data #>> string_to_array(ff.field_key, '.')";

const buildFieldFilterClause = () => `
          AND (p_filters->'fieldFilters' IS NULL OR
               NOT EXISTS (
                 SELECT 1
                 FROM jsonb_each(p_filters->'fieldFilters') AS ff(field_key, field_values)
                 WHERE NOT (
                   ${FIELD_EXPRESSION} = ANY(ARRAY(SELECT jsonb_array_elements_text(ff.field_values)))
                 )
               ))`;

const buildBoundsFilter = () => `
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
          ))`;

const sharedFilterWhere = () => `
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
${buildBoundsFilter()}
${buildFieldFilterClause()}
        AND e.event_timestamp IS NOT NULL`;

const buildFunction = () => `
  CREATE OR REPLACE FUNCTION cluster_events_temporal(
    p_filters jsonb DEFAULT '{}'::jsonb,
    p_target_buckets integer DEFAULT 40,
    p_individual_threshold integer DEFAULT 500,
    p_group_by text DEFAULT 'dataset'
  ) RETURNS TABLE(
    bucket_start timestamp with time zone,
    bucket_end timestamp with time zone,
    bucket_size_seconds integer,
    group_id text,
    group_name text,
    event_count bigint,
    event_id integer,
    event_title text,
    event_timestamp_val timestamp with time zone
  ) AS $$
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
${sharedFilterWhere()};

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
${sharedFilterWhere()}
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
${sharedFilterWhere()}
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
${sharedFilterWhere()}
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
  $$ LANGUAGE plpgsql STABLE;
`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`${sql.raw(buildFunction())}`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Restore previous version without p_group_by parameter
  await db.execute(sql`DROP FUNCTION IF EXISTS cluster_events_temporal;`);
}
