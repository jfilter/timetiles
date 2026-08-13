/**
 * Trashed events must be invisible to the event SQL functions.
 *
 * Events are trash-enabled: Payload's `find` hides soft-deleted rows and `toSqlConditions`
 * adds `e.deleted_at IS NULL` to every raw-SQL path. The three PL/pgSQL functions did not,
 * so a deleted event stayed in map clusters, the histogram and the beeswarm while the list
 * beside them already hid it (fixed in 20260813_180000).
 *
 * Guarded twice: structurally, so a future in-place function rewrite cannot drop the clause
 * from one branch, and functionally through the actual aggregate.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestEnvironment } from "../../setup/integration/environment";

const EVENT_FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];

/** Isolated spot in the South Pacific so other suites' events cannot interfere. */
const SPOT = { lat: -38.42, lng: -128.63 };
const BOUNDS = { west: SPOT.lng - 0.5, south: SPOT.lat - 0.5, east: SPOT.lng + 0.5, north: SPOT.lat + 0.5 };

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe.sequential("event SQL functions and trashed events", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;
  let eventIds: number[] = [];

  const clusteredTotal = async (): Promise<number> => {
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT COALESCE(SUM(event_count), 0)::int AS total
        FROM cluster_events(
          ${BOUNDS.west}::double precision,
          ${BOUNDS.south}::double precision,
          ${BOUNDS.east}::double precision,
          ${BOUNDS.north}::double precision,
          10::integer,
          ${JSON.stringify({ includePublic: true })}::jsonb,
          50::integer,
          'h3'::text
        )
      `
    )) as { rows: Array<{ total: number }> };
    return result.rows[0]?.total ?? 0;
  };

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Trashed Events Catalog",
      isPublic: true,
      user: users.testUser,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Trashed Events Dataset", isPublic: true });

    for (const index of [1, 2, 3]) {
      const event = await payload.create({
        collection: "events",
        data: {
          uniqueId: `trashed-events-${index}`,
          dataset: dataset.id as number,
          sourceData: { title: `Event ${index}` },
          transformedData: { title: `Event ${index}` },
          location: { latitude: SPOT.lat, longitude: SPOT.lng },
          eventTimestamp: new Date(2024, 0, index).toISOString(),
        },
      });
      eventIds.push(event.id);
    }
  }, 120_000);

  afterAll(async () => {
    eventIds = [];
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it.each(EVENT_FUNCTIONS)("every events scan in %s filters deleted_at", async (fnName) => {
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = ${fnName}
          AND n.nspname IN ('public', 'payload')
      `
    )) as { rows: Array<{ definition: string }> };

    expect(result.rows.length).toBeGreaterThan(0);
    for (const { definition } of result.rows) {
      const eventScans = occurrences(definition, "FROM payload.events");
      expect(eventScans).toBeGreaterThan(0);
      // One clause per scan — a lower count means some branch still aggregates trashed rows.
      expect(occurrences(definition, "e.deleted_at IS NULL")).toBe(eventScans);
    }
  });

  it("drops a trashed event from the clustered total", async () => {
    expect(await clusteredTotal()).toBe(3);

    await payload.db.drizzle.execute(sql`UPDATE payload.events SET deleted_at = NOW() WHERE id = ${eventIds[0] ?? 0}`);

    expect(await clusteredTotal()).toBe(2);
  });

  it("drops a trashed event from the histogram total", async () => {
    const histogramTotal = async (): Promise<number> => {
      const result = (await payload.db.drizzle.execute(
        sql`
          SELECT COALESCE(SUM(event_count), 0)::int AS total
          FROM calculate_event_histogram(
            ${JSON.stringify({ includePublic: true })}::jsonb, 20::integer, 5::integer, 50::integer
          )
        `
      )) as { rows: Array<{ total: number }> };
      return result.rows[0]?.total ?? 0;
    };

    const before = await histogramTotal();

    await payload.db.drizzle.execute(sql`UPDATE payload.events SET deleted_at = NOW() WHERE id = ${eventIds[1] ?? 0}`);

    expect(await histogramTotal()).toBe(before - 1);
  });
});
