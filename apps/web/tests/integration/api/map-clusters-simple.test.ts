/**
 * Integration tests for map clustering API endpoint.
 *
 * Tests server-side clustering of events for map display,
 * including zoom-based clustering and geospatial queries.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";

import { GET } from "../../../app/api/events/map-clusters/route";
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe("Map-clusters API test", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  afterEach(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it("should handle map-clusters API request without errors", async () => {
    try {
      testEnv = await createIntegrationTestEnvironment();

      // API routes now use getPayload({ config }) directly

      // Create a mock request with bounds parameter
      const url = new URL("http://localhost:3000/api/events/map-clusters");
      url.searchParams.set(
        "bounds",
        JSON.stringify({
          north: 40.7589,
          south: 40.7489,
          east: -73.9741,
          west: -73.9841,
        })
      );
      url.searchParams.set("zoom", "10");

      const request = new NextRequest(url);

      // Call the API route
      const response = await GET(request, { params: Promise.resolve({}) });

      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`API returned ${response.status}: ${data.error || "Unknown error"} - ${data.details || ""}`);
      }

      expect(data).toBeDefined();
      expect(data.type).toBe("FeatureCollection");
      expect(Array.isArray(data.features)).toBe(true);
    } finally {
      // Payload cleanup handled automatically
    }
  });
});
