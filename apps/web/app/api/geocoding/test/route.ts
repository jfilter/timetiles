/**
 * Geocoding test API endpoint.
 *
 * Allows testing the geocoding configuration with a sample address.
 * Returns results from all configured providers for comparison.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import config from "@/payload.config";

interface TestRequest {
  address: string;
}

export const POST = async (request: Request) => {
  try {
    const payload = await getPayload({ config });

    // Check authentication
    const { user } = await payload.auth({ headers: request.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as TestRequest;
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    // Import the geocoding service
    const { GeocodingService } = await import("@/lib/services/geocoding/geocoding-service");

    const service = new GeocodingService(payload);
    const results = await service.testConfiguration(address);

    return NextResponse.json(results);
  } catch (error) {
    logError(error, "Geocoding test error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
