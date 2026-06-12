/**
 * Access-control coverage of the event SQL functions.
 *
 * Migration 20260417_160000 injected the `includePublic`/`ownerId` access
 * clause into the live function bodies by string-searching for a marker the
 * two H3 branches of `cluster_events` spelled differently — so the DEFAULT
 * map clustering path leaked private events (fixed in 20260612_130000).
 *
 * These tests guard against any recurrence of partially-patched functions:
 * 1. Structurally — every `FROM payload.events` scan in every event function
 *    must carry the access clause.
 * 2. Functionally — a private dataset's events must not be aggregated by the
 *    default (h3) clustering path for a public-only caller.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestEnvironment } from "../../setup/integration/environment";

const EVENT_FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];

/** Isolated spot in the South Atlantic so other suites' events can't interfere. */
const SPOT = { lat: -44.21, lng: -11.37 };
const BOUNDS = { west: SPOT.lng - 0.5, south: SPOT.lat - 0.5, east: SPOT.lng + 0.5, north: SPOT.lat + 0.5 };

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe.sequential("event SQL function access clauses", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Access Clause Test Catalog",
      isPublic: false,
      user: users.testUser,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Access Clause Private Dataset",
      isPublic: false,
    });

    await payload.create({
      collection: "events",
      data: {
        uniqueId: "access-clause-private-1",
        dataset: dataset.id as number,
        sourceData: { title: "Private Event" },
        transformedData: { title: "Private Event" },
        location: { latitude: SPOT.lat, longitude: SPOT.lng },
        eventTimestamp: new Date(2024, 0, 1).toISOString(),
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it.each(EVENT_FUNCTIONS)("every events scan in %s carries the access clause", async (fnName) => {
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
      const accessClauses = occurrences(definition, "includePublic");
      expect(eventScans).toBeGreaterThan(0);
      // One access clause per scan of the events table — a lower count means
      // some branch (e.g. an alternate clustering algorithm) leaks rows.
      expect(accessClauses).toBe(eventScans);
    }
  });

  it("default h3 clustering excludes private events for public-only callers", async () => {
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

    expect(result.rows[0]?.total).toBe(0);
  });
});
