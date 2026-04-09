/**
 * Integration tests for enum-stats endpoint filtering.
 *
 * Verifies that categorical filter dropdown values are narrowed by
 * active filters (time range, field filters) and that cross-filtering
 * excludes the current field's own filter.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/v1/datasets/[id]/enum-stats/route";
import type { TestEnvironment } from "../../setup/integration/environment";

interface EnumStatsField {
  path: string;
  values: Array<{ value: string; count: number }>;
  cardinality: number;
}

const fetchEnumStats = async (datasetId: number, queryParams = "") => {
  const suffix = queryParams ? `&${queryParams}` : "";
  const url = `http://localhost:3000/api/v1/datasets/${datasetId}/enum-stats?datasets=${datasetId}${suffix}`;
  const request = new NextRequest(url);
  const response = await GET(request, { params: Promise.resolve({ id: String(datasetId) }) });
  expect(response.status).toBe(200);
  const data = await response.json();
  return data.fields as EnumStatsField[];
};

const getField = (fields: EnumStatsField[], path: string) => fields.find((f) => f.path === path);
const getValues = (fields: EnumStatsField[], path: string) => getField(fields, path)?.values.map((v) => v.value) ?? [];

describe("/api/v1/datasets/[id]/enum-stats - filtering", () => {
  let payload: Payload;
  let testDatasetId: number;
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Enum Stats Test Catalog",
      description: "Test",
      isPublic: true,
      user: users.testUser,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Enum Stats Test Dataset", isPublic: true });
    testDatasetId = dataset.id;

    // Mark category and region as enum candidates in fieldMetadata
    await payload.update({
      collection: "datasets",
      id: testDatasetId,
      data: {
        fieldMetadata: {
          category: {
            path: "category",
            occurrences: 8,
            occurrencePercent: 100,
            nullCount: 0,
            uniqueValues: 3,
            uniqueSamples: ["Music", "Sports", "Art"],
            typeDistribution: { string: 8 },
            formats: {},
            isEnumCandidate: true,
            enumValues: [
              { value: "Music", count: 4, percent: 50 },
              { value: "Sports", count: 2, percent: 25 },
              { value: "Art", count: 2, percent: 25 },
            ],
          },
          region: {
            path: "region",
            occurrences: 8,
            occurrencePercent: 100,
            nullCount: 0,
            uniqueValues: 2,
            uniqueSamples: ["North", "South"],
            typeDistribution: { string: 8 },
            formats: {},
            isEnumCandidate: true,
            enumValues: [
              { value: "North", count: 5, percent: 62 },
              { value: "South", count: 3, percent: 38 },
            ],
          },
        },
      },
    });

    // Create events spanning two time periods and two regions:
    //
    // | # | category | region | date       |
    // |---|----------|--------|------------|
    // | 1 | Music    | North  | 2020-01-15 |
    // | 2 | Music    | North  | 2020-06-15 |
    // | 3 | Music    | South  | 2021-01-15 |
    // | 4 | Music    | South  | 2021-06-15 |
    // | 5 | Sports   | North  | 2020-03-15 |
    // | 6 | Sports   | South  | 2021-03-15 |
    // | 7 | Art      | North  | 2020-09-15 |
    // | 8 | Art      | North  | 2021-09-15 |
    //
    // 2020 events: Music(2), Sports(1), Art(1) — North(3), South(0... wait)
    // Let me re-check: events in 2020: #1,2,5,7 → categories: Music(2), Sports(1), Art(1); regions: North(4)
    // events in 2021: #3,4,6,8 → categories: Music(2), Sports(1), Art(1); regions: South(2), North(1)
    // North events: #1,2,5,7,8 → categories: Music(2), Sports(1), Art(2)
    // South events: #3,4,6 → categories: Music(2), Sports(1)

    const events = [
      { category: "Music", region: "North", date: "2020-01-15" },
      { category: "Music", region: "North", date: "2020-06-15" },
      { category: "Music", region: "South", date: "2021-01-15" },
      { category: "Music", region: "South", date: "2021-06-15" },
      { category: "Sports", region: "North", date: "2020-03-15" },
      { category: "Sports", region: "South", date: "2021-03-15" },
      { category: "Art", region: "North", date: "2020-09-15" },
      { category: "Art", region: "North", date: "2021-09-15" },
    ];

    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `enum-stats-${i}`,
          dataset: testDatasetId,
          sourceData: e,
          transformedData: { category: e.category, region: e.region },
          location: { latitude: 40 + i * 0.01, longitude: -74 + i * 0.01 },
          eventTimestamp: new Date(e.date).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("returns all values without filters", async () => {
    const fields = await fetchEnumStats(testDatasetId);
    expect(getValues(fields, "category")).toEqual(expect.arrayContaining(["Music", "Sports", "Art"]));
    expect(getValues(fields, "region")).toEqual(expect.arrayContaining(["North", "South"]));
  });

  it("narrows values by date range", async () => {
    // Only 2020 events: Music, Sports, Art all present but only in North
    const fields = await fetchEnumStats(testDatasetId, "startDate=2020-01-01&endDate=2020-12-31");

    const regions = getValues(fields, "region");
    expect(regions).toContain("North");
    expect(regions).not.toContain("South"); // No 2020 events in South

    // All 3 categories still present in 2020
    expect(getValues(fields, "category")).toEqual(expect.arrayContaining(["Music", "Sports", "Art"]));
  });

  it("cross-filters: own field filter does not hide its values", async () => {
    // Filter region=South — the region dropdown should still show both North and South
    const ff = encodeURIComponent(JSON.stringify({ region: ["South"] }));
    const fields = await fetchEnumStats(testDatasetId, `ff=${ff}`);

    // Region should still show both (cross-filter excludes own field)
    const regions = getValues(fields, "region");
    expect(regions).toContain("North");
    expect(regions).toContain("South");

    // But category should only show what exists in South: Music and Sports (not Art)
    const categories = getValues(fields, "category");
    expect(categories).toContain("Music");
    expect(categories).toContain("Sports");
    expect(categories).not.toContain("Art");
  });

  it("combines date range and field filters", async () => {
    // 2021 + region=North → only Art (#8)
    const ff = encodeURIComponent(JSON.stringify({ region: ["North"] }));
    const fields = await fetchEnumStats(testDatasetId, `startDate=2021-01-01&endDate=2021-12-31&ff=${ff}`);

    // Category should show only Art (the only 2021+North category)
    const categories = getValues(fields, "category");
    expect(categories).toContain("Art");
    // Music and Sports have no 2021+North events... wait, #8 is Art+North+2021
    // But also check: are there other 2021+North events? No — only #8
    expect(categories).toHaveLength(1);
  });
});
