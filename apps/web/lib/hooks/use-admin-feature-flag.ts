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

import { fetchJson } from "@/lib/api/http-error";
import type { FeatureFlags } from "@/lib/services/feature-flag-service";

/**
 * Fetches a single feature flag value for use in Payload admin components.
 *
 * @param flag - The feature flag key to look up
 * @returns `{ isEnabled }` where `null` means loading, `true`/`false` is the resolved value
 *
 * @example
 * ```tsx
 * const { isEnabled } = useAdminFeatureFlag("enableScheduledImports");
 * if (isEnabled === null || isEnabled) return null; // loading or enabled
 * return <WarningBanner />;
 * ```
 */
export const useAdminFeatureFlag = (flag: keyof FeatureFlags) => {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchFlag = async () => {
      try {
        const flags = await fetchJson<FeatureFlags>("/api/feature-flags");
        setIsEnabled(flags[flag] ?? false);
      } catch {
        // Fail closed: disable feature if fetch fails
        setIsEnabled(false);
      }
    };

    void fetchFlag();
  }, [flag]);

  return { isEnabled };
};
