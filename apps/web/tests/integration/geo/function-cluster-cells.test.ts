/**
 * The `clusterCells` focus filter must narrow every event SQL function.
 *
 * `toClusteringJsonb` and `toHistogramJsonb` both serialize `clusterCells` + `h3Resolution`, so
 * `/api/v1/events/geo`, `/temporal` and the histogram receive the same focus. A function without
 * the clause fails open: it answers for the whole viewport while the others answer for the cell.
 *
 * Guarded structurally (one clause per events scan) and functionally through `cluster_events`.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestEnvironment } from "../../setup/integration/environment";

const EVENT_FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];
const CLUSTER_CELLS_CLAUSE = "p_filters->'clusterCells' IS NULL OR";
const H3_RESOLUTION = 6;

/** Two spots in the South Pacific, far enough apart to land in different r6 cells. */
const SPOT_A = { lat: -41.17, lng: -131.52 };
const SPOT_B = { lat: -41.17, lng: -130.91 };
const BOUNDS = { west: -132, south: -41.5, east: -130.5, north: -40.8 };

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe.sequential("event SQL functions and the clusterCells filter", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;
  let cellA = "";

  const clusteredTotal = async (filters: Record<string, unknown>): Promise<number> => {
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT COALESCE(SUM(event_count), 0)::int AS total
        FROM cluster_events(
          ${BOUNDS.west}::double precision,
          ${BOUNDS.south}::double precision,
          ${BOUNDS.east}::double precision,
          ${BOUNDS.north}::double precision,
          10::integer,
          ${JSON.stringify({ includePublic: true, ...filters })}::jsonb,
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
      name: "Cluster Cells Catalog",
      isPublic: true,
      user: users.testUser,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Cluster Cells Dataset", isPublic: true });

    const eventIds: number[] = [];
    for (const [index, spot] of [SPOT_A, SPOT_A, SPOT_B].entries()) {
      const event = await payload.create({
        collection: "events",
        data: {
          _status: "published",
          uniqueId: `cluster-cells-${index}`,
          dataset: dataset.id as number,
          sourceData: { title: `Event ${index}` },
          transformedData: { title: `Event ${index}` },
          location: { latitude: spot.lat, longitude: spot.lng },
          eventTimestamp: new Date(2024, 0, index + 1).toISOString(),
        },
      });
      eventIds.push(event.id);
    }

    const cells = (await payload.db.drizzle.execute(
      sql`SELECT id, h3_r6 AS cell FROM payload.events WHERE id IN (${eventIds[0] ?? 0}, ${eventIds[2] ?? 0})`
    )) as { rows: Array<{ id: number; cell: string }> };
    cellA = cells.rows.find((row) => row.id === eventIds[0])?.cell ?? "";
    const cellB = cells.rows.find((row) => row.id === eventIds[2])?.cell ?? "";
    expect(cellA).not.toBe("");
    expect(cellB).not.toBe(cellA);
  }, 120_000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it.each(EVENT_FUNCTIONS)("every events scan in %s applies clusterCells", async (fnName) => {
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
      expect(occurrences(definition, CLUSTER_CELLS_CLAUSE)).toBe(eventScans);
    }
  });

  it("clusters only the events inside the focused cell", async () => {
    expect(await clusteredTotal({})).toBe(3);
    expect(await clusteredTotal({ clusterCells: [cellA], h3Resolution: H3_RESOLUTION })).toBe(2);
  });
});
