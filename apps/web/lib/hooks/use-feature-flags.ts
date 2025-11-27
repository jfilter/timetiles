/**
 * React Query hook for accessing feature flags client-side.
 *
 * Provides cached access to feature flags for UI components to adapt
 * based on enabled/disabled features.
 *
 * @module
 * @category Hooks
 */
import { useQuery } from "@tanstack/react-query";

import type { FeatureFlags } from "@/lib/services/feature-flag-service";

const FEATURE_FLAGS_QUERY_KEY = ["feature-flags"] as const;

/**
 * Fetches feature flags from the API.
 */
const fetchFeatureFlags = async (): Promise<FeatureFlags> => {
  const response = await fetch("/api/feature-flags");
  if (!response.ok) {
    throw new Error("Failed to fetch feature flags");
  }
  return response.json();
};

/**
 * Hook to access all feature flags.
 *
 * @example
 * ```tsx
 * const { data: flags, isLoading } = useFeatureFlags();
 * if (!flags?.allowPrivateImports) {
 *   // Hide private option
 * }
 * ```
 */
export const useFeatureFlags = () =>
  useQuery({
    queryKey: FEATURE_FLAGS_QUERY_KEY,
    queryFn: fetchFeatureFlags,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });

/**
 * Hook to check if a specific feature is enabled.
 *
 * @example
 * ```tsx
 * const { isEnabled, isLoading } = useFeatureEnabled("allowPrivateImports");
 * ```
 */
export const useFeatureEnabled = (flag: keyof FeatureFlags) => {
  const { data, isLoading, error } = useFeatureFlags();
  return {
    isEnabled: data?.[flag] ?? true, // Default to enabled while loading
    isLoading,
    error,
  };
};
