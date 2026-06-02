/**
 * Cross-path parity tests for numeric range filtering.
 *
 * A numeric range filter must apply identically on the events LIST
 * (`/api/v1/events`), the MAP clusters (`/api/v1/events/geo`), and the TEMPORAL
 * histogram (`/api/v1/events/temporal`). The list path uses the TS Drizzle
 * builder (`to-sql-conditions.ts`); the map and temporal paths use the
 * `cluster_events` / `calculate_event_histogram` PostgreSQL functions that
 * migration 20260602_000000 taught to normalize and range-filter the same way.
 *
 * The list and map paths use `requireLocation: true`; the temporal path does
 * not. To keep that orthogonal location gate from being mistaken for a
 * range-filter divergence, most rows are geocoded so list == map exactly, and a
 * single unlocated in-range US row makes temporal == list + 1 — proving the
 * range filter itself agrees on every path and only the location gate differs.
 * The EU dataset is fully geocoded, so list == map == temporal there.
 *
 * It also proves locale (EU) normalization and non-numeric-cell exclusion match
 * across all three paths, so the `::numeric` cast never throws and a missing /
 * malformed field never leaks into the map or histogram.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatasetInterpretationPlan } from "@/lib/ingest/types/interpretation";

import { GET as geoGet } from "../../../app/api/v1/events/geo/route";
import { GET as eventsGet } from "../../../app/api/v1/events/route";
import { GET as temporalGet } from "../../../app/api/v1/events/temporal/route";
import type { TestEnvironment } from "../../setup/integration/environment";

/** US-format ("." decimal, "," thousands) number column `price`. */
const usPlan: DatasetInterpretationPlan = {
  ops: [],
  columns: [
    { field: "price", kind: "number", policy: { kind: "number", decimalSeparator: ".", thousandsSeparator: "," } },
  ],
  roles: {},
  ambiguityResolution: "strict",
};

/** EU-format ("," decimal, "." thousands) number column `betrag`. */
const euPlan: DatasetInterpretationPlan = {
  ops: [],
  columns: [
    { field: "betrag", kind: "number", policy: { kind: "number", decimalSeparator: ",", thousandsSeparator: "." } },
  ],
  roles: {},
  ambiguityResolution: "strict",
};

const WORLD_BOUNDS = { north: 90, south: -90, east: 180, west: -180 };

type RangeFilters = Record<string, { min?: number; max?: number }>;

