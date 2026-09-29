/**
 * Integration tests for advanced map clustering features.
 *
 * Tests complex clustering scenarios including boundary conditions,
 * performance with large datasets, and cluster aggregation.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import { NextRequest } from "next/server";
import type { Payload } from "payload";

import { GET } from "../../../app/api/v1/events/geo/route";

interface MapClusterFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { id: string; type: "event-cluster" | "event-location"; count?: number; title?: string };
}

// cluster_events returns H3 cell indexes as 15 lowercase hex digits.
const H3_CELL_ID = /^8[0-9a-f]{14}$/;

describe.sequential("/api/v1/events/geo", () => {
  let payload: Payload;
  let testCatalogId: string;
  let testDatasetId: string;
  const testEventIds: string[] = [];
  let testEnv: any;
  const uniqueSuffix = Date.now().toString();
  // Other files share this worker's database, so every query stays on the test dataset.
  const datasetFilters = () => JSON.stringify({ datasets: [Number(testDatasetId)] });

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });

    const { catalog } = await withCatalog(testEnv, {
      name: "Test Catalog for Clustering",
      slug: `test-clustering-catalog-${uniqueSuffix}`,
      isPublic: true,
      description: "Test catalog for clustering integration tests",
      user: users.testUser,
    });
    testCatalogId = String(catalog.id);

    // Create test dataset
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        _status: "published",
        catalog: Number.parseInt(testCatalogId),
        name: "Test Dataset for Clustering",
        slug: `test-clustering-dataset-${uniqueSuffix}`,
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: "Test dataset for clustering integration tests", version: 1 }],
                version: 1,
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
        language: "eng",
        isPublic: true, // Must be public since catalog is public
      },
    });
    testDatasetId = String(dataset.id);

    // Create test events with various locations
    const testLocations = [
      // Cluster in San Francisco area
      { lat: 37.7749, lng: -122.4194 },
      { lat: 37.7751, lng: -122.4196 },
      { lat: 37.7752, lng: -122.4195 },
      { lat: 37.775, lng: -122.4193 },
      // Cluster in New York area
      { lat: 40.7128, lng: -74.006 },
      { lat: 40.713, lng: -74.0062 },
      { lat: 40.7129, lng: -74.0061 },
      // Single events spread out
      { lat: 51.5074, lng: -0.1278 }, // London
      { lat: 48.8566, lng: 2.3522 }, // Paris
      { lat: 35.6762, lng: 139.6503 }, // Tokyo
    ];

    for (let i = 0; i < testLocations.length; i++) {
      const event = await payload.create({
        collection: "events",
        data: {
          _status: "published",
          uniqueId: `cluster-test-event-${i + 1}`,
          dataset: Number.parseInt(testDatasetId),
          sourceData: {
            title: `Test Event ${i + 1}`,
            description: `Test event for clustering at ${testLocations[i]?.lat}, ${testLocations[i]?.lng}`,
            venue: { city: i < 4 ? "Berlin" : "Paris", address: { city: i < 4 ? "Berlin" : "Paris" } },
          },
          transformedData: {
            title: `Test Event ${i + 1}`,
            description: `Test event for clustering at ${testLocations[i]?.lat}, ${testLocations[i]?.lng}`,
            venue: { city: i < 4 ? "Berlin" : "Paris", address: { city: i < 4 ? "Berlin" : "Paris" } },
          },
          location: { latitude: testLocations[i]?.lat, longitude: testLocations[i]?.lng },
          eventTimestamp: new Date(2024, 0, i + 1).toISOString(),
        },
      });
      testEventIds.push(String(event.id));
    }
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("should return clustered events for global view", async () => {
    const bounds = { north: 90, south: -90, east: 180, west: -180 };

    const request = new NextRequest(
      `http://localhost:3000/api/events/map-clusters?bounds=${encodeURIComponent(JSON.stringify(bounds))}&zoom=2&datasets=${testDatasetId}`
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    if (response.status !== 200) {
      const error = await response.json();
      throw new Error(`API returned ${response.status}: ${JSON.stringify(error)}`);
    }

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("type", "FeatureCollection");
    expect(data).toHaveProperty("features");
    expect(Array.isArray(data.features)).toBe(true);

    // At zoom 2 the SF and NY groups each collapse into one H3 cluster; London,
    // Paris and Tokyo stay single locations.
    const clusters = data.features.filter((f: MapClusterFeature) => f.properties.type === "event-cluster");
    const singles = data.features.filter((f: MapClusterFeature) => f.properties.type === "event-location");

    expect(
      clusters.map((c: MapClusterFeature) => c.properties.count ?? 0).toSorted((a: number, b: number) => a - b)
    ).toEqual([3, 4]);
    expect(singles).toHaveLength(3);

    for (const cluster of clusters) {
      expect(cluster).toHaveProperty("type", "Feature");
      expect(cluster.id).toMatch(H3_CELL_ID);
      expect(cluster.properties.clusterId).toBe(cluster.id);
      expect(cluster.geometry).toHaveProperty("type", "Point");
      expect(cluster.geometry.coordinates).toHaveLength(2);
    }
  });

  it("should return individual events at high zoom", async () => {
    // Tight bounds around SF test events (37.7749-37.7752, -122.4193 to -122.4196)
    const bounds = { north: 37.78, south: 37.77, east: -122.41, west: -122.43 };

    // Through the real route: a hand-rolled copy of its row-to-feature transform
    // stood here and had already fallen behind the h3Cell / clusterId / root-id rules.
    const request = new NextRequest(
      `http://localhost:3000/api/events/map-clusters?bounds=${encodeURIComponent(JSON.stringify(bounds))}&zoom=16&datasets=${testDatasetId}`
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    if (response.status !== 200) {
      const error = await response.json();
      throw new Error(`API returned ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    // At zoom 16 the four SF events split into one two-event cell and two singles.
    expect(data).toHaveProperty("type", "FeatureCollection");
    const total = data.features.reduce((sum: number, f: MapClusterFeature) => sum + (f.properties.count ?? 1), 0);
    expect(total).toBe(4);

    const singles = data.features.filter((f: MapClusterFeature) => f.properties.type === "event-location");
    expect(singles).toHaveLength(2);
    for (const single of singles) {
      expect(single.geometry).toHaveProperty("type", "Point");
      expect(single.id).toBe(single.properties.eventId);
      expect(single.properties.h3Cell).toMatch(H3_CELL_ID);
      expect(single.properties.title).toMatch(/^Test Event \d+$/);
    }
  });

  it("should filter by dataset", async () => {
    const bounds = { north: 90, south: -90, east: 180, west: -180 };

    const request = new NextRequest(
      `http://localhost:3000/api/events/map-clusters?bounds=${encodeURIComponent(
        JSON.stringify(bounds)
      )}&zoom=2&datasets=${testDatasetId}`
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    if (response.status !== 200) {
      const error = await response.json();
      throw new Error(`API returned ${response.status}: ${JSON.stringify(error)}`);
    }

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should only return our test events
    const totalEvents = data.features.reduce((sum: number, feature: MapClusterFeature) => {
      return sum + (feature.properties.count ?? 1);
    }, 0);

    expect(totalEvents).toBe(testEventIds.length);
  });

  it("should filter by date range", async () => {
    const bounds = { north: 90, south: -90, east: 180, west: -180 };

    const startDate = new Date(2024, 0, 5).toISOString().split("T")[0];
    const endDate = new Date(2024, 0, 8).toISOString().split("T")[0];

    const request = new NextRequest(
      `http://localhost:3000/api/events/map-clusters?bounds=${encodeURIComponent(
        JSON.stringify(bounds)
      )}&zoom=2&datasets=${testDatasetId}&startDate=${startDate}&endDate=${endDate}`
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    if (response.status !== 200) {
      const error = await response.json();
      throw new Error(`API returned ${response.status}: ${JSON.stringify(error)}`);
    }

    expect(response.status).toBe(200);
    const data = await response.json();

    // Events 5–8 fall on Jan 5–8
    const totalEvents = data.features.reduce((sum: number, feature: MapClusterFeature) => {
      return sum + (feature.properties.count ?? 1);
    }, 0);

    expect(totalEvents).toBe(4);
  });

  it("should filter clusters by deeply nested field path", async () => {
    const bounds = { north: 90, south: -90, east: 180, west: -180 };
    const fieldFilters = JSON.stringify({ "venue.address.city": ["Berlin"] });

    const request = new NextRequest(
      `http://localhost:3000/api/events/map-clusters?bounds=${encodeURIComponent(
        JSON.stringify(bounds)
      )}&zoom=2&datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    if (response.status !== 200) {
      const error = await response.json();
      throw new Error(`API returned ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const totalEvents = data.features.reduce((sum: number, feature: MapClusterFeature) => {
      return sum + (feature.properties.count ?? 1);
    }, 0);

    expect(totalEvents).toBe(4);
  });

  it("should handle missing bounds parameter", async () => {
    const request = new NextRequest("http://localhost:3000/api/events/map-clusters?zoom=10");

    const response = await GET(request, { params: Promise.resolve({}) });

    // Bounds is optional at schema level but required by route logic (ValidationError → 400)
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Missing required parameter: bounds");
  });

  it("should handle invalid bounds format", async () => {
    const request = new NextRequest(`http://localhost:3000/api/events/map-clusters?bounds=invalid&zoom=10`);

    const response = await GET(request, { params: Promise.resolve({}) });

    // A malformed bounds parameter fails schema validation (422) instead of being dropped.
    // It used to become `undefined`, which this endpoint then reported as "missing" — and on
    // every endpoint where bounds is optional it meant an unbounded query answered 200.
    expect(response.status).toBe(422);
  });

  it("should use tile-based clustering for stable cluster positions", async () => {
    // Test that clusters at zoom 10 stay at the same positions when zooming to 11
    const bounds = { north: 38, south: 37.5, east: -122, west: -123 };

    // Get clusters at zoom 10
    const result10 = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${bounds.west}::double precision,
          ${bounds.south}::double precision,
          ${bounds.east}::double precision,
          ${bounds.north}::double precision,
          10::integer,
          ${datasetFilters()}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    // Get clusters at zoom 11 (higher zoom = more detailed)
    const result11 = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${bounds.west}::double precision,
          ${bounds.south}::double precision,
          ${bounds.east}::double precision,
          ${bounds.north}::double precision,
          11::integer,
          ${datasetFilters()}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    // At zoom 11, we should have same or more clusters (subdivision)
    expect(result11.rows.length).toBeGreaterThanOrEqual(result10.rows.length);

    expect(result10.rows).toHaveLength(1);
    expect(result10.rows[0]?.cluster_id).toMatch(H3_CELL_ID);
  });

  it("should maintain cluster subdivision across zoom levels", async () => {
    // Test bounds around SF events
    const sfBounds = { north: 37.78, south: 37.77, east: -122.41, west: -122.43 };

    // Test zoom levels 8, 10, 12, 14
    const results: Record<number, any[]> = {};

    for (const zoom of [8, 10, 12, 14]) {
      const result = (await testEnv.payload.db.drizzle.execute(
        sql`
          SELECT * FROM cluster_events(
            ${sfBounds.west}::double precision,
            ${sfBounds.south}::double precision,
            ${sfBounds.east}::double precision,
            ${sfBounds.north}::double precision,
            ${zoom}::integer,
            ${datasetFilters()}::jsonb
          )
        `
      )) as { rows: Array<Record<string, unknown>> };

      results[zoom] = result.rows;
    }

    // As we zoom in, cluster count should increase or stay the same (subdivision)
    // Grid-based clustering uses smaller radius at higher zoom
    expect(results[10]!.length).toBeGreaterThanOrEqual(results[8]!.length);
    expect(results[12]!.length).toBeGreaterThanOrEqual(results[10]!.length);
    expect(results[14]!.length).toBeGreaterThanOrEqual(results[12]!.length);

    // Verify we get results at all zoom levels
    expect(results[8]!.length).toBeGreaterThan(0);
    expect(results[10]!.length).toBeGreaterThan(0);
    expect(results[12]!.length).toBeGreaterThan(0);
    expect(results[14]!.length).toBeGreaterThan(0);

    // Verify cluster structure
    const cluster8 = results[8]![0];
    expect(cluster8).toHaveProperty("cluster_id");
    expect(cluster8).toHaveProperty("longitude");
    expect(cluster8).toHaveProperty("latitude");
    expect(cluster8).toHaveProperty("event_count");
  });

  it("should produce deterministic cluster IDs based on tile coordinates", async () => {
    const bounds = { north: 38, south: 37.5, east: -122, west: -123 };

    // Run the same query twice
    const result1 = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${bounds.west}::double precision,
          ${bounds.south}::double precision,
          ${bounds.east}::double precision,
          ${bounds.north}::double precision,
          10::integer,
          ${datasetFilters()}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    const result2 = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${bounds.west}::double precision,
          ${bounds.south}::double precision,
          ${bounds.east}::double precision,
          ${bounds.north}::double precision,
          10::integer,
          ${datasetFilters()}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    // Results should be identical
    expect(result1.rows).toHaveLength(result2.rows.length);

    // Cluster IDs should match exactly
    expect(new Set(result1.rows.map((r) => r.cluster_id))).toEqual(new Set(result2.rows.map((r) => r.cluster_id)));
  });

  it("should filter cluster_events by H3 cell via clusterCells in JSONB", async () => {
    // First, get cluster IDs at zoom 10 for SF area (scoped to test dataset)
    const sfBounds = { north: 37.78, south: 37.77, east: -122.41, west: -122.43 };
    const clusterResult = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${sfBounds.west}::double precision,
          ${sfBounds.south}::double precision,
          ${sfBounds.east}::double precision,
          ${sfBounds.north}::double precision,
          10::integer,
          ${datasetFilters()}::jsonb
        )
      `
    )) as { rows: Array<{ cluster_id: string; event_count: number }> };

    expect(clusterResult.rows.length).toBeGreaterThan(0);
    const sfClusterId = clusterResult.rows[0]!.cluster_id;
    const sfCount = Number(clusterResult.rows[0]!.event_count);

    // Now query with clusterCells filter — should return fewer or equal results
    const h3Resolution = Math.min(15, Math.max(2, Math.round(10 * 0.6)));
    const h3Column = "e.h3_r" + String(h3Resolution);
    const filteredResult = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT COUNT(*)::integer as cnt FROM payload.events e
        JOIN payload.datasets d ON e.dataset_id = d.id
        WHERE e.location_longitude IS NOT NULL
          AND e.dataset_id = ${Number(testDatasetId)}
          AND ${sql.raw(h3Column)}::text = ${sfClusterId}
      `
    )) as { rows: Array<{ cnt: number }> };

    // The direct SQL count should match the cluster's event count
    expect(Number(filteredResult.rows[0]!.cnt)).toBe(sfCount);
  });

  it("should filter temporal histogram by H3 cell via clusterCells in JSONB", async () => {
    // Get a cluster cell for SF events
    const sfBounds = { north: 37.78, south: 37.77, east: -122.41, west: -122.43 };
    const clusterResult = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${sfBounds.west}::double precision,
          ${sfBounds.south}::double precision,
          ${sfBounds.east}::double precision,
          ${sfBounds.north}::double precision,
          10::integer,
          ${datasetFilters()}::jsonb
        )
      `
    )) as { rows: Array<{ cluster_id: string; event_count: number }> };

    expect(clusterResult.rows.length).toBeGreaterThan(0);
    const sfClusterId = clusterResult.rows[0]!.cluster_id;
    const sfCount = Number(clusterResult.rows[0]!.event_count);
    const h3Resolution = Math.min(15, Math.max(2, Math.round(10 * 0.6)));

    // Query temporal histogram with H3 cell filter via JSONB
    const result = (await testEnv.payload.db.drizzle.execute(
      sql`
        SELECT * FROM calculate_event_histogram(
          ${JSON.stringify({ datasets: [Number(testDatasetId)], clusterCells: [sfClusterId], h3Resolution })}::jsonb,
          30::integer, 20::integer, 50::integer
        )
      `
    )) as { rows: Array<{ event_count: number }> };

    const totalFromHistogram = result.rows.reduce((sum, r) => sum + Number(r.event_count), 0);
    expect(totalFromHistogram).toBe(sfCount);
  });
});
