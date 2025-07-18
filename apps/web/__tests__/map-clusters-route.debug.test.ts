import { describe, it, expect } from "vitest";
import { GET } from "../app/api/events/map-clusters/route";
import { NextRequest } from "next/server";

describe("Debug /api/events/map-clusters", () => {
  it("should check basic functionality", async () => {
    const bounds = {
      north: 90,
      south: -90,
      east: 180,
      west: -180,
    };

    const request = new NextRequest(
      `http://localhost:3000/api/events/map-clusters?bounds=${encodeURIComponent(
        JSON.stringify(bounds)
      )}&zoom=2`
    );

    try {
      const response = await GET(request);
      const data = await response.json();
      
      console.log("Response status:", response.status);
      console.log("Response data:", JSON.stringify(data, null, 2));
      
      expect(response.status).toBeLessThan(500);
    } catch (error) {
      console.error("Handler error:", error);
      throw error;
    }
  });
});