import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { GET } from "@/app/api/events/route";
import { NextRequest } from "next/server";
import { createIsolatedTestEnvironment } from "../test-helpers";
import type { Event, Catalog, Dataset } from "@/payload-types";
import { vi } from "vitest";

import { getPayload } from "payload";

describe.sequential("Events API Route", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
    
    // Store payload globally for API routes to use in test mode
    (global as any).__TEST_PAYLOAD__ = payload;
  });

  afterAll(async () => {
    if (testEnv && testEnv.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clean database before each test - be more thorough
    await testEnv.seedManager.truncate();

    // Force wait for any pending database operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Use raw SQL to ensure complete deletion
    try {
      await payload.db.drizzle.execute(`DELETE FROM events WHERE 1=1`);
      await payload.db.drizzle.execute(`DELETE FROM datasets WHERE 1=1`);
      await payload.db.drizzle.execute(`DELETE FROM catalogs WHERE 1=1`);
    } catch (e) {
      console.warn("Raw SQL cleanup failed:", e);
    }

    // Also manually clear all collections to ensure clean state
    try {
      await payload.delete({
        collection: "events",
        where: {},
      });
    } catch (e) {}

    try {
      await payload.delete({
        collection: "datasets",
        where: {},
      });
    } catch (e) {}

    try {
      await payload.delete({
        collection: "catalogs",
        where: {},
      });
    } catch (e) {}

    // Double check that the database is clean
    const remainingEvents = await payload.find({
      collection: "events",
      limit: 1,
    });

    if (remainingEvents.docs.length > 0) {
      console.warn(
        `Database not clean before test - found ${remainingEvents.totalDocs} events`,
      );
      // Try again with more thorough cleanup
      await payload.db.drizzle.execute(`TRUNCATE events CASCADE`);
      await payload.db.drizzle.execute(`TRUNCATE datasets CASCADE`);
      await payload.db.drizzle.execute(`TRUNCATE catalogs CASCADE`);

      // Check again
      const stillRemaining = await payload.find({
        collection: "events",
        limit: 1,
      });

      if (stillRemaining.docs.length > 0) {
        throw new Error(
          `Database cleanup failed - still found ${stillRemaining.totalDocs} events after TRUNCATE`,
        );
      }
    }
  });

  // Helper functions to create test data with explicit slugs to avoid hook issues
  const createTestCatalog = async (name: string) => {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    return await payload.create({
      collection: "catalogs",
      data: {
        name,
        slug, // Provide explicit slug to avoid hook validation issues
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: `${name} description` }],
              },
            ],
          },
        },
        status: "active",
      },
    });
  };

  const createTestDataset = async (name: string, catalog: any) => {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    return await payload.create({
      collection: "datasets",
      data: {
        name,
        slug, // Provide explicit slug to avoid hook validation issues
        catalog: typeof catalog === "object" ? catalog.id : catalog,
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: `${name} description` }],
              },
            ],
          },
        },
        language: "eng",
        status: "active",
        isPublic: true,
        schema: { type: "object", properties: {} },
      },
    });
  };

  const createTestEvent = async (
    data: any,
    location: any,
    dataset: any,
    eventTimestamp?: string | null,
  ) => {
    const slug = `${(data.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    return await payload.create({
      collection: "events",
      data: {
        data,
        location,
        dataset: typeof dataset === "object" ? dataset.id : dataset,
        eventTimestamp:
          eventTimestamp === null
            ? undefined
            : eventTimestamp || new Date().toISOString(),
        isValid: true,
        slug, // Provide explicit slug to avoid hook validation issues
      },
    });
  };

  test("returns all events without filters", async () => {
    // Create real test data
    const catalog1 = await createTestCatalog("Environmental Data");
    const catalog2 = await createTestCatalog("Economic Data");

    const dataset1 = await createTestDataset("Air Quality", catalog1);
    const dataset2 = await createTestDataset("Water Quality", catalog1);
    const dataset3 = await createTestDataset("GDP Data", catalog2);

    // Create events with different locations and timestamps
    const event1 = await createTestEvent(
      { title: "Berlin Air Quality", city: "Berlin", country: "Germany" },
      { longitude: 13.405, latitude: 52.52 },
      dataset1,
      "2024-06-15T10:00:00Z",
    );

    const event2 = await createTestEvent(
      { title: "Paris Water Quality", city: "Paris", country: "France" },
      { longitude: 2.3522, latitude: 48.8566 },
      dataset2,
      "2024-06-16T14:30:00Z",
    );

    const event3 = await createTestEvent(
      { title: "London GDP Report", city: "London", country: "UK" },
      { longitude: -0.1276, latitude: 51.5074 },
      dataset3,
      "2024-06-17T09:15:00Z",
    );

    // Test API route with no filters
    const request = new NextRequest("http://localhost:3000/api/events");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(3);
    expect(data.totalDocs).toBe(3);

    // Verify the serialized structure matches what the API returns
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Berlin Air Quality");
    expect(eventTitles).toContain("Paris Water Quality");
    expect(eventTitles).toContain("London GDP Report");

    // Verify proper serialization
    expect(data.docs[0]).toMatchObject({
      id: expect.any(Number),
      data: expect.objectContaining({
        title: expect.any(String),
      }),
      location: expect.objectContaining({
        longitude: expect.any(Number),
        latitude: expect.any(Number),
      }),
      eventTimestamp: expect.any(String),
      dataset: expect.any(Number),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  test("filters events by catalog", async () => {
    // Create real test data
    const catalog1 = await createTestCatalog("Environmental Data");
    const catalog2 = await createTestCatalog("Economic Data");

    const dataset1 = await createTestDataset("Air Quality", catalog1);
    const dataset2 = await createTestDataset("Water Quality", catalog1);
    const dataset3 = await createTestDataset("GDP Data", catalog2);

    // Create events in different catalogs
    const event1 = await createTestEvent(
      { title: "Environmental Event 1" },
      { longitude: 13.405, latitude: 52.52 },
      dataset1,
    );

    const event2 = await createTestEvent(
      { title: "Environmental Event 2" },
      { longitude: 2.3522, latitude: 48.8566 },
      dataset2,
    );

    const event3 = await createTestEvent(
      { title: "Economic Event" },
      { longitude: -0.1276, latitude: 51.5074 },
      dataset3,
    );

    // Test filtering by environmental-data catalog (use the generated slug)
    const url = new URL(
      `http://localhost:3000/api/events?catalog=${catalog1.slug}`,
    );
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(2);
    expect(data.totalDocs).toBe(2);

    // Verify only environmental events are returned
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Environmental Event 1");
    expect(eventTitles).toContain("Environmental Event 2");
    expect(eventTitles).not.toContain("Economic Event");
  });

  test("filters events by multiple datasets", async () => {
    // Create real test data
    const catalog1 = await createTestCatalog("Environmental Data");
    const catalog2 = await createTestCatalog("Economic Data");

    const dataset1 = await createTestDataset("Air Quality", catalog1);
    const dataset2 = await createTestDataset("Water Quality", catalog1);
    const dataset3 = await createTestDataset("GDP Data", catalog2);

    // Create events in different datasets
    const event1 = await createTestEvent(
      { title: "Air Quality Event" },
      { longitude: 13.405, latitude: 52.52 },
      dataset1,
    );

    const event2 = await createTestEvent(
      { title: "Water Quality Event" },
      { longitude: 2.3522, latitude: 48.8566 },
      dataset2,
    );

    const event3 = await createTestEvent(
      { title: "GDP Event" },
      { longitude: -0.1276, latitude: 51.5074 },
      dataset3,
    );

    // Test filtering by multiple datasets using slugs
    const url = new URL(
      `http://localhost:3000/api/events?datasets=${dataset1.slug}&datasets=${dataset2.slug}`,
    );
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(2);
    expect(data.totalDocs).toBe(2);

    // Verify only events from specified datasets are returned
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Air Quality Event");
    expect(eventTitles).toContain("Water Quality Event");
    expect(eventTitles).not.toContain("GDP Event");
  });

  test("filters events by geographic bounds", async () => {
    // Create real test data
    const catalog = await createTestCatalog("Test Catalog");
    const dataset = await createTestDataset("Test Dataset", catalog);

    // Create events at different locations
    const berlinEvent = await createTestEvent(
      { title: "Berlin Event" },
      { longitude: 13.405, latitude: 52.52 }, // Inside bounds
      dataset,
    );

    const parisEvent = await createTestEvent(
      { title: "Paris Event" },
      { longitude: 2.3522, latitude: 48.8566 }, // Outside bounds
      dataset,
    );

    const munichEvent = await createTestEvent(
      { title: "Munich Event" },
      { longitude: 11.576, latitude: 48.1351 }, // Outside bounds
      dataset,
    );

    // Test filtering by geographic bounds (should only include Berlin)
    const bounds = JSON.stringify({
      west: 13.0,
      east: 14.0,
      south: 52.0,
      north: 53.0,
    });

    const url = new URL(
      `http://localhost:3000/api/events?bounds=${encodeURIComponent(bounds)}`,
    );
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(1);
    expect(data.totalDocs).toBe(1);

    // Verify only events within bounds are returned
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Berlin Event");
    expect(eventTitles).not.toContain("Paris Event");
    expect(eventTitles).not.toContain("Munich Event");

    // Verify location is within bounds
    const returnedEvent = data.docs[0];
    expect(returnedEvent.location.longitude).toBeGreaterThanOrEqual(13.0);
    expect(returnedEvent.location.longitude).toBeLessThanOrEqual(14.0);
    expect(returnedEvent.location.latitude).toBeGreaterThanOrEqual(52.0);
    expect(returnedEvent.location.latitude).toBeLessThanOrEqual(53.0);
  });

  test("filters events by date range", async () => {
    // Create real test data
    const catalog = await createTestCatalog("Test Catalog");
    const dataset = await createTestDataset("Test Dataset", catalog);

    // Create events with different timestamps
    const event1 = await createTestEvent(
      { title: "June Event" },
      { longitude: 13.405, latitude: 52.52 },
      dataset,
      "2024-06-15T10:00:00Z", // Within date range
    );

    const event2 = await createTestEvent(
      { title: "May Event" },
      { longitude: 2.3522, latitude: 48.8566 },
      dataset,
      "2024-05-15T10:00:00Z", // Before date range
    );

    const event3 = await createTestEvent(
      { title: "July Event" },
      { longitude: -0.1276, latitude: 51.5074 },
      dataset,
      "2024-07-15T10:00:00Z", // After date range
    );

    // Test filtering by date range
    const url = new URL(
      "http://localhost:3000/api/events?startDate=2024-06-01&endDate=2024-06-30",
    );
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    if (response.status !== 200) {
      console.error("Date filter test failed:", {
        status: response.status,
        data,
        url: url.toString(),
      });
    }

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(1);
    expect(data.totalDocs).toBe(1);

    // Verify only events within date range are returned
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("June Event");
    expect(eventTitles).not.toContain("May Event");
    expect(eventTitles).not.toContain("July Event");

    // Verify the returned event has the correct timestamp
    const returnedEvent = data.docs[0];
    const eventDate = new Date(returnedEvent.eventTimestamp);
    expect(eventDate).toBeInstanceOf(Date);
    expect(eventDate.getFullYear()).toBe(2024);
    expect(eventDate.getMonth()).toBe(5); // June (0-indexed)
  });

  test("combines multiple filters correctly", async () => {
    // Create real test data
    const catalog1 = await createTestCatalog("Environmental Data");
    const catalog2 = await createTestCatalog("Economic Data");

    const dataset1 = await createTestDataset("Air Quality", catalog1);
    const dataset2 = await createTestDataset("GDP Data", catalog2);

    // Create events with different properties
    const matchingEvent = await createTestEvent(
      { title: "Berlin Environmental Event" },
      { longitude: 13.405, latitude: 52.52 }, // Within bounds
      dataset1, // Environmental catalog
      "2024-06-15T10:00:00Z", // Within date range
    );

    const wrongCatalogEvent = await createTestEvent(
      { title: "Berlin Economic Event" },
      { longitude: 13.405, latitude: 52.52 }, // Within bounds
      dataset2, // Economic catalog (wrong)
      "2024-06-15T10:00:00Z", // Within date range
    );

    const wrongLocationEvent = await createTestEvent(
      { title: "Paris Environmental Event" },
      { longitude: 2.3522, latitude: 48.8566 }, // Outside bounds
      dataset1, // Environmental catalog
      "2024-06-15T10:00:00Z", // Within date range
    );

    const wrongDateEvent = await createTestEvent(
      { title: "Berlin Environmental Event Old" },
      { longitude: 13.405, latitude: 52.52 }, // Within bounds
      dataset1, // Environmental catalog
      "2024-05-15T10:00:00Z", // Outside date range
    );

    // Test combined filters: environmental catalog + Berlin bounds + June dates
    const bounds = JSON.stringify({
      west: 13.0,
      east: 14.0,
      south: 52.0,
      north: 53.0,
    });

    const url = new URL(
      `http://localhost:3000/api/events?catalog=${catalog1.slug}&startDate=2024-06-01&endDate=2024-06-30&bounds=${encodeURIComponent(bounds)}`,
    );
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);

    expect(data.docs).toHaveLength(1);
    expect(data.totalDocs).toBe(1);

    // Verify only the event that matches all filters is returned
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Berlin Environmental Event");
    expect(eventTitles).not.toContain("Berlin Economic Event"); // Wrong catalog
    expect(eventTitles).not.toContain("Paris Environmental Event"); // Wrong location
    expect(eventTitles).not.toContain("Berlin Environmental Event Old"); // Wrong date

    // Verify the returned event meets all criteria
    const returnedEvent = data.docs[0];
    expect(returnedEvent.location.longitude).toBeGreaterThanOrEqual(13.0);
    expect(returnedEvent.location.longitude).toBeLessThanOrEqual(14.0);
    expect(returnedEvent.location.latitude).toBeGreaterThanOrEqual(52.0);
    expect(returnedEvent.location.latitude).toBeLessThanOrEqual(53.0);

    const eventDate = new Date(returnedEvent.eventTimestamp);
    expect(eventDate.getFullYear()).toBe(2024);
    expect(eventDate.getMonth()).toBe(5); // June (0-indexed)
  });

  test("handles invalid bounds parameter gracefully", async () => {
    // Create real test data
    const catalog = await createTestCatalog("Test Catalog");
    const dataset = await createTestDataset("Test Dataset", catalog);

    const event = await createTestEvent(
      { title: "Test Event" },
      { longitude: 13.405, latitude: 52.52 },
      dataset,
    );

    // Test with invalid bounds parameter
    const url = new URL("http://localhost:3000/api/events?bounds=invalid-json");
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(1);
    expect(data.totalDocs).toBe(1);

    // Should ignore invalid bounds and return all events
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Test Event");
  });

  test("handles database errors gracefully", async () => {
    // Force a database error by trying to query a non-existent collection
    // We'll simulate this by creating a malformed request that would cause Payload to fail

    // Create a URL that would cause database issues due to invalid data
    const url = new URL("http://localhost:3000/api/events");
    const request = new NextRequest(url);

    // Mock the payload to simulate a database error
    const originalPayload = payload.find;
    payload.find = async () => {
      throw new Error("Database connection failed");
    };

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch events");

    // Restore the original payload method
    payload.find = originalPayload;
  });

  test("serializes complex event data correctly", async () => {
    // Create real test data with complex nested structure
    const catalog = await createTestCatalog("Test Catalog");
    const dataset = await createTestDataset("Test Dataset", catalog);

    const complexEvent = await createTestEvent(
      {
        title: "Complex Event",
        nested: {
          field: "value",
          array: [1, 2, 3],
        },
        date: "2024-06-15",
        tags: ["environment", "monitoring"],
        measurements: {
          temperature: 25.5,
          humidity: 60,
        },
      },
      { longitude: 13.405, latitude: 52.52 },
      dataset,
    );

    const request = new NextRequest("http://localhost:3000/api/events");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(1);

    // Verify complex data is properly serialized
    const event = data.docs[0];
    expect(event.data.nested.field).toBe("value");
    expect(event.data.nested.array).toEqual([1, 2, 3]);
    expect(event.data.tags).toEqual(["environment", "monitoring"]);
    expect(event.data.measurements.temperature).toBe(25.5);
    expect(event.data.measurements.humidity).toBe(60);

    // Verify the event has all expected serialized fields
    expect(event).toHaveProperty("id");
    expect(event).toHaveProperty("data");
    expect(event).toHaveProperty("location");
    expect(event).toHaveProperty("eventTimestamp");
    expect(event).toHaveProperty("dataset");
    expect(event).toHaveProperty("createdAt");
    expect(event).toHaveProperty("updatedAt");

    // Verify geocodingInfo is not included in serialization (if it exists)
    expect(event).not.toHaveProperty("geocodingInfo");
  });

  test("handles empty dataset parameter arrays", async () => {
    // Create real test data
    const catalog = await createTestCatalog("Test Catalog");
    const dataset = await createTestDataset("Test Dataset", catalog);

    const event = await createTestEvent(
      { title: "Test Event" },
      { longitude: 13.405, latitude: 52.52 },
      dataset,
    );

    // Test with empty datasets parameter
    const url = new URL("http://localhost:3000/api/events?datasets=");
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs).toHaveLength(1);
    expect(data.totalDocs).toBe(1);

    // Should not add dataset filter for empty datasets and return all events
    const eventTitles = data.docs.map((e: any) => e.data.title);
    expect(eventTitles).toContain("Test Event");
  });

  test("tests date filtering with data fields", async () => {
    // Create real test data with dates in the data field
    const catalog = await createTestCatalog("Test Catalog");
    const dataset = await createTestDataset("Test Dataset", catalog);

    // Create events with dates in data fields (not just eventTimestamp)
    const event1 = await createTestEvent(
      {
        title: "Event with startDate",
        startDate: "2024-06-15T10:00:00Z",
        endDate: "2024-06-16T10:00:00Z",
      },
      { longitude: 13.405, latitude: 52.52 },
      dataset,
      null, // No eventTimestamp, should rely on data fields
    );

    const event2 = await createTestEvent(
      {
        title: "Event with date field",
        date: "2024-06-20T10:00:00Z",
      },
      { longitude: 2.3522, latitude: 48.8566 },
      dataset,
      null, // No eventTimestamp
    );

    const event3 = await createTestEvent(
      {
        title: "Event outside range",
        date: "2024-05-15T10:00:00Z",
      },
      { longitude: -0.1276, latitude: 51.5074 },
      dataset,
      null, // No eventTimestamp
    );

    // Test date filtering - should work with data fields
    const url = new URL(
      "http://localhost:3000/api/events?startDate=2024-06-01&endDate=2024-06-30",
    );
    const request = new NextRequest(url);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.docs.length).toBeGreaterThan(0);

    // Verify that events within date range are returned
    const eventTitles = data.docs.map((e: any) => e.data.title);

    // Should include events with dates in June
    expect(eventTitles).toContain("Event with startDate");
    expect(eventTitles).toContain("Event with date field");

    // Should not include events outside date range
    expect(eventTitles).not.toContain("Event outside range");
  });
});
