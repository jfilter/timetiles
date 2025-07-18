# Server-Side Clustering & Histogram Optimization Plan

## Executive Summary

This plan outlines a pragmatic approach to implement server-side clustering and histogram calculations for TimeTiles, working within Payload CMS constraints. The goal is to efficiently handle 100,000+ events by moving computation from client to database.

## Key Constraints & Realities

### What We've Learned
1. **Payload owns the schema** - We cannot modify table structure via migrations
2. **Only btree indexes via collections** - Spatial indexes require custom migrations
3. **Field names are fixed** - Events use `location_latitude` and `location_longitude` in JSONB
4. **PostGIS is already enabled** - No need to add the extension
5. **Migrations are for functions only** - Not for schema changes

### What Already Exists
- PostGIS extension is enabled
- Events table with JSONB `data` field containing location info
- Basic btree indexes on common query fields
- Payload's query system for filtering

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js   │────▶│  API Endpoints   │────▶│   PostgreSQL    │
│   Frontend  │     │  (3 specialized) │     │   with PostGIS  │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │
                            ├── /api/events/map-clusters
                            ├── /api/events/histogram  
                            └── /api/events/list
```

## Implementation Plan

### Phase 1: Add Spatial Index (Day 1)

Create a migration to add GIST index on computed geometry:

```typescript
// migrations/[timestamp]_add_spatial_index_for_clustering.ts
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  // Create spatial index on computed point geometry
  await payload.db.drizzle.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_events_location_gist 
    ON events USING GIST (
      ST_MakePoint(
        (data->'location'->>'longitude')::float,
        (data->'location'->>'latitude')::float
      )
    ) WHERE 
      data->'location'->>'longitude' IS NOT NULL AND 
      data->'location'->>'latitude' IS NOT NULL;
  `);
}

export async function down({ payload }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
    DROP INDEX IF EXISTS idx_events_location_gist;
  `);
}
```

### Phase 2: Create Clustering Function (Day 1)

Simple, efficient clustering function that works with Payload's schema:

```typescript
// migrations/[timestamp]_add_clustering_function.ts
export async function up({ payload }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
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
      event_ids text[]
    ) AS $$
    DECLARE
      cluster_distance double precision;
    BEGIN
      -- Simple zoom-based clustering distance
      cluster_distance := CASE
        WHEN p_zoom >= 15 THEN 0.001    -- ~110m
        WHEN p_zoom >= 13 THEN 0.005    -- ~550m
        WHEN p_zoom >= 11 THEN 0.01     -- ~1.1km
        WHEN p_zoom >= 9 THEN 0.05      -- ~5.5km
        WHEN p_zoom >= 7 THEN 0.1       -- ~11km
        ELSE 0.5                         -- ~55km
      END;
      
      RETURN QUERY
      WITH filtered_events AS (
        SELECT 
          id,
          (data->'location'->>'longitude')::double precision as lng,
          (data->'location'->>'latitude')::double precision as lat,
          "datasetId",
          "catalogId",
          "eventTimestamp"
        FROM events
        WHERE 
          -- Spatial bounds filter
          (data->'location'->>'longitude')::double precision BETWEEN p_min_lng AND p_max_lng
          AND (data->'location'->>'latitude')::double precision BETWEEN p_min_lat AND p_max_lat
          -- Optional filters
          AND (p_filters->>'datasetId' IS NULL OR 
               "datasetId" = (p_filters->>'datasetId')::uuid)
          AND (p_filters->>'catalogId' IS NULL OR 
               "catalogId" = (p_filters->>'catalogId')::uuid)
          AND (p_filters->>'startDate' IS NULL OR 
               "eventTimestamp" >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR 
               "eventTimestamp" <= (p_filters->>'endDate')::timestamp)
      ),
      clustered AS (
        -- Group nearby points
        SELECT 
          round(lng / cluster_distance) * cluster_distance as cluster_lng,
          round(lat / cluster_distance) * cluster_distance as cluster_lat,
          array_agg(id::text) as ids
        FROM filtered_events
        GROUP BY cluster_lng, cluster_lat
      )
      SELECT 
        encode(sha256((cluster_lng::text || ',' || cluster_lat::text)::bytea), 'hex') as cluster_id,
        cluster_lng as longitude,
        cluster_lat as latitude,
        array_length(ids, 1) as event_count,
        ids as event_ids
      FROM clustered;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
}
```

### Phase 3: Create Histogram Function (Day 2)

Database function for time-based aggregations:

```typescript
// migrations/[timestamp]_add_histogram_function.ts
export async function up({ payload }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
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
          id,
          "eventTimestamp",
          "datasetId",
          "catalogId"
        FROM events
        WHERE 
          -- Apply filters
          (p_filters->>'datasetId' IS NULL OR 
           "datasetId" = (p_filters->>'datasetId')::uuid)
          AND (p_filters->>'catalogId' IS NULL OR 
               "catalogId" = (p_filters->>'catalogId')::uuid)
          AND (p_filters->>'startDate' IS NULL OR 
               "eventTimestamp" >= (p_filters->>'startDate')::timestamp)
          AND (p_filters->>'endDate' IS NULL OR 
               "eventTimestamp" <= (p_filters->>'endDate')::timestamp)
          -- Spatial bounds if provided
          AND (p_filters->'bounds' IS NULL OR (
            (data->'location'->>'longitude')::double precision 
              BETWEEN (p_filters->'bounds'->>'minLng')::double precision 
              AND (p_filters->'bounds'->>'maxLng')::double precision
            AND (data->'location'->>'latitude')::double precision 
              BETWEEN (p_filters->'bounds'->>'minLat')::double precision 
              AND (p_filters->'bounds'->>'maxLat')::double precision
          ))
      )
      SELECT 
        date_trunc(p_interval, "eventTimestamp") as bucket,
        COUNT(*)::bigint as event_count,
        jsonb_object_agg(
          COALESCE("datasetId"::text, 'unknown'), 
          dataset_count
        ) FILTER (WHERE "datasetId" IS NOT NULL) as dataset_counts,
        jsonb_object_agg(
          COALESCE("catalogId"::text, 'unknown'), 
          catalog_count
        ) FILTER (WHERE "catalogId" IS NOT NULL) as catalog_counts
      FROM (
        SELECT 
          "eventTimestamp",
          "datasetId",
          "catalogId",
          COUNT(*) OVER (PARTITION BY date_trunc(p_interval, "eventTimestamp"), "datasetId") as dataset_count,
          COUNT(*) OVER (PARTITION BY date_trunc(p_interval, "eventTimestamp"), "catalogId") as catalog_count
        FROM filtered_events
      ) aggregated
      GROUP BY bucket
      ORDER BY bucket;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);
}
```

### Phase 4: Implement API Endpoints (Days 2-3)

#### 4.1 Map Clustering Endpoint

```typescript
// app/api/events/map-clusters/route.ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Parse parameters
  const bounds = {
    minLng: parseFloat(searchParams.get('minLng') || '-180'),
    maxLng: parseFloat(searchParams.get('maxLng') || '180'),
    minLat: parseFloat(searchParams.get('minLat') || '-90'),
    maxLat: parseFloat(searchParams.get('maxLat') || '90'),
  }
  const zoom = parseInt(searchParams.get('zoom') || '10')
  
  // Build filters
  const filters: any = {}
  if (searchParams.get('datasetId')) filters.datasetId = searchParams.get('datasetId')
  if (searchParams.get('catalogId')) filters.catalogId = searchParams.get('catalogId')
  if (searchParams.get('startDate')) filters.startDate = searchParams.get('startDate')
  if (searchParams.get('endDate')) filters.endDate = searchParams.get('endDate')
  
  try {
    const payload = await getPayload({ config: configPromise })
    
    // Use caching for better performance
    const getClusters = unstable_cache(
      async () => {
        const result = await payload.db.drizzle.execute(sql`
          SELECT * FROM cluster_events(
            ${bounds.minLng}::double precision,
            ${bounds.minLat}::double precision,
            ${bounds.maxLng}::double precision,
            ${bounds.maxLat}::double precision,
            ${zoom}::integer,
            ${JSON.stringify(filters)}::jsonb
          )
        `)
        return result.rows
      },
      ['event-clusters', zoom.toString(), JSON.stringify(bounds), JSON.stringify(filters)],
      { revalidate: 300 } // 5 minutes
    )
    
    const clusters = await getClusters()
    
    // Format response
    const formattedClusters = clusters.map(cluster => ({
      id: cluster.cluster_id,
      position: {
        lat: cluster.latitude,
        lng: cluster.longitude,
      },
      count: cluster.event_count,
      // Only include event IDs for small clusters
      eventIds: cluster.event_count <= 10 ? cluster.event_ids : undefined,
    }))
    
    return NextResponse.json({
      clusters: formattedClusters,
      total: clusters.reduce((sum, c) => sum + c.event_count, 0),
    })
  } catch (error) {
    console.error('Clustering error:', error)
    return NextResponse.json(
      { error: 'Failed to cluster events' },
      { status: 500 }
    )
  }
}
```

#### 4.2 Histogram Endpoint

```typescript
// app/api/events/histogram/route.ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Build filters
  const filters: any = {}
  if (searchParams.get('datasetId')) filters.datasetId = searchParams.get('datasetId')
  if (searchParams.get('catalogId')) filters.catalogId = searchParams.get('catalogId')
  if (searchParams.get('startDate')) filters.startDate = searchParams.get('startDate')
  if (searchParams.get('endDate')) filters.endDate = searchParams.get('endDate')
  
  // Add spatial bounds if provided
  if (searchParams.get('minLng')) {
    filters.bounds = {
      minLng: parseFloat(searchParams.get('minLng')!),
      maxLng: parseFloat(searchParams.get('maxLng')!),
      minLat: parseFloat(searchParams.get('minLat')!),
      maxLat: parseFloat(searchParams.get('maxLat')!),
    }
  }
  
  try {
    const payload = await getPayload({ config: configPromise })
    
    // Determine interval based on date range
    const interval = await determineInterval(payload, filters)
    
    // Get histogram data with caching
    const getHistogram = unstable_cache(
      async () => {
        const result = await payload.db.drizzle.execute(sql`
          SELECT * FROM calculate_event_histogram(
            ${interval}::text,
            ${JSON.stringify(filters)}::jsonb
          )
        `)
        return result.rows
      },
      ['event-histogram', interval, JSON.stringify(filters)],
      { revalidate: 300 } // 5 minutes
    )
    
    const histogramData = await getHistogram()
    
    // Get dataset and catalog names for the response
    const [datasets, catalogs] = await Promise.all([
      payload.find({ collection: 'datasets', limit: 1000 }),
      payload.find({ collection: 'catalogs', limit: 1000 }),
    ])
    
    // Format response
    const buckets = histogramData.map(row => ({
      timestamp: row.bucket,
      count: parseInt(row.event_count),
      datasets: Object.entries(row.dataset_counts || {}).map(([id, count]) => ({
        id,
        name: datasets.docs.find(d => d.id === id)?.name || 'Unknown',
        count: count as number,
      })),
      catalogs: Object.entries(row.catalog_counts || {}).map(([id, count]) => ({
        id,
        name: catalogs.docs.find(c => c.id === id)?.name || 'Unknown',
        count: count as number,
      })),
    }))
    
    return NextResponse.json({
      buckets,
      interval,
      total: buckets.reduce((sum, b) => sum + b.count, 0),
    })
  } catch (error) {
    console.error('Histogram error:', error)
    return NextResponse.json(
      { error: 'Failed to generate histogram' },
      { status: 500 }
    )
  }
}

