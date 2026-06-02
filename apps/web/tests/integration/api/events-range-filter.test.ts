/**
 * Integration tests for events list API numeric range filtering.
 *
 * Verifies that events can be filtered by a numeric min/max range on a custom
 * field via the `rf` (range filters) parameter, with locale-aware (EU/US)
 * query-time normalization, single-dataset gating, and safe handling of
 * non-numeric cells (the ::numeric cast must never throw).
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatasetInterpretationPlan } from "@/lib/ingest/types/interpretation";

import { GET } from "../../../app/api/v1/events/route";
import type { TestEnvironment } from "../../setup/integration/environment";

/** Plan with a single US-format ("." decimal, "," thousands) number column `price`. */
const usPlan: DatasetInterpretationPlan = {
  ops: [],
  columns: [
    { field: "price", kind: "number", policy: { kind: "number", decimalSeparator: ".", thousandsSeparator: "," } },
  ],
  roles: {},
  ambiguityResolution: "strict",
};

/** Plan with a single EU-format ("," decimal, "." thousands) number column `betrag`. */
const euPlan: DatasetInterpretationPlan = {
  ops: [],
  columns: [
    { field: "betrag", kind: "number", policy: { kind: "number", decimalSeparator: ",", thousandsSeparator: "." } },
  ],
  roles: {},
  ambiguityResolution: "strict",
};

