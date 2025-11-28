/**
 * Integration tests for consistent access control across all event API endpoints.
 *
 * Verifies that all event APIs (list, temporal, geo, bounds, stats) return
 * consistent results when filtering by private catalogs/datasets.
 * Anonymous users should see 0 results for private data across ALL endpoints.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getBounds } from "@/app/api/v1/events/bounds/route";
import { GET as getGeo } from "@/app/api/v1/events/geo/route";
import { GET as getGeoStats } from "@/app/api/v1/events/geo/stats/route";
import { GET as getEvents } from "@/app/api/v1/events/route";
import { GET as getTemporal } from "@/app/api/v1/events/temporal/route";

import type { TestEnvironment } from "../../setup/integration/environment";

describe("Event API Access Control Consistency", () => {
  let payload: Payload;
  let testEnv: TestEnvironment;
  let privateCatalogId: number;
  let privateDatasetId: number;
  let publicCatalogId: number;
  let publicDatasetId: number;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset } = await import(
      "../../setup/integration/environment"
    );
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // Create a PRIVATE catalog and dataset
    const { catalog: privateCatalog } = await withCatalog(testEnv, {
      name: "Private Test Catalog",
      description: "Private catalog for access control tests",
      isPublic: false,
    });
    privateCatalogId = privateCatalog.id;

    const { dataset: privateDataset } = await withDataset(testEnv, privateCatalog.id, {
      name: "Private Test Dataset",
      isPublic: false,
    });
    privateDatasetId = privateDataset.id;

    // Create a PUBLIC catalog and dataset for comparison
    const { catalog: publicCatalog } = await withCatalog(testEnv, {
      name: "Public Test Catalog",
      description: "Public catalog for access control tests",
      isPublic: true,
    });
    publicCatalogId = publicCatalog.id;

    const { dataset: publicDataset } = await withDataset(testEnv, publicCatalog.id, {
      name: "Public Test Dataset",
      isPublic: true,
    });
    publicDatasetId = publicDataset.id;

    // Create events in the PRIVATE dataset
    for (let i = 0; i < 5; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `private-event-${Date.now()}-${i}`,
          dataset: privateDatasetId,
          data: { title: `Private Event ${i + 1}` },
          location: {
            latitude: 52.52 + i * 0.01,
            longitude: 13.405 + i * 0.01,
          },
          eventTimestamp: new Date(2024, 5, 15 + i).toISOString(),
        },
      });
    }

    // Create events in the PUBLIC dataset
    for (let i = 0; i < 3; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `public-event-${Date.now()}-${i}`,
          dataset: publicDatasetId,
          data: { title: `Public Event ${i + 1}` },
          location: {
            latitude: 40.7128 + i * 0.01,
            longitude: -74.006 + i * 0.01,
          },
          eventTimestamp: new Date(2024, 6, 10 + i).toISOString(),
        },
      });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      try {
        await testEnv.cleanup();
      } catch {
        // Cleanup error - silently continue
      }
    }
  });

  describe("Anonymous user accessing PRIVATE catalog", () => {
    it("events list API should return 0 events", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events?catalog=${privateCatalogId}`);
      const response = await getEvents(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.events).toHaveLength(0);
      expect(data.pagination.totalDocs).toBe(0);
    });

    it("temporal API should return 0 events in histogram", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events/temporal?catalog=${privateCatalogId}`);
      const response = await getTemporal(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      // The histogram should have no data for the private catalog
      const totalCount = data.histogram.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0);
      expect(totalCount).toBe(0);
      expect(data.metadata.total).toBe(0);
    });

    it("geo API should return empty features", async () => {
      const bounds = { north: 53, south: 52, east: 14, west: 13 };
      const request = new NextRequest(
        `http://localhost:3000/api/v1/events/geo?catalog=${privateCatalogId}&zoom=10&bounds=${encodeURIComponent(JSON.stringify(bounds))}`
      );
      const response = await getGeo(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.type).toBe("FeatureCollection");
      expect(data.features).toHaveLength(0);
    });

    it("geo/stats API should return default stats (no real data)", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events/geo/stats?catalog=${privateCatalogId}`);
      const response = await getGeoStats(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Should return default cluster stats when no access
      expect(data.p20).toBeDefined();
      expect(data.p100).toBeDefined();
    });

    it("bounds API should return null bounds and 0 count", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events/bounds?catalog=${privateCatalogId}`);
      const response = await getBounds(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.bounds).toBeNull();
      expect(data.count).toBe(0);
    });
  });

  describe("Anonymous user accessing PUBLIC catalog", () => {
    it("events list API should return events", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events?catalog=${publicCatalogId}`);
      const response = await getEvents(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.events.length).toBeGreaterThan(0);
      expect(data.pagination.totalDocs).toBeGreaterThan(0);
    });

    it("temporal API should return events in histogram", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events/temporal?catalog=${publicCatalogId}`);
      const response = await getTemporal(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.metadata.total).toBeGreaterThan(0);
    });

    it("bounds API should return valid bounds", async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/events/bounds?catalog=${publicCatalogId}`);
      const response = await getBounds(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.bounds).not.toBeNull();
      expect(data.count).toBeGreaterThan(0);
    });
  });

  describe("All APIs should be consistent", () => {
    it("private catalog should return 0/empty across ALL endpoints", async () => {
      // Gather results from all endpoints
      const bounds = { north: 53, south: 52, east: 14, west: 13 };
      const [eventsRes, temporalRes, boundsRes, geoRes] = await Promise.all([
        getEvents(new NextRequest(`http://localhost:3000/api/v1/events?catalog=${privateCatalogId}`), {
          params: Promise.resolve({}),
        }),
        getTemporal(new NextRequest(`http://localhost:3000/api/v1/events/temporal?catalog=${privateCatalogId}`), {
          params: Promise.resolve({}),
        }),
        getBounds(new NextRequest(`http://localhost:3000/api/v1/events/bounds?catalog=${privateCatalogId}`), {
          params: Promise.resolve({}),
        }),
        getGeo(
          new NextRequest(
            `http://localhost:3000/api/v1/events/geo?catalog=${privateCatalogId}&zoom=10&bounds=${encodeURIComponent(JSON.stringify(bounds))}`
          ),
          { params: Promise.resolve({}) }
        ),
      ]);

      const eventsData = await eventsRes.json();
      const temporalData = await temporalRes.json();
      const boundsData = await boundsRes.json();
      const geoData = await geoRes.json();

      // All should consistently report 0 events for private catalog
      expect(eventsData.pagination.totalDocs).toBe(0);
      expect(temporalData.metadata.total).toBe(0);
      expect(boundsData.count).toBe(0);
      expect(geoData.features).toHaveLength(0);
    });
  });
});