async function determineInterval(payload: any, filters: any): Promise<string> {
  // Get date range to determine appropriate interval
  const dateRangeQuery = await payload.db.drizzle.execute(sql`
    SELECT 
      MIN("eventTimestamp") as min_date,
      MAX("eventTimestamp") as max_date
    FROM events
    WHERE 
      ("eventTimestamp" >= ${filters.startDate || '1900-01-01'}::timestamp)
      AND ("eventTimestamp" <= ${filters.endDate || '2100-01-01'}::timestamp)
  `)
  
  const { min_date, max_date } = dateRangeQuery.rows[0]
  if (!min_date || !max_date) return 'day'
  
  const daysDiff = Math.floor(
    (new Date(max_date).getTime() - new Date(min_date).getTime()) / 
    (1000 * 60 * 60 * 24)
  )
  
  if (daysDiff <= 1) return 'hour'
  if (daysDiff <= 31) return 'day'
  if (daysDiff <= 180) return 'week'
  if (daysDiff <= 730) return 'month'
  return 'year'
}
```

#### 4.3 Keep Existing List Endpoint

The current `/api/events/list` endpoint using Payload's native querying is already optimized for paginated full data retrieval.

### Phase 5: Frontend Integration (Day 3)

Update components to use new endpoints:

```typescript
// components/MapExplorer.tsx - Update data fetching
const fetchClusters = async (bounds: MapBounds, zoom: number) => {
  const params = new URLSearchParams({
    minLng: bounds.west.toString(),
    maxLng: bounds.east.toString(),
    minLat: bounds.south.toString(),
    maxLat: bounds.north.toString(),
    zoom: zoom.toString(),
    ...buildFilterParams(filters),
  })
  
  const response = await fetch(`/api/events/map-clusters?${params}`)
  return response.json()
}

