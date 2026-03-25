/**
 * Integration tests for adaptive cluster radius in `cluster_events()`.
 *
 * When more than 500 events are in the viewport, the grid cell size scales up
 * logarithmically so that fewer, larger clusters are produced. Below that
 * threshold the function behaves identically to the previous static radius.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestEnvironment } from "../../setup/integration/environment";

/** Berlin city center with viewport spanning ~5 km */
const BERLIN = { lat: 52.52, lng: 13.405 };
const BERLIN_BOUNDS = { west: 13.3, south: 52.45, east: 13.5, north: 52.59 };

/** Call the SQL function directly and return cluster rows. */
const queryClusters = async (
  payload: Payload,
  bounds: { west: number; south: number; east: number; north: number },
  zoom: number,
  datasetId: number
) => {
  const result = (await payload.db.drizzle.execute(
    sql`
      SELECT * FROM cluster_events(
        ${bounds.west}::double precision,
        ${bounds.south}::double precision,
        ${bounds.east}::double precision,
        ${bounds.north}::double precision,
        ${zoom}::integer,
        ${JSON.stringify({ datasets: [String(datasetId)] })}::jsonb
      )
    `
  )) as { rows: Array<Record<string, unknown>> };
  return result.rows;
};

/** Sum event_count across all cluster rows. */
const totalEventsInClusters = (rows: Array<Record<string, unknown>>) =>
  rows.reduce((sum, row) => sum + Number(row.event_count), 0);

/** Bulk-create events in a grid pattern within a small area. */
const createEventsInGrid = async (payload: Payload, datasetId: number, prefix: string, count: number) => {
  const cols = Math.ceil(Math.sqrt(count));
  const step = 0.002; // ~150 m between points

  // Create in parallel batches of 50 for speed
  const batchSize = 50;
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(start + batchSize, count);
    await Promise.all(
      Array.from({ length: end - start }, (_, i) => {
        const idx = start + i;
        return payload.create({
          collection: "events",
          data: {
            uniqueId: `${prefix}-${idx}`,
            dataset: datasetId,
            sourceData: { title: `Event ${idx}` },
            transformedData: { title: `Event ${idx}` },
            location: {
              latitude: BERLIN.lat + (idx % cols) * step,
              longitude: BERLIN.lng + Math.floor(idx / cols) * step,
            },
            eventTimestamp: new Date(2024, 0, 1).toISOString(),
          },
        });
      })
    );
  }
};

describe.sequential("Adaptive cluster radius", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;
  let smallDatasetId: number;
  let largeDatasetId: number;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Adaptive Clustering Test Catalog",
      isPublic: true,
      user: users.testUser,
    });

    // Two datasets: one below threshold (100 events), one above (800 events)
    const { dataset: smallDs } = await withDataset(testEnv, catalog.id, { name: "Small Dataset", isPublic: true });
    smallDatasetId = smallDs.id as number;

    const { dataset: largeDs } = await withDataset(testEnv, catalog.id, { name: "Large Dataset", isPublic: true });
    largeDatasetId = largeDs.id as number;

    // Create events: 100 (below 500 threshold) and 800 (above threshold, scale ≈ 1.17x)
    await createEventsInGrid(payload, smallDatasetId, "adaptive-small", 100);
    await createEventsInGrid(payload, largeDatasetId, "adaptive-large", 800);
  }, 120_000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("does not scale radius when event count is below threshold", async () => {
    const rows = await queryClusters(payload, BERLIN_BOUNDS, 12, smallDatasetId);

    // All 100 events must be accounted for
    expect(totalEventsInClusters(rows)).toBe(100);
    // With 100 events in a grid, we expect multiple clusters (not all collapsed into one)
    expect(rows.length).toBeGreaterThan(1);
  });

  it("accounts for all events when scaling is active", async () => {
    const rows = await queryClusters(payload, BERLIN_BOUNDS, 12, largeDatasetId);

    // All 800 events must still appear in the clusters
    expect(totalEventsInClusters(rows)).toBe(800);
    expect(rows.length).toBeGreaterThan(1);
  });

  it("produces proportionally fewer clusters for large datasets", async () => {
    const smallRows = await queryClusters(payload, BERLIN_BOUNDS, 12, smallDatasetId);
    const largeRows = await queryClusters(payload, BERLIN_BOUNDS, 12, largeDatasetId);

    const smallClusters = smallRows.length;
    const largeClusters = largeRows.length;

    // With 8x more events but adaptive scaling, the cluster count should grow
    // less than 8x. The ratio of clusters-per-event should be lower for the
    // large dataset, meaning events are packed into fewer, bigger clusters.
    const smallRatio = smallClusters / 100;
    const largeRatio = largeClusters / 800;

    expect(largeRatio).toBeLessThan(smallRatio);
  });

  it("produces fewer clusters at lower zoom levels", async () => {
    const zoom10Rows = await queryClusters(payload, BERLIN_BOUNDS, 10, largeDatasetId);
    const zoom14Rows = await queryClusters(payload, BERLIN_BOUNDS, 14, largeDatasetId);

    // Lower zoom = larger base pixel_radius = larger grid cells = fewer clusters
    expect(zoom10Rows.length).toBeLessThan(zoom14Rows.length);

    // Both must account for all events
    expect(totalEventsInClusters(zoom10Rows)).toBe(800);
    expect(totalEventsInClusters(zoom14Rows)).toBe(800);
  });
});
