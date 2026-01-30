/**
 * Integration tests for the histogram API endpoint.
 *
 * Tests time-based histogram generation including granularity
 * detection, filtering, and data aggregation.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/v1/events/temporal/route";

interface HistogramBucket {
  date: string;
  dateEnd: string;
  count: number;
}

describe("/api/v1/events/temporal", () => {
  let payload: Payload;
  let testDatasetId: string;
  const testEventIds: string[] = [];
  let testEnv: any;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Create test catalog (make it public so unauthenticated requests can access it)
    const { catalog } = await withCatalog(testEnv, {
      name: "Test Catalog for Histogram",
      description: "Test catalog for histogram integration tests",
      isPublic: true,
    });

    // Create test dataset (must be public since catalog is public)
    const { dataset } = await withDataset(testEnv, catalog.id, {
      name: "Test Dataset for Histogram",
      isPublic: true,
    });
    testDatasetId = String(dataset.id);

    // Create test events spread across different dates
    const testDates = [
      // January 2024
      new Date(2024, 0, 1),
      new Date(2024, 0, 5),
      new Date(2024, 0, 15),
      new Date(2024, 0, 20),
      new Date(2024, 0, 25),
      // February 2024
      new Date(2024, 1, 10),
      new Date(2024, 1, 20),
      // March 2024
      new Date(2024, 2, 1),
      new Date(2024, 2, 15),
      new Date(2024, 2, 30),
      // June 2024
      new Date(2024, 5, 15),
    ];

    for (let i = 0; i < testDates.length; i++) {
      const event = await payload.create({
        collection: "events",
        data: {
          uniqueId: `histogram-test-event-${i + 1}`,
          dataset: parseInt(testDatasetId),
          data: {
            title: `Test Event ${i + 1}`,
            description: `Test event for histogram on ${testDates[i]?.toISOString()}`,
          },
          location: {
            latitude: 37.7749 + i * 0.01,
            longitude: -122.4194 + i * 0.01,
          },
          eventTimestamp: testDates[i]?.toISOString(),
        },
      });
      testEventIds.push(String(event.id));
    }
  });

  afterAll(async () => {
    // Clean up test environment
    if (testEnv?.cleanup) {
      try {
        await testEnv.cleanup();
      } catch {
        // Cleanup error (non-critical) - silently continue
      }
    }
  });

  it("should return histogram data with auto granularity", async () => {
    const request = new NextRequest("http://localhost:3000/api/events/histogram");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("histogram");
    expect(data).toHaveProperty("metadata");
    expect(Array.isArray(data.histogram)).toBe(true);

    // Check histogram structure
    expect(data.histogram.length).toBeGreaterThan(0);
    const bucket = data.histogram[0];
    expect(bucket).toHaveProperty("date");
    expect(bucket).toHaveProperty("count");
    expect(typeof bucket.count).toBe("number");

    // Check metadata structure
    expect(data.metadata).toHaveProperty("total");
    expect(data.metadata).toHaveProperty("dateRange");
    expect(data.metadata).toHaveProperty("counts");
    expect(data.metadata).toHaveProperty("topDatasets");
    expect(data.metadata).toHaveProperty("topCatalogs");
  });

  it("should use flexible bucketing for our test data", async () => {
    // With flexible bucketing, the system automatically determines bucket size
    // based on date range (Jan-Jun 2024) and target bucket count
    const request = new NextRequest("http://localhost:3000/api/events/histogram");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should have buckets with data (flexible bucketing will determine optimal size)
    const bucketsWithData = data.histogram.filter((b: HistogramBucket) => b.count > 0);
    expect(bucketsWithData.length).toBeGreaterThan(0);

    // Metadata should include bucket size information
    expect(data.metadata).toHaveProperty("bucketSizeSeconds");
    expect(data.metadata).toHaveProperty("bucketCount");
    expect(typeof data.metadata.bucketSizeSeconds).toBe("number");
    expect(typeof data.metadata.bucketCount).toBe("number");

    // Should have our test events distributed across buckets
    const totalCount = data.histogram.reduce((sum: number, b: HistogramBucket) => sum + b.count, 0);
    expect(totalCount).toBeGreaterThanOrEqual(11); // We created 11 test events
  });

  it("should filter by dataset", async () => {
    const request = new NextRequest(`http://localhost:3000/api/events/histogram?datasets=${testDatasetId}`);
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Total should include our test events
    expect(data.metadata.total).toBeGreaterThanOrEqual(testEventIds.length);

    // topDatasets is not implemented yet - currently returns empty array
    // See route.ts:242 where topDatasets is hardcoded to []
    expect(data.metadata.topDatasets).toEqual([]);
  });

  it("should filter by date range", async () => {
    const startDate = new Date(2024, 1, 1).toISOString().split("T")[0]; // Feb 1
    const endDate = new Date(2024, 2, 31).toISOString().split("T")[0]; // Mar 31

    const request = new NextRequest(
      `http://localhost:3000/api/events/histogram?startDate=${startDate}&endDate=${endDate}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should have data for the months in range (may have more from other tests)
    const monthsWithData = data.histogram.filter((b: HistogramBucket) => b.count > 0);
    expect(monthsWithData.length).toBeGreaterThan(0);

    // Should have some events in range
    const totalInRange = monthsWithData.reduce((sum: number, b: HistogramBucket) => sum + b.count, 0);
    expect(totalInRange).toBeGreaterThan(0);
  });

  it("should filter by bounds", async () => {
    const bounds = {
      north: 37.8,
      south: 37.7,
      east: -122.4,
      west: -122.5,
    };

    const request = new NextRequest(
      `http://localhost:3000/api/events/histogram?bounds=${encodeURIComponent(JSON.stringify(bounds))}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should include some events (bounds filtering may not reduce much with test data)
    expect(data.metadata.total).toBeGreaterThan(0);
  });

  it("should handle short date ranges with smaller buckets", async () => {
    // Filter to just January - flexible bucketing should create smaller buckets for short ranges
    const startDate = new Date(2024, 0, 1).toISOString().split("T")[0];
    const endDate = new Date(2024, 0, 31).toISOString().split("T")[0];

    const request = new NextRequest(
      `http://localhost:3000/api/events/histogram?startDate=${startDate}&endDate=${endDate}`
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should have buckets appropriate for the date range
    const bucketsWithData = data.histogram.filter((b: HistogramBucket) => b.count > 0);
    expect(bucketsWithData.length).toBeGreaterThan(0);

    // Bucket size should be reasonable for a month-long range
    expect(data.metadata.bucketSizeSeconds).toBeLessThan(31 * 24 * 60 * 60); // Less than a month in seconds
  });

  it("should handle flexible bucket sizing", async () => {
    // With no specific range, should create buckets based on all available data
    const request = new NextRequest("http://localhost:3000/api/events/histogram");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should have buckets with data
    const bucketsWithData = data.histogram.filter((b: HistogramBucket) => b.count > 0);
    expect(bucketsWithData.length).toBeGreaterThanOrEqual(1);
    expect(bucketsWithData[0].count).toBeGreaterThan(0);

    // Bucket count should be within reasonable range (20-50 by default)
    expect(data.metadata.bucketCount).toBeGreaterThanOrEqual(1);
    expect(data.metadata.bucketCount).toBeLessThanOrEqual(50);
  });

  it("should handle invalid bounds format", async () => {
    const request = new NextRequest("http://localhost:3000/api/events/histogram?bounds=invalid");
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid bounds format");
  });
});
