/**
 * Integration tests for events list API with display configuration.
 *
 * Tests that the events list API correctly includes fieldMetadata and
 * displayConfig, and that custom display configurations are properly
 * returned to the client.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";

import { GET } from "../../../app/api/events/list/route";
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe("Events List API - Display Configuration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  afterEach(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it("should include fieldMetadata in API response", async () => {
    testEnv = await createIntegrationTestEnvironment();

    const { payload, user } = testEnv;

    // Create a catalog and dataset with field metadata
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Test Catalog",
        slug: "test-catalog",
        isPublic: true,
        createdBy: user.id,
      },
      user,
    });

    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Test Dataset",
        slug: "test-dataset",
        language: "eng",
        catalog: catalog.id,
        isPublic: true,
        fieldMetadata: {
          title: {
            path: "title",
            occurrences: 100,
            occurrencePercent: 100,
            uniqueValues: 95,
            typeDistribution: { string: 100 },
          },
          description: {
            path: "description",
            occurrences: 90,
            occurrencePercent: 90,
            uniqueValues: 85,
            typeDistribution: { string: 90 },
          },
        },
      },
      user,
    });

    // Create an event
    await payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        data: {
          title: "Test Event",
          description: "Test Description",
        },
        uniqueId: "test-event-1",
        validationStatus: "valid",
        _status: "published",
      },
      user,
    });

    // Call the API
    const url = new URL("http://localhost:3000/api/events/list");
    const request = new NextRequest(url);

    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toBeDefined();
    expect(data.events.length).toBeGreaterThan(0);

    // Check that fieldMetadata is included
    const event = data.events[0];
    expect(event?.dataset?.fieldMetadata).toBeDefined();
    expect(event?.dataset?.fieldMetadata?.title).toBeDefined();
    expect(event?.dataset?.fieldMetadata?.title?.path).toBe("title");
    expect(event?.dataset?.fieldMetadata?.description).toBeDefined();
  });

  it("should include displayConfig in API response", async () => {
    testEnv = await createIntegrationTestEnvironment();

    const { payload, user } = testEnv;

    // Create a catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Test Catalog",
        slug: "test-catalog-config",
        isPublic: true,
        createdBy: user.id,
      },
      user,
    });

    // Create a dataset with custom display config
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Test Dataset with Config",
        slug: "test-dataset-config",
        language: "eng",
        catalog: catalog.id,
        isPublic: true,
        fieldMetadata: {
          event_name: {
            path: "event_name",
            occurrences: 100,
            occurrencePercent: 100,
            uniqueValues: 95,
            typeDistribution: { string: 100 },
          },
          venue: {
            path: "venue",
            occurrences: 100,
            occurrencePercent: 100,
            uniqueValues: 40,
            typeDistribution: { string: 100 },
          },
          price: {
            path: "price",
            occurrences: 80,
            occurrencePercent: 80,
            uniqueValues: 20,
            typeDistribution: { number: 80 },
          },
        },
        displayConfig: {
          primaryLabelField: "event_name",
          displayFields: [
            { fieldPath: "venue", label: "Location" },
            { fieldPath: "price", label: "Ticket Price" },
          ],
          maxDisplayFields: 2,
        },
      },
      user,
    });

    // Create an event
    await payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        data: {
          event_name: "Rock Concert",
          venue: "Madison Square Garden",
          price: 75,
        },
        uniqueId: "test-event-2",
        validationStatus: "valid",
        _status: "published",
      },
      user,
    });

    // Call the API
    const url = new URL("http://localhost:3000/api/events/list");
    const request = new NextRequest(url);

    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toBeDefined();

    // Find our event
    const event = data.events.find((e: { data: { event_name?: string } }) => e.data?.event_name === "Rock Concert");
    expect(event).toBeDefined();

    // Check that displayConfig is included
    expect(event?.dataset?.displayConfig).toBeDefined();
    expect(event?.dataset?.displayConfig?.primaryLabelField).toBe("event_name");
    expect(event?.dataset?.displayConfig?.displayFields).toHaveLength(2);
    expect(event?.dataset?.displayConfig?.displayFields?.[0]?.fieldPath).toBe("venue");
    expect(event?.dataset?.displayConfig?.displayFields?.[0]?.label).toBe("Location");
    expect(event?.dataset?.displayConfig?.maxDisplayFields).toBe(2);
  });

  it("should work with events that have no display config", async () => {
    testEnv = await createIntegrationTestEnvironment();

    const { payload, user } = testEnv;

    // Create a catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Test Catalog No Config",
        slug: "test-catalog-no-config",
        isPublic: true,
        createdBy: user.id,
      },
      user,
    });

    // Create a dataset WITHOUT display config
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Test Dataset No Config",
        slug: "test-dataset-no-config",
        language: "eng",
        catalog: catalog.id,
        isPublic: true,
        fieldMetadata: {
          station_id: {
            path: "station_id",
            occurrences: 100,
            occurrencePercent: 100,
            uniqueValues: 50,
            typeDistribution: { string: 100 },
          },
        },
      },
      user,
    });

    // Create an event
    await payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        data: {
          station_id: "STATION-001",
          measurement: "temperature",
          value: 23.5,
        },
        uniqueId: "test-event-3",
        validationStatus: "valid",
        _status: "published",
      },
      user,
    });

    // Call the API
    const url = new URL("http://localhost:3000/api/events/list");
    const request = new NextRequest(url);

    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toBeDefined();

    // Should still return fieldMetadata even without displayConfig
    const event = data.events.find((e: { data: { station_id?: string } }) => e.data?.station_id === "STATION-001");
    expect(event).toBeDefined();
    expect(event?.dataset?.fieldMetadata).toBeDefined();
    // displayConfig should be undefined or null
    expect(event?.dataset?.displayConfig).toBeUndefined();
  });

  it("should include geocodingInfo in API response", async () => {
    testEnv = await createIntegrationTestEnvironment();

    const { payload, user } = testEnv;

    // Create a catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Test Catalog Geocoding",
        slug: "test-catalog-geocoding",
        isPublic: true,
        createdBy: user.id,
      },
      user,
    });

    // Create a dataset
    const dataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Test Dataset Geocoding",
        slug: "test-dataset-geocoding",
        language: "eng",
        catalog: catalog.id,
        isPublic: true,
      },
      user,
    });

    // Create an event with geocoding info
    await payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        data: {
          name: "Event with Location",
        },
        location: {
          latitude: 40.7128,
          longitude: -74.006,
        },
        geocodingInfo: {
          normalizedAddress: "New York, NY, USA",
          originalAddress: "NYC",
        },
        uniqueId: "test-event-4",
        validationStatus: "valid",
        _status: "published",
      },
      user,
    });

    // Call the API
    const url = new URL("http://localhost:3000/api/events/list");
    const request = new NextRequest(url);

    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);

    // Find our event
    const event = data.events.find(
      (e: { geocodingInfo?: { normalizedAddress?: string } }) =>
        e.geocodingInfo?.normalizedAddress === "New York, NY, USA"
    );
    expect(event).toBeDefined();
    expect(event?.geocodingInfo?.normalizedAddress).toBe("New York, NY, USA");
    expect(event?.geocodingInfo?.originalAddress).toBe("NYC");
    expect(event?.location?.latitude).toBe(40.7128);
    expect(event?.location?.longitude).toBe(-74.006);
  });
});
