/**
 * Integration tests for anti-meridian (dateline) longitude filtering in
 * `cluster_events()` and `calculate_event_histogram()` SQL functions.
 *
 * When a map viewport crosses the dateline (e.g. west=170, east=-170),
 * `BETWEEN 170 AND -170` returns zero rows because the lower bound exceeds
 * the upper bound. The fix uses a `CASE WHEN min_lng <= max_lng THEN BETWEEN
 * ELSE (>= min OR <= max) END` pattern.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestEnvironment } from "../../setup/integration/environment";

describe.sequential("Anti-meridian longitude filtering", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;
  let testDatasetId: number;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });

    const { catalog } = await withCatalog(testEnv, {
      name: "Anti-meridian Test Catalog",
      isPublic: true,
      user: users.testUser,
    });

    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Anti-meridian Test Dataset", isPublic: true });
    testDatasetId = dataset.id as number;

    // Event A: longitude 175 (near Fiji, west side of dateline)
    await payload.create({
      collection: "events",
      data: {
        uniqueId: "antimeridian-event-a-fiji",
        dataset: testDatasetId,
        originalData: { title: "Fiji Event" },
        location: { latitude: -17.7134, longitude: 175.0 },
        eventTimestamp: new Date(2024, 0, 10).toISOString(),
      },
    });

    // Event B: longitude -175 (near Samoa, east side of dateline)
    await payload.create({
      collection: "events",
      data: {
        uniqueId: "antimeridian-event-b-samoa",
        dataset: testDatasetId,
        originalData: { title: "Samoa Event" },
        location: { latitude: -13.759, longitude: -175.0 },
        eventTimestamp: new Date(2024, 0, 20).toISOString(),
      },
    });

    // Event C: longitude 0 (Greenwich, control — should NOT appear in anti-meridian queries)
    await payload.create({
      collection: "events",
      data: {
        uniqueId: "antimeridian-event-c-greenwich",
        dataset: testDatasetId,
        originalData: { title: "Greenwich Event" },
        location: { latitude: 51.4769, longitude: 0.0 },
        eventTimestamp: new Date(2024, 0, 30).toISOString(),
      },
    });
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // cluster_events()
  // ---------------------------------------------------------------------------

  it("cluster_events: returns events on both sides of the dateline when viewport crosses it", async () => {
    // Viewport crossing the anti-meridian: west=170, east=-170
    // With the old BETWEEN: `BETWEEN 170 AND -170` returns zero rows.
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${170}::double precision,
          ${-90}::double precision,
          ${-170}::double precision,
          ${90}::double precision,
          14::integer,
          ${JSON.stringify({ datasets: [String(testDatasetId)] })}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    // Both Fiji (lng=175) and Samoa (lng=-175) must appear
    const totalEvents = result.rows.reduce((sum, row) => sum + Number(row.event_count), 0);
    expect(totalEvents).toBe(2);

    // Greenwich (lng=0) must NOT appear
    const titles = result.rows.flatMap((row) => {
      if (row.event_title) return [row.event_title];
      return [];
    });
    expect(titles).not.toContain("Greenwich Event");
  });

  it("cluster_events: normal (non-crossing) bounds still work correctly", async () => {
    // Normal viewport around Greenwich: west=-10, east=10
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${-10}::double precision,
          ${-90}::double precision,
          ${10}::double precision,
          ${90}::double precision,
          14::integer,
          ${JSON.stringify({ datasets: [String(testDatasetId)] })}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    // Only Greenwich (lng=0) should appear
    const totalEvents = result.rows.reduce((sum, row) => sum + Number(row.event_count), 0);
    expect(totalEvents).toBe(1);

    const titles = result.rows.flatMap((row) => {
      if (row.event_title) return [row.event_title];
      return [];
    });
    expect(titles).toContain("Greenwich Event");
  });

  it("cluster_events: full-world bounds return all events", async () => {
    // Bounds spanning the entire world: west=-180, east=180
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT * FROM cluster_events(
          ${-180}::double precision,
          ${-90}::double precision,
          ${180}::double precision,
          ${90}::double precision,
          14::integer,
          ${JSON.stringify({ datasets: [String(testDatasetId)] })}::jsonb
        )
      `
    )) as { rows: Array<Record<string, unknown>> };

    const totalEvents = result.rows.reduce((sum, row) => sum + Number(row.event_count), 0);
    expect(totalEvents).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // calculate_event_histogram()
  // ---------------------------------------------------------------------------

  it("calculate_event_histogram: returns non-zero counts when bounds cross the anti-meridian", async () => {
    // Bounds crossing the dateline: minLng=170, maxLng=-170
    const filters = JSON.stringify({
      datasets: [String(testDatasetId)],
      bounds: { minLng: 170, maxLng: -170, minLat: -90, maxLat: 90 },
    });

    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT * FROM calculate_event_histogram(
          ${filters}::jsonb,
          30::integer,
          20::integer,
          50::integer
        )
      `
    )) as { rows: Array<{ bucket_start: string; bucket_end: string; event_count: number }> };

    // The histogram must return buckets (i.e., the function found events)
    expect(result.rows.length).toBeGreaterThan(0);

    // Total event count across all buckets should be 2 (Fiji + Samoa)
    const totalEvents = result.rows.reduce((sum, row) => sum + Number(row.event_count), 0);
    expect(totalEvents).toBe(2);
  });

  it("calculate_event_histogram: normal bounds still work correctly", async () => {
    // Normal bounds around Greenwich: minLng=-10, maxLng=10
    const filters = JSON.stringify({
      datasets: [String(testDatasetId)],
      bounds: { minLng: -10, maxLng: 10, minLat: -90, maxLat: 90 },
    });

    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT * FROM calculate_event_histogram(
          ${filters}::jsonb,
          30::integer,
          20::integer,
          50::integer
        )
      `
    )) as { rows: Array<{ bucket_start: string; bucket_end: string; event_count: number }> };

    // Should find exactly the Greenwich event
    const totalEvents = result.rows.reduce((sum, row) => sum + Number(row.event_count), 0);
    expect(totalEvents).toBe(1);
  });

  it("calculate_event_histogram: no bounds returns all events", async () => {
    // No bounds filter at all — should return all 3 events
    const filters = JSON.stringify({ datasets: [String(testDatasetId)] });

    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT * FROM calculate_event_histogram(
          ${filters}::jsonb,
          30::integer,
          20::integer,
          50::integer
        )
      `
    )) as { rows: Array<{ bucket_start: string; bucket_end: string; event_count: number }> };

    expect(result.rows.length).toBeGreaterThan(0);

    const totalEvents = result.rows.reduce((sum, row) => sum + Number(row.event_count), 0);
    expect(totalEvents).toBe(3);
  });
});
