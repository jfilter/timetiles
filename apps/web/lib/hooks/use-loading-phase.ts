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

  // Update during render — no effect needed because the parent already
  // re-renders whenever isLoading changes, which is sufficient to
  // re-evaluate the return values with the updated ref.
  if (!isLoading) {
    hasLoadedOnceRef.current = true;
  }

  return { isInitialLoad: isLoading && !hasLoadedOnceRef.current, isUpdating: isLoading && hasLoadedOnceRef.current };
};
