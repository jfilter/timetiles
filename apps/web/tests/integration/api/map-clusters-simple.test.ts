import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";
import { GET } from "../../../app/api/events/map-clusters/route";

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

      // Debug: inspect the payload instance structure
      console.log("Payload instance keys:", Object.keys(testEnv.payload));
      console.log("Payload db:", testEnv.payload.db);
      console.log(
        "Payload db keys:",
        testEnv.payload.db ? Object.keys(testEnv.payload.db) : "undefined",
      );
      if (testEnv.payload.db) {
        console.log("Payload db drizzle:", testEnv.payload.db.drizzle);
        console.log("Payload db type:", typeof testEnv.payload.db);

        // Check if there's an adapter property
        if (testEnv.payload.db.adapter) {
          console.log("DB adapter:", testEnv.payload.db.adapter);
          console.log(
            "DB adapter keys:",
            Object.keys(testEnv.payload.db.adapter),
          );
        }
      }

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

      console.log("Response status:", response.status);

      const data = await response.json();
      console.log("Response data:", data);

      if (response.status !== 200) {
        console.error("API Error response:", data);
        throw new Error(
          `API returned ${response.status}: ${data.error || "Unknown error"} - ${data.details || ""}`,
        );
      }

      expect(data).toBeDefined();
      expect(data.type).toBe("FeatureCollection");
      expect(Array.isArray(data.features)).toBe(true);
    } catch (error) {
      console.error("API test error:", error);
      throw error;
    } finally {
      // Payload cleanup handled automatically
    }
  });
});
