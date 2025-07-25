import { NextRequest } from "next/server";

import { GET } from "../../../app/api/events/map-clusters/route";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";

describe("Map-clusters API test", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  afterEach(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it("should handle map-clusters API request without errors", async () => {
    try {
      testEnv = await createIsolatedTestEnvironment();


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
        }),
      );
      url.searchParams.set("zoom", "10");

      const request = new NextRequest(url);

      // Call the API route
      const response = await GET(request);

      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`API returned ${response.status}: ${data.error || "Unknown error"} - ${data.details || ""}`);
      }

      expect(data).toBeDefined();
      expect(data.type).toBe("FeatureCollection");
      expect(Array.isArray(data.features)).toBe(true);
    } catch (error) {
      throw error;
    } finally {
      // Payload cleanup handled automatically
    }
  });
});
