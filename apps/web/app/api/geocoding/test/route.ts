/**
 * Geocoding test API endpoint.
 *
 * Allows admins to test the geocoding configuration with a sample address.
 * Returns results from all configured providers for comparison.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";

export const POST = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  body: z.object({ address: z.string().min(1) }),
  handler: async ({ body, payload }) => {
    const { GeocodingService } = await import("@/lib/services/geocoding");
    const service = new GeocodingService(payload);
    return service.testConfiguration(body.address);
  },
});
