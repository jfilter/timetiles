-- Initialize PostGIS extension for spatial data support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create schema for Payload CMS (keeps tables organized)
CREATE SCHEMA IF NOT EXISTS payload;
