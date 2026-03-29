-- Initialize PostGIS extension for spatial data support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Initialize H3 extension for hexagonal hierarchical clustering
CREATE EXTENSION IF NOT EXISTS h3;

-- Create schema for Payload CMS (keeps tables organized)
CREATE SCHEMA IF NOT EXISTS payload;
