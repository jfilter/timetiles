/**
 * Integration tests for events list API field filtering.
 *
 * Verifies that events can be filtered by custom field values
 * using the `ff` (field filters) parameter with OR logic.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/v1/events/route";
import type { TestEnvironment } from "../../setup/integration/environment";

describe("/api/v1/events - field filtering", () => {
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
      name: "Field Filter Test Catalog",
      description: "Test catalog for field filtering",
      isPublic: true,
    });

    // Create test dataset
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Field Filter Test Dataset",
      isPublic: true,
    });
    testDatasetId = dataset.id;

    // Create events with different category values
    const categories = ["Music", "Music", "Sports", "Art", "Art"];
    for (let i = 0; i < categories.length; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `field-filter-${i + 1}`,
          dataset: testDatasetId,
          data: {
            title: `Event ${i + 1}`,
            category: categories[i],
          },
          location: {
            latitude: 40.7128 + i * 0.01,
            longitude: -74.006 + i * 0.01,
          },
          eventTimestamp: new Date(2024, 0, 15 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("should filter events by single field value", async () => {
    const fieldFilters = JSON.stringify({ category: ["Music"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return only the 2 Music events
    expect(data.events.length).toBe(2);
    for (const event of data.events) {
      expect(event.data.category).toBe("Music");
    }
  });

  it("should filter events by multiple field values with OR logic", async () => {
    const fieldFilters = JSON.stringify({ category: ["Music", "Art"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return 2 Music + 2 Art = 4 events
    expect(data.events.length).toBe(4);
    for (const event of data.events) {
      expect(["Music", "Art"]).toContain(event.data.category);
    }
  });
});
