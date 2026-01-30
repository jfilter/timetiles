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
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { badRequest, internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

interface TestRequest {
  address: string;
}

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const payload = await getPayload({ config });

    const body = (await request.json()) as TestRequest;
    const { address } = body;

    if (!address || typeof address !== "string") {
      return badRequest("Address is required");
    }

    // Import the geocoding service
    const { GeocodingService } = await import("@/lib/services/geocoding/geocoding-service");

    const service = new GeocodingService(payload);
    const results = await service.testConfiguration(address);

    return NextResponse.json(results);
  } catch (error) {
    logError(error, "Geocoding test error");
    return internalError("Geocoding test error");
  }
});
