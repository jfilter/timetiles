-- Initialize PostGIS extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create schema for Payload CMS to avoid conflicts with PostGIS
CREATE SCHEMA IF NOT EXISTS payload;

-- Create a test spatial reference system if needed
-- SRID 4326 is already included in PostGIS by default (WGS84)

-- Verify PostGIS installation
SELECT PostGIS_Version();
