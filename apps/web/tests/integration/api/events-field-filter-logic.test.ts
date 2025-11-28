/**
 * Integration tests for events field filter logic.
 *
 * TDD tests to verify that field filters correctly reduce event counts:
 * - Single value filter should reduce count
 * - Multiple values in same field = OR (union, more than single but less than all)
 * - Multiple fields = AND (intersection, should reduce count further)
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/v1/events/route";
import type { TestEnvironment } from "../../setup/integration/environment";

describe("/api/v1/events - field filter logic", () => {
  let payload: Payload;
  let testDatasetId: number;
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset } = await import(
      "../../setup/integration/environment"
    );
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Filter Logic Test Catalog",
      description: "Test catalog for filter logic",
      isPublic: true,
    });

    // Create test dataset
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Filter Logic Test Dataset",
      isPublic: true,
    });
    testDatasetId = dataset.id;

    // Create events with different category and status combinations
    // This creates a matrix to test AND/OR logic:
    //
    // | Event | Category | Status  |
    // |-------|----------|---------|
    // | 1     | Music    | Active  |
    // | 2     | Music    | Active  |
    // | 3     | Music    | Pending |
    // | 4     | Sports   | Active  |
    // | 5     | Sports   | Pending |
    // | 6     | Art      | Active  |
    //
    // Expectations:
    // - No filter: 6 events
    // - category=Music: 3 events
    // - category=Sports: 2 events
    // - category=[Music,Sports]: 5 events (OR within field)
    // - status=Active: 4 events
    // - category=Music AND status=Active: 2 events (AND across fields)
    // - category=[Music,Sports] AND status=Active: 4 events

    const events = [
      { category: "Music", status: "Active" },
      { category: "Music", status: "Active" },
      { category: "Music", status: "Pending" },
      { category: "Sports", status: "Active" },
      { category: "Sports", status: "Pending" },
      { category: "Art", status: "Active" },
    ];

    for (let i = 0; i < events.length; i++) {
      const eventData = events[i];
      if (!eventData) continue;
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `filter-logic-${i + 1}`,
          dataset: testDatasetId,
          data: eventData,
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

  it("should return all events when no filter applied", async () => {
    const request = new NextRequest(`http://localhost:3000/api/v1/events?datasets=${testDatasetId}`);
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.events.length).toBe(6);
  });

  it("should reduce count when filtering by single category value", async () => {
    const fieldFilters = JSON.stringify({ category: ["Music"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should only return Music events (3 of them)
    expect(data.events.length).toBe(3);
    expect(data.events.length).toBeLessThan(6); // MUST be less than total
  });

  it("should use OR logic for multiple values in same field", async () => {
    const fieldFilters = JSON.stringify({ category: ["Music", "Sports"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return Music (3) + Sports (2) = 5 events
    expect(data.events.length).toBe(5);
    // Should be more than single filter but less than all
    expect(data.events.length).toBeGreaterThan(3);
    expect(data.events.length).toBeLessThan(6);
  });

  it("should use AND logic across multiple fields", async () => {
    const fieldFilters = JSON.stringify({ category: ["Music"], status: ["Active"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return only Music AND Active events (2 of them)
    expect(data.events.length).toBe(2);
    // MUST be less than either single filter
    expect(data.events.length).toBeLessThan(3); // Less than Music alone
    expect(data.events.length).toBeLessThan(4); // Less than Active alone
  });

  it("should combine OR within field and AND across fields", async () => {
    const fieldFilters = JSON.stringify({ category: ["Music", "Sports"], status: ["Active"] });
    const request = new NextRequest(
      `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return (Music OR Sports) AND Active - should be less than both:
    // - Less than (Music OR Sports) without status filter (5)
    // - Less than all events (6)
    expect(data.events.length).toBeLessThan(5);
    expect(data.events.length).toBeLessThan(6);
    // And should be at least 1
    expect(data.events.length).toBeGreaterThan(0);
  });

  it("should never return more events than without filter", async () => {
    // Get baseline count
    const baseRequest = new NextRequest(`http://localhost:3000/api/v1/events?datasets=${testDatasetId}`);
    const baseResponse = await GET(baseRequest, { params: Promise.resolve({}) });
    const baseData = await baseResponse.json();
    const baseCount = baseData.events.length;

    // Test with various filter combinations
    const filterCombinations = [
      { category: ["Music"] },
      { status: ["Active"] },
      { category: ["Music", "Sports"] },
      { category: ["Music"], status: ["Active"] },
      { category: ["Music", "Sports", "Art"], status: ["Active", "Pending"] },
    ];

    for (const filters of filterCombinations) {
      const fieldFilters = JSON.stringify(filters);
      const request = new NextRequest(
        `http://localhost:3000/api/v1/events?datasets=${testDatasetId}&ff=${encodeURIComponent(fieldFilters)}`
      );
      const response = await GET(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(data.events.length).toBeLessThanOrEqual(baseCount);
    }
  });
});
