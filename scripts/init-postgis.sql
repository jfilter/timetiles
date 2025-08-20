-- Initialize PostGIS extensions and functions for production
-- This script runs after the main init-db.sql

-- Ensure PostGIS is properly initialized
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;

-- Create spatial indexes for better performance
DO $$
BEGIN
    -- Check if the events table exists and add spatial index
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'payload' AND table_name = 'events') THEN
        -- Create spatial index if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'payload' AND tablename = 'events' AND indexname = 'idx_events_location') THEN
            CREATE INDEX idx_events_location ON payload.events USING GIST (location);
        END IF;
        
        -- Create compound index for time-based queries
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'payload' AND tablename = 'events' AND indexname = 'idx_events_start_end_time') THEN
            CREATE INDEX idx_events_start_end_time ON payload.events (start_time, end_time);
        END IF;
        
        -- Create index for dataset relationships
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'payload' AND tablename = 'events' AND indexname = 'idx_events_dataset') THEN
            CREATE INDEX idx_events_dataset ON payload.events (dataset);
        END IF;
    END IF;
END $$;

-- Optimize PostgreSQL settings for spatial queries
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';

-- Create clustering function if not exists
CREATE OR REPLACE FUNCTION payload.cluster_events(
    zoom_level integer,
    west double precision,
    south double precision,
    east double precision,
    north double precision,
    filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    cluster_id text,
    cluster_count bigint,
    cluster_lat double precision,
    cluster_lng double precision,
    event_id text,
    event_title text
) AS $$
BEGIN
    -- Implementation would be here
    -- This is a placeholder for the actual clustering logic
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create histogram function if not exists
CREATE OR REPLACE FUNCTION payload.histogram_events(
    start_date timestamp,
    end_date timestamp,
    granularity text,
    filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    bucket_start timestamp,
    bucket_end timestamp,
    event_count bigint
) AS $$
BEGIN
    -- Implementation would be here
    -- This is a placeholder for the actual histogram logic
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA payload TO timetiles_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA payload TO timetiles_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA payload TO timetiles_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA payload TO timetiles_user;