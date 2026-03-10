/**
 * API endpoint for fetching feature flags.
 *
 * Returns the current feature flag configuration for client-side use.
 * Used by UI components to adapt based on enabled/disabled features.
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { logError } from "@/lib/logger";
import { getDefaultFeatureFlags, getFeatureFlags } from "@/lib/services/feature-flag-service";

export const GET = apiRoute({
  auth: "none",
  handler: async ({ payload }) => {
    try {
      const flags = await getFeatureFlags(payload);

      return new Response(JSON.stringify(flags), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      });
    } catch (error) {
      logError(error, "Failed to fetch feature flags");
      // Return defaults on error to prevent UI breakage
      return Response.json(getDefaultFeatureFlags());
    }
  },
});