// components/ChartSection.tsx - Update histogram fetching
const fetchHistogram = async () => {
  const params = new URLSearchParams({
    ...buildFilterParams(filters),
    ...(mapBounds && {
      minLng: mapBounds.west.toString(),
      maxLng: mapBounds.east.toString(),
      minLat: mapBounds.south.toString(),
      maxLat: mapBounds.north.toString(),
    }),
  })
  
  const response = await fetch(`/api/events/histogram?${params}`)
  return response.json()
}
```

## Performance Optimizations

### 1. Index Strategy
- GIST index on computed geometry for spatial queries
- Existing btree indexes on filter fields (dataset, catalog, timestamp)
- Partial index excludes NULL locations

### 2. Caching Strategy
- Next.js `unstable_cache` with 5-minute TTL
- Cache keys include all filter parameters
- PostgreSQL query result caching for repeated queries

### 3. Query Optimization
- Use spatial bounds as primary filter (leverages GIST index)
- Simple grid-based clustering (no complex calculations)
- Single-pass aggregation for histograms

## Testing Strategy

### 1. Performance Testing
```bash
# Generate test data
cd apps/web && pnpm seed --count=100000

# Test clustering at different zoom levels
for zoom in 5 10 15; do
  curl "http://localhost:3000/api/events/map-clusters?zoom=$zoom"
done

# Test histogram with filters
curl "http://localhost:3000/api/events/histogram?startDate=2024-01-01"
```

### 2. Load Testing
- Use k6 or similar tool to simulate concurrent requests
- Monitor response times and database load
- Verify cache effectiveness

## Rollback Plan

If issues arise:
1. Frontend can fall back to existing `/api/events` endpoint
2. Remove new endpoints without affecting core functionality
3. Database functions can be dropped without schema impact

## Success Metrics

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Map load (100k events) | 10-15s | <500ms | Server clustering |
| Histogram generation | 5-10s | <300ms | DB aggregation |
| Data transfer (map) | ~200MB | <1MB | Send only clusters |
| Memory usage (client) | ~1GB | <100MB | No client aggregation |

## Future Enhancements

1. **WebSocket Support** - Real-time updates for live data
2. **Tile-based Clustering** - Use vector tiles for massive datasets
3. **Redis Caching** - Distributed cache for production scale
4. **Precomputed Aggregates** - Materialized views for common queries

## Conclusion

This plan provides a pragmatic, incremental approach to implementing server-side optimizations within Payload CMS constraints. By focusing on two key database functions and three specialized endpoints, we can achieve significant performance improvements without disrupting the existing system.