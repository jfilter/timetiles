/**
 * A literal dotted field key must resolve the same way in every read path.
 *
 * `getByPathOrKey` reads an exact top-level key before traversing, so a flattened header
 * named `event.title` survives ingest as one key. Every SQL reader traversed unconditionally,
 * so such a field filtered, sorted, grouped and rendered as if it were missing — while the
 * ingest-side JavaScript saw it. Fixed by `jsonTextAtPathOrKey` on the TypeScript side and
 * migration 20260813_200000 inside the three PL/pgSQL functions.
 *
 * The fixture holds both shapes at once: event A carries the literal key AND a nested
 * `event.title` with a different value (literal must win), event B carries only the nested
 * one (traversal must still work). Every assertion below separates the two.
 *
 * @module
 * @category Integration Tests
 */
import { sql } from "@payloadcms/db-postgres";
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getEnumStats } from "../../../app/api/v1/datasets/[id]/enum-stats/route";
import { GET as getClusterSummary } from "../../../app/api/v1/events/cluster-summary/route";
import { GET as getEvents } from "../../../app/api/v1/events/route";
import type { TestEnvironment } from "../../setup/integration/environment";

const EVENT_FUNCTIONS = ["cluster_events", "calculate_event_histogram", "cluster_events_temporal"];

/** The flattened header that is one literal key, not a path. */
const FIELD = "event.title";

