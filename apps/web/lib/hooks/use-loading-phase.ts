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

import { useEffect, useRef, useState } from "react";

export interface LoadingPhase {
  /** True when loading for the first time (nothing rendered yet) */
  isInitialLoad: boolean;
  /** True when loading but data was already shown at least once */
  isUpdating: boolean;
}

/**
 * Track loading phase for a single `isLoading` boolean.
 *
 * Uses a ref to track whether data has loaded at least once (avoiding
 * a dependency-array loop) and a state boolean to trigger re-renders
 * when the phase transitions.
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
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!isLoading && !hasLoadedOnceRef.current) {
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    }
  }, [isLoading]);

  return { isInitialLoad: isLoading && !hasLoadedOnce, isUpdating: isLoading && hasLoadedOnce };
};
