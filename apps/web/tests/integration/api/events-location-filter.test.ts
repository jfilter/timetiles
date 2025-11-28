/**
 * Integration tests for events list API location filtering.
 *
 * Verifies that events without geocoded locations are excluded
 * from the events list API to ensure consistency with map display.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/v1/events/route";
import type { TestEnvironment } from "../../setup/integration/environment";

describe("/api/v1/events - location filtering", () => {
  let payload: Payload;
  let testDatasetId: number;
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset } = await import(
      "../../setup/integration/environment"
    );
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Create test catalog (public for unauthenticated access)
    const { catalog } = await withCatalog(testEnv, {
      name: "Location Filter Test Catalog",
      description: "Test catalog for location filtering",
      isPublic: true,
    });

    // Create test dataset
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Location Filter Test Dataset",
      isPublic: true,
    });
    testDatasetId = dataset.id;

    // Create events WITH coordinates (should be included)
    for (let i = 0; i < 3; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `with-coords-${i + 1}`,
          dataset: testDatasetId,
          data: { title: `Event with coords ${i + 1}` },
          location: {
            latitude: 40.7128 + i * 0.01,
            longitude: -74.006 + i * 0.01,
          },
          eventTimestamp: new Date(2024, 0, 15 + i).toISOString(),
        },
      });
    }

    // Create events WITHOUT coordinates (should be excluded)
    for (let i = 0; i < 2; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `no-coords-${i + 1}`,
          dataset: testDatasetId,
          data: { title: `Event without coords ${i + 1}` },
          // No location field
          eventTimestamp: new Date(2024, 0, 20 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("should only return events with coordinates", async () => {
    const request = new NextRequest(`http://localhost:3000/api/v1/events?datasets=${testDatasetId}`);
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return only the 3 events with coordinates
    expect(data.events.length).toBe(3);
    expect(data.pagination.totalDocs).toBe(3);

    // All returned events should have locations
    for (const event of data.events) {
      expect(event.location).not.toBeNull();
      expect(event.location.latitude).toBeDefined();
      expect(event.location.longitude).toBeDefined();
    }
  });

  it("should show consistent count between list and total", async () => {
    const request = new NextRequest(`http://localhost:3000/api/v1/events?datasets=${testDatasetId}`);
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // events.length should match totalDocs (no more "170 of 390" inconsistency)
    expect(data.events.length).toBe(data.pagination.totalDocs);
  });
});
