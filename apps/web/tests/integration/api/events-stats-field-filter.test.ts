/**
 * Integration tests for field filters on aggregation and geo stats endpoints.
 *
 * Verifies deeply nested field paths work on the remaining SQL-backed routes
 * that were not previously covered.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getGeoStats } from "@/app/api/v1/events/geo/stats/route";
import { GET as getStats } from "@/app/api/v1/events/stats/route";

import type { TestEnvironment } from "../../setup/integration/environment";

const COLLECTIONS_TO_RESET = ["users", "events", "datasets", "catalogs"] as const;

describe.sequential("/api/v1/events stats - deeply nested field filtering", () => {
  let payload: Payload;
  let berlinDatasetId: number;
  let parisDatasetId: number;
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Truncate to avoid data leakage from other test files (isolate: false)
    await testEnv.seedManager.truncate([...COLLECTIONS_TO_RESET]);

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });

    const { catalog } = await withCatalog(testEnv, {
      name: "Stats Field Filter Test Catalog",
      description: "Test catalog for stats field filtering",
      isPublic: true,
      user: users.testUser,
    });

    const { dataset: berlinDataset } = await withDataset(testEnv, catalog.id, {
      name: "Berlin Stats Dataset",
      isPublic: true,
    });
    berlinDatasetId = berlinDataset.id;

    const { dataset: parisDataset } = await withDataset(testEnv, catalog.id, {
      name: "Paris Stats Dataset",
      isPublic: true,
    });
    parisDatasetId = parisDataset.id;

    const berlinLocations = [
      { latitude: 52.5201, longitude: 13.4051 },
      { latitude: 52.52015, longitude: 13.40515 },
      { latitude: 52.5202, longitude: 13.4052 },
    ];
    const parisLocations = [
      { latitude: 48.8561, longitude: 2.3521 },
      { latitude: 48.85615, longitude: 2.35215 },
      { latitude: 48.8562, longitude: 2.3522 },
      { latitude: 48.85625, longitude: 2.35225 },
      { latitude: 48.8563, longitude: 2.3523 },
    ];

    for (let i = 0; i < berlinLocations.length; i++) {
      const location = berlinLocations[i];
      if (!location) continue;

      await payload.create({
        collection: "events",
        data: {
          uniqueId: `stats-field-filter-berlin-${i + 1}`,
          dataset: berlinDatasetId,
          originalData: { title: `Berlin Stats Event ${i + 1}`, venue: { address: { city: "Berlin" } } },
          location,
          eventTimestamp: new Date(2024, 2, 10 + i).toISOString(),
        },
      });
    }

    for (let i = 0; i < parisLocations.length; i++) {
      const location = parisLocations[i];
      if (!location) continue;

      await payload.create({
        collection: "events",
        data: {
          uniqueId: `stats-field-filter-paris-${i + 1}`,
          dataset: parisDatasetId,
          originalData: { title: `Paris Stats Event ${i + 1}`, venue: { address: { city: "Paris" } } },
          location,
          eventTimestamp: new Date(2024, 3, 10 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("should aggregate datasets using a deeply nested field path", async () => {
    const fieldFilters = JSON.stringify({ "venue.address.city": ["Berlin"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events/stats?groupBy=dataset&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await getStats(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Assert filtered results — total reflects only Berlin-filtered events
    expect(data.total).toBe(3);
    expect(data.items).toContainEqual({ id: berlinDatasetId, name: "Berlin Stats Dataset", count: 3 });
  });

  it("should calculate geo stats using a deeply nested field path", async () => {
    const fieldFilters = JSON.stringify({ "venue.address.city": ["Berlin"] });

    const filteredResponse = await getGeoStats(
      new NextRequest(`http://localhost:3000/api/v1/events/geo/stats?ff=${encodeURIComponent(fieldFilters)}`),
      { params: Promise.resolve({}) }
    );

    expect(filteredResponse.status).toBe(200);

    const filtered = await filteredResponse.json();

    // Only assert filtered counts — unfiltered counts are fragile in shared DB (isolate: false)
    expect(filtered.p20).toBe(3);
    expect(filtered.p100).toBe(3);
  });
});