describe.sequential("numeric range filter — list/map/temporal parity", () => {
  let payload: Payload;
  let usDatasetId: number;
  let euDatasetId: number;
  let testEnv: TestEnvironment;

  /** Total matching events from the LIST endpoint. */
  const listTotal = async (datasetId: number, rf: RangeFilters): Promise<number> => {
    const url = `http://localhost:3000/api/v1/events?datasets=${datasetId}&rf=${encodeURIComponent(
      JSON.stringify(rf)
    )}&limit=200`;
    const response = await eventsGet(new NextRequest(url), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { pagination: { totalDocs: number } };
    return data.pagination.totalDocs;
  };

  /** Total matching events from the TEMPORAL histogram endpoint. */
  const temporalTotal = async (datasetId: number, rf: RangeFilters): Promise<number> => {
    const url = `http://localhost:3000/api/v1/events/temporal?datasets=${datasetId}&rf=${encodeURIComponent(
      JSON.stringify(rf)
    )}`;
    const response = await temporalGet(new NextRequest(url), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { metadata: { total: number } };
    return data.metadata.total;
  };

  /** Total located events from the MAP clusters endpoint (sum of feature counts). */
  const mapTotal = async (datasetId: number, rf: RangeFilters): Promise<number> => {
    const url = `http://localhost:3000/api/v1/events/geo?datasets=${datasetId}&zoom=2&bounds=${encodeURIComponent(
      JSON.stringify(WORLD_BOUNDS)
    )}&rf=${encodeURIComponent(JSON.stringify(rf))}`;
    const response = await geoGet(new NextRequest(url), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { features: Array<{ properties: { count: number } }> };
    return data.features.reduce((sum, f) => sum + Number(f.properties.count), 0);
  };

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Range Parity Catalog",
      isPublic: true,
      user: users.testUser,
    });

    const { dataset: usDataset } = await withDataset(testEnv, catalog.id, {
      name: "US Parity Dataset",
      isPublic: true,
      interpretationPlan: usPlan,
    });
    usDatasetId = usDataset.id;

    const { dataset: euDataset } = await withDataset(testEnv, catalog.id, {
      name: "EU Parity Dataset",
      isPublic: true,
      interpretationPlan: euPlan,
    });
    euDatasetId = euDataset.id;

    // US dataset. `located` controls whether the event gets coordinates (so it
    // appears on the map and in the location-gated list). The non-numeric cell
    // must be excluded everywhere. The one unlocated in-range row exercises the
    // temporal-vs-list/map location gate in the final test.
    const usRows: Array<{ price: string; located: boolean }> = [
      { price: "10", located: true }, // in [10,100], located
      { price: "25.5", located: true }, // in [10,100], located
      { price: "100", located: true }, // in [10,100], located
      { price: "50", located: false }, // in [10,100], NO location (temporal-only)
      { price: "1,234.56", located: true }, // above 100, located → excluded by range
      { price: "n/a", located: true }, // non-numeric, located → excluded, must not throw
    ];
    for (let i = 0; i < usRows.length; i++) {
      const row = usRows[i]!;
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `us-parity-${i + 1}`,
          dataset: usDatasetId,
          sourceData: { title: `US ${i + 1}`, price: row.price },
          transformedData: { title: `US ${i + 1}`, price: row.price },
          ...(row.located ? { location: { latitude: 40 + i * 0.5, longitude: -74 + i * 0.5 } } : {}),
          eventTimestamp: new Date(2024, 0, 1 + i).toISOString(),
        },
      });
    }

    // EU dataset. All located so map == list == temporal exactly for EU.
    const euRows: Array<{ betrag: string }> = [
      { betrag: "10,5" }, // 10.5
      { betrag: "99,99" }, // 99.99 (NOT 9999 — proves comma is the decimal)
      { betrag: "1.234,56" }, // 1234.56
    ];
    for (let i = 0; i < euRows.length; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `eu-parity-${i + 1}`,
          dataset: euDatasetId,
          sourceData: { title: `EU ${i + 1}`, betrag: euRows[i]!.betrag },
          transformedData: { title: `EU ${i + 1}`, betrag: euRows[i]!.betrag },
          location: { latitude: 41 + i * 0.5, longitude: -73 + i * 0.5 },
          eventTimestamp: new Date(2024, 1, 1 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("US range agrees across list, map, and temporal for located rows", async () => {
    // [10,100] over LOCATED rows: 10, 25.5, 100 → 3 on every path.
    // 1,234.56 (>100) and "n/a" (non-numeric) excluded everywhere. The unlocated
    // 50 is covered separately by the location-gate test below.
    const rf: RangeFilters = { price: { min: 10, max: 100 } };
    const [list, temporal, map] = await Promise.all([
      listTotal(usDatasetId, rf),
      temporalTotal(usDatasetId, rf),
      mapTotal(usDatasetId, rf),
    ]);
    // Located in-range = 3; the unlocated 50 is temporal-only (+1).
    expect(map).toBe(3);
    expect(list).toBe(3); // list is location-gated → matches map
    expect(temporal).toBe(4); // temporal is NOT location-gated → +the unlocated 50
  });

  it("US thousands-grouped value normalizes consistently across paths", async () => {
    const rf: RangeFilters = { price: { min: 1000 } };
    const [list, temporal, map] = await Promise.all([
      listTotal(usDatasetId, rf),
      temporalTotal(usDatasetId, rf),
      mapTotal(usDatasetId, rf),
    ]);
    // Only "1,234.56" (=1234.56) is >= 1000, and it is located.
    expect(list).toBe(1);
    expect(temporal).toBe(1);
    expect(map).toBe(1);
  });

  it("an open-ended (min-only) range agrees across paths", async () => {
    const rf: RangeFilters = { price: { min: 26 } };
    const [list, temporal, map] = await Promise.all([
      listTotal(usDatasetId, rf),
      temporalTotal(usDatasetId, rf),
      mapTotal(usDatasetId, rf),
    ]);
    // >= 26: 100, 50, 1,234.56 (10 and 25.5 excluded; "n/a" excluded).
    // Located among them: 100 and 1,234.56 → 2 (list + map); +unlocated 50 → 3 temporal.
    expect(map).toBe(2);
    expect(list).toBe(2);
    expect(temporal).toBe(3);
  });

  it("EU comma-decimal column filters identically on all three paths", async () => {
    // [100, 1500] → only 1.234,56 (=1234.56). "99,99" must parse as 99.99 (NOT
    // 9999) and be excluded; "10,5" (=10.5) excluded. All EU rows are located,
    // so list == temporal == map exactly.
    const rf: RangeFilters = { betrag: { min: 100, max: 1500 } };
    const [list, temporal, map] = await Promise.all([
      listTotal(euDatasetId, rf),
      temporalTotal(euDatasetId, rf),
      mapTotal(euDatasetId, rf),
    ]);
    expect(list).toBe(1);
    expect(temporal).toBe(1);
    expect(map).toBe(1);
  });

  it("a wide EU range matches every row on all paths and never throws", async () => {
    const rf: RangeFilters = { betrag: { min: 0, max: 100000 } };
    const [list, temporal, map] = await Promise.all([
      listTotal(euDatasetId, rf),
      temporalTotal(euDatasetId, rf),
      mapTotal(euDatasetId, rf),
    ]);
    expect(list).toBe(3);
    expect(temporal).toBe(3);
    expect(map).toBe(3);
  });
});