/** Isolated spot in the South Atlantic so other suites' events cannot interfere. */
const SPOT = { lat: -41.77, lng: -19.34 };
const BOUNDS = { west: SPOT.lng - 0.5, south: SPOT.lat - 0.5, east: SPOT.lng + 0.5, north: SPOT.lat + 0.5 };

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe.sequential("literal dotted field keys across the read paths", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;
  let datasetId: number;
  let literalEventId: number;

  /** Filter jsonb for the PL/pgSQL functions, scoped to this suite's dataset. */
  const filtersFor = (value: string) =>
    JSON.stringify({ includePublic: true, datasets: [datasetId], fieldFilters: { [FIELD]: [value] } });

  const clusteredTotal = async (value: string): Promise<number> => {
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT COALESCE(SUM(event_count), 0)::int AS total
        FROM cluster_events(
          ${BOUNDS.west}::double precision,
          ${BOUNDS.south}::double precision,
          ${BOUNDS.east}::double precision,
          ${BOUNDS.north}::double precision,
          10::integer,
          ${filtersFor(value)}::jsonb,
          50::integer,
          'h3'::text
        )
      `
    )) as { rows: Array<{ total: number }> };
    return result.rows[0]?.total ?? 0;
  };

  const histogramTotal = async (value: string): Promise<number> => {
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT COALESCE(SUM(event_count), 0)::int AS total
        FROM calculate_event_histogram(${filtersFor(value)}::jsonb, 20::integer, 5::integer, 50::integer)
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
      name: "Literal Key Catalog",
      isPublic: true,
      user: users.testUser,
    });
    // The title role points at the literal key, so the map/cluster title resolution
    // must not fall through to the nested object either.
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Literal Key Dataset",
      isPublic: true,
      fieldMappingOverrides: { titlePath: FIELD },
    });
    datasetId = dataset.id as number;

    await payload.update({
      collection: "datasets",
      id: datasetId,
      data: {
        fieldTypes: { enum: [FIELD] },
        fieldMetadata: {
          [FIELD]: {
            path: FIELD,
            occurrences: 2,
            occurrencePercent: 100,
            nullCount: 0,
            uniqueValues: 2,
            uniqueSamples: ["Literal", "Nested"],
            typeDistribution: { string: 2 },
            formats: {},
            isEnumCandidate: true,
            enumValues: [
              { value: "Literal", count: 1, percent: 50 },
              { value: "Nested", count: 1, percent: 50 },
            ],
          },
        },
      },
    });

    const rows = [
      // A: literal key present — it must win over the nested value below it.
      { uniqueId: "literal-key-a", data: { [FIELD]: "Literal", event: { title: "Shadowed" } } },
      // B: no literal key — traversal still has to resolve the nested value.
      { uniqueId: "literal-key-b", data: { event: { title: "Nested" } } },
    ];

    for (const [index, row] of rows.entries()) {
      const event = await payload.create({
        collection: "events",
        data: {
          uniqueId: row.uniqueId,
          dataset: datasetId,
          sourceData: row.data,
          transformedData: row.data,
          location: { latitude: SPOT.lat, longitude: SPOT.lng },
          eventTimestamp: new Date(2024, 0, index + 1).toISOString(),
        },
      });
      if (index === 0) literalEventId = event.id;
    }
  }, 120_000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it.each(EVENT_FUNCTIONS)("every field access in %s tries the literal key first", async (fnName) => {
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
      const traversals = occurrences(definition, "string_to_array(");
      expect(traversals).toBeGreaterThan(0);
      // One literal-key branch per traversal — a lower count means some access still
      // resolves a flattened header as a path.
      expect(occurrences(definition, "jsonb_exists(e.transformed_data")).toBe(traversals);
    }
  });

  it("filters map clusters on the literal key, not the nested path", async () => {
    expect(await clusteredTotal("Literal")).toBe(1);
    expect(await clusteredTotal("Nested")).toBe(1);
    // The literal key shadows the nested object entirely — nothing resolves to it.
    expect(await clusteredTotal("Shadowed")).toBe(0);
  });

  it("filters the histogram on the literal key", async () => {
    expect(await histogramTotal("Literal")).toBe(1);
    expect(await histogramTotal("Shadowed")).toBe(0);
  });

  it("groups the beeswarm by the literal key", async () => {
    const result = (await payload.db.drizzle.execute(
      sql`
        SELECT group_id, SUM(event_count)::int AS total
        FROM cluster_events_temporal(
          ${JSON.stringify({ includePublic: true, datasets: [datasetId] })}::jsonb,
          40::integer,
          500::integer,
          ${FIELD}::text
        )
        GROUP BY group_id
      `
    )) as { rows: Array<{ group_id: string; total: number }> };

    const groups = Object.fromEntries(result.rows.map((r) => [r.group_id, r.total]));
    expect(groups).toEqual({ Literal: 1, Nested: 1 });
  });

  it("counts enum-stats values on the literal key", async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/v1/datasets/${datasetId}/enum-stats?datasets=${datasetId}`
    );
    const response = await getEnumStats(request, { params: Promise.resolve({ id: String(datasetId) }) });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      fields: Array<{ path: string; values: Array<{ value: string; count: number }> }>;
    };
    const values = body.fields.find((f) => f.path === FIELD)?.values ?? [];
    expect(Object.fromEntries(values.map((v) => [v.value, v.count]))).toEqual({ Literal: 1, Nested: 1 });
  });

  it("lists and sorts events by the literal key", async () => {
    const filtered = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${datasetId}&ff=${encodeURIComponent(
        JSON.stringify({ [FIELD]: ["Literal"] })
      )}&sort=${encodeURIComponent(FIELD)}`
    );
    const response = await getEvents(filtered, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { events: Array<{ id: number }>; total?: number };
    expect(body.events.map((e) => e.id)).toEqual([literalEventId]);
  });

  it("titles cluster previews and facets from the literal key", async () => {
    const cell = (await payload.db.drizzle.execute(
      sql`SELECT h3_r8 AS cell FROM payload.events WHERE id = ${literalEventId}`
    )) as { rows: Array<{ cell: string }> };
    const h3Cell = cell.rows[0]?.cell;
    expect(h3Cell).toBeTruthy();

    const request = new NextRequest(
      `http://localhost:3000/api/v1/events/cluster-summary?datasets=${datasetId}&cells=${h3Cell}&h3Resolution=8`
    );
    const response = await getClusterSummary(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      preview: Array<{ id: number; title?: string }>;
      categories: Array<{ field: string; values: Array<{ value: string; count: number }> }>;
    };

    expect(body.preview.find((p) => p.id === literalEventId)?.title).toBe("Literal");
    const facet = body.categories.find((c) => c.field === FIELD)?.values ?? [];
    expect(Object.fromEntries(facet.map((v) => [v.value, v.count]))).toEqual({ Literal: 1, Nested: 1 });
  });
});
