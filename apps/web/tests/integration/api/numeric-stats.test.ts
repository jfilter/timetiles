/**
 * Integration tests for the dataset numeric-stats endpoint.
 *
 * Verifies that `/api/v1/datasets/{id}/numeric-stats` computes min/max bounds for
 * numeric STRING columns with a LIVE, locale-aware SQL aggregate — the whole
 * reason this endpoint exists is that EU string columns (e.g. "1.234,56") have no
 * precomputed numericStats, so the bounds must be derived by parsing each column
 * with its persisted NumberFormat. Also exercises the non-numeric-cell guard
 * (the ::numeric cast must never throw) and the current-filter scope.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatasetInterpretationPlan } from "@/lib/ingest/types/interpretation";

import { GET } from "../../../app/api/v1/datasets/[id]/numeric-stats/route";
import type { TestEnvironment } from "../../setup/integration/environment";

/** US-format ("." decimal, "," thousands) number column `price`. */
const usPlan: DatasetInterpretationPlan = {
  ops: [],
  columns: [
    { field: "price", kind: "number", policy: { kind: "number", decimalSeparator: ".", thousandsSeparator: "," } },
    { field: "qty", kind: "number", policy: { kind: "number", decimalSeparator: ".", thousandsSeparator: null } },
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

interface NumericStatsResponse {
  fields: Array<{ path: string; label: string; min: number; max: number; isInteger: boolean }>;
}

describe.sequential("/api/v1/datasets/[id]/numeric-stats", () => {
  let payload: Payload;
  let usDatasetId: number;
  let euDatasetId: number;
  let catalogId: number;
  let testEnv: TestEnvironment;

  const requestStats = async (datasetId: number): Promise<NumericStatsResponse> => {
    const url = `http://localhost:3000/api/v1/datasets/${datasetId}/numeric-stats`;
    const response = await GET(new NextRequest(url), { params: Promise.resolve({ id: String(datasetId) }) });
    expect(response.status).toBe(200);
    return (await response.json()) as NumericStatsResponse;
  };

  /** fieldMetadata is required (endpoint restricts candidate paths to its keys). */
  const fieldMeta = (paths: string[]) =>
    Object.fromEntries(
      paths.map((path) => [
        path,
        {
          path,
          occurrences: 5,
          occurrencePercent: 100,
          nullCount: 0,
          uniqueValues: 5,
          uniqueSamples: [],
          typeDistribution: {},
          formats: {},
          isEnumCandidate: false,
          firstSeen: new Date(),
          lastSeen: new Date(),
          depth: 0,
        },
      ])
    );

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Numeric Stats Test Catalog",
      isPublic: true,
      user: users.testUser,
    });
    catalogId = catalog.id;

    const { dataset: usDataset } = await withDataset(testEnv, catalog.id, {
      name: "US Numeric Dataset",
      isPublic: true,
      interpretationPlan: usPlan,
    });
    usDatasetId = usDataset.id;
    await payload.update({
      collection: "datasets",
      id: usDatasetId,
      data: { fieldTypes: { number: ["price", "qty"] }, fieldMetadata: fieldMeta(["price", "qty"]) },
    });

    const { dataset: euDataset } = await withDataset(testEnv, catalog.id, {
      name: "EU Numeric Dataset",
      isPublic: true,
      interpretationPlan: euPlan,
    });
    euDatasetId = euDataset.id;
    await payload.update({
      collection: "datasets",
      id: euDatasetId,
      data: { fieldTypes: { number: ["betrag"] }, fieldMetadata: fieldMeta(["betrag"]) },
    });

    // US rows: raw text stored verbatim. Includes a thousands group + a
    // non-numeric cell to exercise the ::numeric guard.
    const usRows = [
      { price: "10", qty: "1" },
      { price: "25.5", qty: "3" },
      { price: "100", qty: "2" },
      { price: "1,234.56", qty: "5" },
      { price: "n/a", qty: "4" },
    ];
    for (let i = 0; i < usRows.length; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `us-stats-${i + 1}`,
          dataset: usDatasetId,
          sourceData: { title: `US ${i + 1}`, ...usRows[i] },
          transformedData: { title: `US ${i + 1}`, ...usRows[i] },
          location: { latitude: 40 + i * 0.01, longitude: -74 + i * 0.01 },
          eventTimestamp: new Date(2024, 0, 1 + i).toISOString(),
        },
      });
    }

    // EU rows: comma-decimal, dot-thousands.
    const euRows = [{ betrag: "10,5" }, { betrag: "1.234,56" }, { betrag: "99,99" }];
    for (let i = 0; i < euRows.length; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `eu-stats-${i + 1}`,
          dataset: euDatasetId,
          sourceData: { title: `EU ${i + 1}`, ...euRows[i] },
          transformedData: { title: `EU ${i + 1}`, ...euRows[i] },
          location: { latitude: 41 + i * 0.01, longitude: -73 + i * 0.01 },
          eventTimestamp: new Date(2024, 1, 1 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("computes US bounds, normalizing the thousands group and excluding non-numeric cells", async () => {
    const data = await requestStats(usDatasetId);
    const price = data.fields.find((f) => f.path === "price");
    expect(price).toBeDefined();
    // 10, 25.5, 100, 1234.56 are numeric; "n/a" is excluded (cast must not throw).
    expect(price?.min).toBe(10);
    expect(price?.max).toBeCloseTo(1234.56, 2);
    expect(price?.isInteger).toBe(false);
  });

  it("derives isInteger=true for a whole-number column", async () => {
    const data = await requestStats(usDatasetId);
    const qty = data.fields.find((f) => f.path === "qty");
    expect(qty).toBeDefined();
    expect(qty?.min).toBe(1);
    expect(qty?.max).toBe(5);
    expect(qty?.isInteger).toBe(true);
  });

  it("computes EU bounds with comma-decimal normalization (99,99 is 99.99, not 9999)", async () => {
    const data = await requestStats(euDatasetId);
    const betrag = data.fields.find((f) => f.path === "betrag");
    expect(betrag).toBeDefined();
    expect(betrag?.min).toBeCloseTo(10.5, 2);
    // 1.234,56 → 1234.56 is the max; proves the dot is the thousands separator.
    expect(betrag?.max).toBeCloseTo(1234.56, 2);
    expect(betrag?.isInteger).toBe(false);
  });

  it("returns a human-readable label per field", async () => {
    const data = await requestStats(usDatasetId);
    expect(data.fields.find((f) => f.path === "price")?.label).toBe("Price");
  });

  it("returns no fields for a dataset with no numeric fieldTypes", async () => {
    const { withDataset } = await import("../../setup/integration/environment");
    const { dataset: plain } = await withDataset(testEnv, catalogId, { name: "No Numeric Dataset", isPublic: true });
    await payload.update({
      collection: "datasets",
      id: plain.id,
      // fieldMetadata present but no fieldTypes.number → no numeric candidates.
      data: { fieldMetadata: fieldMeta(["title"]) },
    });

    const data = await requestStats(plain.id);
    expect(data.fields).toEqual([]);
  });
});
