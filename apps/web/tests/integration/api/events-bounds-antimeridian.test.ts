/**
 * Integration test for antimeridian-aware event bounds.
 *
 * Regression: plain MIN/MAX longitude returns a near-global box for events
 * clustered around the ±180° dateline. The route now recomputes the tightest
 * extent via the largest-longitude-gap method, returning west > east when the
 * minimal box crosses the antimeridian.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/v1/events/bounds/route";
import type { TestEnvironment } from "../../setup/integration/environment";

describe.sequential("/api/v1/events/bounds - antimeridian", () => {
  let payload: Payload;
  let testEnv: TestEnvironment;
  let datasetId: number;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });
    const { catalog } = await withCatalog(testEnv, {
      name: "Antimeridian Catalog",
      description: "Events near the dateline",
      isPublic: true,
      user: users.testUser,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Antimeridian Dataset", isPublic: true });
    datasetId = dataset.id;

    // Two clusters straddling the dateline: ~179 (east) and ~-179 (west).
    const coords = [
      { lng: 179.0, lat: 10 },
      { lng: 179.8, lat: 11 },
      { lng: -179.5, lat: 12 },
      { lng: -178.9, lat: 13 },
    ];
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i]!;
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `antimeridian-${i}`,
          dataset: datasetId,
          sourceData: {},
          transformedData: {},
          location: { latitude: c.lat, longitude: c.lng },
          eventTimestamp: new Date(2024, 0, 1 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("returns a tight dateline-crossing box (west > east) instead of a near-global box", async () => {
    const request = new NextRequest(`http://localhost:3000/api/v1/events/bounds?datasets=${datasetId}`);
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.count).toBe(4);
    // Largest interior gap is between -178.9 and 179.0 (≈358°), wider than the
    // ≈0.7° gap across the antimeridian, so the box crosses the dateline:
    //   west = 179.0 (start of the eastern cluster), east = -178.9.
    expect(data.bounds.west).toBeCloseTo(179.0, 1);
    expect(data.bounds.east).toBeCloseTo(-178.9, 1);
    expect(data.bounds.west).toBeGreaterThan(data.bounds.east);
    // Latitude is unaffected by the antimeridian handling.
    expect(data.bounds.south).toBeCloseTo(10, 1);
    expect(data.bounds.north).toBeCloseTo(13, 1);
  });
});
