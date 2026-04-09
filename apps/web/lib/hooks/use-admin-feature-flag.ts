/**
 * Standalone feature flag hook for the Payload CMS admin panel.
 *
 * Uses plain useState/useEffect instead of React Query because
 * the admin panel does not have a QueryClientProvider.
 * Defaults to disabled (false) on fetch failure (fail-closed policy).
 *
 * @module
 * @category Hooks
 */
"use client";

import { useEffect, useState } from "react";

import type { FeatureFlags } from "@/lib/services/feature-flag-service";

import { fetchFeatureFlags } from "./use-feature-flags";

/**
 * Fetches a single feature flag value for use in Payload admin components.
 *
 * @param flag - The feature flag key to look up
 * @returns `{ isEnabled }` where `null` means loading, `true`/`false` is the resolved value
 *
 * @example
 * ```tsx
 * const { isEnabled } = useAdminFeatureFlag("enableScheduledIngests");
 * if (isEnabled === null || isEnabled) return null; // loading or enabled
 * return <WarningBanner />;
 * ```
 */
export const useAdminFeatureFlag = (flag: keyof FeatureFlags) => {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchFlag = async () => {
      try {
        const flags = await fetchFeatureFlags();
        if (!cancelled) setIsEnabled(flags[flag] ?? false);
      } catch {
        // Fail closed: disable feature if fetch fails
        if (!cancelled) setIsEnabled(false);
      }
    };

    void fetchFlag();
    return () => {
      cancelled = true;
    };
  }, [flag]);

  return { isEnabled };
};