describe.sequential("/api/v1/events - numeric range filtering", () => {
  let payload: Payload;
  let usDatasetId: number;
  let euDatasetId: number;
  let testEnv: TestEnvironment;

  const requestRange = async (datasetId: number, rf: Record<string, { min?: number; max?: number }>) => {
    const url = `http://localhost:3000/api/v1/events?datasets=${datasetId}&rf=${encodeURIComponent(JSON.stringify(rf))}&limit=100`;
    const response = await GET(new NextRequest(url), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      events: Array<{ data: Record<string, unknown> }>;
      pagination: { totalDocs: number };
    };
  };

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Range Filter Test Catalog",
      isPublic: true,
      user: users.testUser,
    });

    const { dataset: usDataset } = await withDataset(testEnv, catalog.id, {
      name: "US Range Dataset",
      isPublic: true,
      interpretationPlan: usPlan,
    });
    usDatasetId = usDataset.id;

    const { dataset: euDataset } = await withDataset(testEnv, catalog.id, {
      name: "EU Range Dataset",
      isPublic: true,
      interpretationPlan: euPlan,
    });
    euDatasetId = euDataset.id;

    // US dataset: stored raw text values (kept verbatim — never normalized at import).
    // Includes a thousands-grouped value and a non-numeric cell to exercise the guard.
    const usRows: Array<{ price: string }> = [
      { price: "10" },
      { price: "25.5" },
      { price: "100" },
      { price: "1,234.56" }, // US thousands group → 1234.56
      { price: "n/a" }, // non-numeric → must not throw, must be excluded
    ];
    for (let i = 0; i < usRows.length; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `us-range-${i + 1}`,
          dataset: usDatasetId,
          sourceData: { title: `US Event ${i + 1}`, price: usRows[i]!.price },
          transformedData: { title: `US Event ${i + 1}`, price: usRows[i]!.price },
          location: { latitude: 40 + i * 0.01, longitude: -74 + i * 0.01 },
          eventTimestamp: new Date(2024, 0, 1 + i).toISOString(),
        },
      });
    }

    // EU dataset: comma-decimal, dot-thousands raw values.
    const euRows: Array<{ betrag: string }> = [
      { betrag: "10,5" }, // 10.5
      { betrag: "1.234,56" }, // 1234.56
      { betrag: "99,99" }, // 99.99
    ];
    for (let i = 0; i < euRows.length; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `eu-range-${i + 1}`,
          dataset: euDatasetId,
          sourceData: { title: `EU Event ${i + 1}`, betrag: euRows[i]!.betrag },
          transformedData: { title: `EU Event ${i + 1}`, betrag: euRows[i]!.betrag },
          location: { latitude: 41 + i * 0.01, longitude: -73 + i * 0.01 },
          eventTimestamp: new Date(2024, 1, 1 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("filters a US column by a min/max range (inclusive), excluding non-numeric cells", async () => {
    const data = await requestRange(usDatasetId, { price: { min: 10, max: 100 } });
    const prices = data.events.map((e) => String(e.data.price)).sort((a, b) => a.localeCompare(b));
    // 10, 25.5, 100 are in [10,100]; 1,234.56 is above; "n/a" is non-numeric.
    expect(prices).toEqual(["10", "100", "25.5"]);
    expect(data.pagination.totalDocs).toBe(3);
  });

  it("normalizes a US thousands-grouped value before comparing", async () => {
    const data = await requestRange(usDatasetId, { price: { min: 1000 } });
    const prices = data.events.map((e) => String(e.data.price));
    // Only "1,234.56" (=1234.56) is >= 1000.
    expect(prices).toEqual(["1,234.56"]);
  });

  it("applies a min-only range (open upper bound)", async () => {
    const data = await requestRange(usDatasetId, { price: { min: 26 } });
    const prices = data.events.map((e) => String(e.data.price)).sort((a, b) => a.localeCompare(b));
    expect(prices).toEqual(["1,234.56", "100"]);
  });

  it("applies a max-only range (open lower bound)", async () => {
    const data = await requestRange(usDatasetId, { price: { max: 25.5 } });
    const prices = data.events.map((e) => String(e.data.price)).sort((a, b) => a.localeCompare(b));
    expect(prices).toEqual(["10", "25.5"]);
  });

  it("normalizes an EU comma-decimal / dot-thousands column", async () => {
    // [100, 1500] selects only 1.234,56 (=1234.56). Crucially "99,99" must parse
    // as 99.99 (NOT 9999) and be excluded — proving the comma is the decimal
    // separator, and "10,5" (=10.5) is excluded as below 100.
    const data = await requestRange(euDatasetId, { betrag: { min: 100, max: 1500 } });
    const betraege = data.events.map((e) => String(e.data.betrag));
    expect(betraege).toEqual(["1.234,56"]);
  });

  it("includes EU sub-thousand rows when the range covers them", async () => {
    // [11, 1500] now also includes "99,99" (=99.99); "10,5" (=10.5) stays excluded.
    const data = await requestRange(euDatasetId, { betrag: { min: 11, max: 1500 } });
    const betraege = data.events.map((e) => String(e.data.betrag)).sort((a, b) => a.localeCompare(b));
    expect(betraege).toEqual(["1.234,56", "99,99"]);
  });

  it("matches all EU rows for a wide range and never throws", async () => {
    const data = await requestRange(euDatasetId, { betrag: { min: 0, max: 100000 } });
    expect(data.pagination.totalDocs).toBe(3);
  });

  it("ignores range filters when more than one dataset is selected (single-dataset gate)", async () => {
    const url = `http://localhost:3000/api/v1/events?datasets=${usDatasetId},${euDatasetId}&rf=${encodeURIComponent(
      JSON.stringify({ price: { min: 10, max: 100 } })
    )}&limit=100`;
    const response = await GET(new NextRequest(url), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { pagination: { totalDocs: number } };
    // Gate drops the range filter → all events across both datasets (5 US + 3 EU).
    expect(data.pagination.totalDocs).toBe(8);
  });

  it("ignores a range filter on a field with no resolved number policy", async () => {
    // `title` is not a number-kind column → format unresolved → filter dropped.
    const data = await requestRange(usDatasetId, { title: { min: 0, max: 1 } });
    // All 5 US events returned (range filter ignored, not applied).
    expect(data.pagination.totalDocs).toBe(5);
  });
});
