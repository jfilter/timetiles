/**
 * Hook that tracks whether data has loaded at least once.
 *
 * Provides `isInitialLoad` and `isUpdating` flags to distinguish first-load
 * skeletons from background-refresh spinners. Used by chart wrappers and
 * explorer components that combine multiple query loading states.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useRef } from "react";

export interface LoadingPhase {
  /** True when loading for the first time (nothing rendered yet) */
  isInitialLoad: boolean;
  /** True when loading but data was already shown at least once */
  isUpdating: boolean;
}

/**
 * Track loading phase for a single `isLoading` boolean.
 *
 * Uses a ref to track whether data has loaded at least once. No state
 * or effect is needed because the parent re-renders when `isLoading`
 * changes, which is sufficient to re-evaluate the return values.
 *
 * @param isLoading - Whether the data source is currently loading
 * @returns Loading phase flags
 *
 * @example
 * ```tsx
 * const isLoading = eventsLoading || clustersLoading;
 * const { isInitialLoad, isUpdating } = useLoadingPhase(isLoading);
 * ```
 */
export const useLoadingPhase = (isLoading: boolean): LoadingPhase => {
  const hasLoadedOnceRef = useRef(false);
  const hasEverLoadedRef = useRef(false);

  // Only flip `hasLoadedOnce` after we actually *finish* a load — the
  // previous render must have been loading. A bare `!isLoading` check
  // fires prematurely when the underlying query starts disabled
  // (e.g. `useQuery({ enabled: false })`), because React Query then
  // reports `isLoading=false` before any fetch begins. That made
  // `isInitialLoad` stuck at false once the query finally ran, so the
  // skeleton never appeared.
  if (isLoading) {
    hasEverLoadedRef.current = true;
  } else if (hasEverLoadedRef.current) {
    hasLoadedOnceRef.current = true;
  }

  // `isInitialLoad` means "we have nothing to render yet". That includes both
  // the active-fetch state (isLoading=true, no data) and the pre-fetch state
  // where the underlying query is still gated on some input (e.g. map bounds
  // not yet resolved). Without the pre-fetch case, the consumer renders its
  // empty state — "No events" — for the brief window between page mount and
  // first query fire, which flickers badly on every navigation.
  return { isInitialLoad: !hasLoadedOnceRef.current, isUpdating: isLoading && hasLoadedOnceRef.current };
};
