/**
 * API endpoint for fetching feature flags.
 *
 * Returns the current feature flag configuration for client-side use.
 * Used by UI components to adapt based on enabled/disabled features.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import { getDefaultFeatureFlags, getFeatureFlags } from "@/lib/services/feature-flag-service";
import config from "@/payload.config";

export const GET = async (): Promise<Response> => {
  try {
    const payload = await getPayload({ config });
    const flags = await getFeatureFlags(payload);

    return NextResponse.json(flags, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    logError(error, "Failed to fetch feature flags");
    // Return defaults on error to prevent UI breakage
    return NextResponse.json(getDefaultFeatureFlags());
  }
};
