/**
 * Shared React Query cache timing presets.
 *
 * @module
 * @category Hooks
 */

export const QUERY_PRESETS = {
  /** Standard data: 1 min stale, 5 min cache. */
  standard: { staleTime: 60 * 1000, gcTime: 5 * 60 * 1000 },
  /** Stable data: 5 min stale, 30 min cache. For metadata that rarely changes. */
  stable: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 },
} as const;
