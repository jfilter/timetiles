/**
 * React Query wrapper hook that adds loading state tracking for charts.
 *
 * Wraps any React Query hook and automatically tracks whether data has been
 * loaded at least once, providing convenient `isInitialLoad` and `isUpdating`
 * flags for chart components.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

export type ChartQueryResult<TData, TError> = UseQueryResult<TData, TError> & {
  /** True when loading for the first time (no data has been loaded yet) */
  isInitialLoad: boolean;
  /** True when loading and data has been loaded before (refetching/updating) */
  isUpdating: boolean;
};

/**
 * Wraps a React Query result with chart-specific loading states.
 *
 * @param queryResult - The result from a React Query hook (useQuery)
 * @returns Extended query result with isInitialLoad and isUpdating flags
 *
 * @example
 * ```tsx
 * function MyChart({ filters, bounds }) {
 *   const query = useHistogramQuery(filters, bounds);
 *   const { data, isInitialLoad, isUpdating } = useChartQuery(query);
 *
 *   return (
 *     <TimeHistogram
 *       data={data?.histogram}
 *       isInitialLoad={isInitialLoad}
 *       isUpdating={isUpdating}
 *     />
 *   );
 * }
 * ```
 */
export const useChartQuery = <TData = unknown, TError = Error>(
  queryResult: UseQueryResult<TData, TError>
): ChartQueryResult<TData, TError> => {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Track when we've successfully loaded data at least once
  useEffect(() => {
    if (queryResult.data != null && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [queryResult.data, hasLoadedOnce]);

  // Memoize loading states to prevent unnecessary re-renders
  // Initial load: loading and no data available yet (no placeholder data either)
  const isInitialLoad = useMemo(
    () => queryResult.isLoading && queryResult.data == null && !hasLoadedOnce,
    [queryResult.isLoading, queryResult.data, hasLoadedOnce]
  );

  // Updating: loading but we have data available (either from placeholder or previous fetch)
  // AND we've loaded successfully at least once
  const isUpdating = useMemo(
    () => queryResult.isLoading && queryResult.data != null && hasLoadedOnce,
    [queryResult.isLoading, queryResult.data, hasLoadedOnce]
  );

  return {
    ...queryResult,
    isInitialLoad,
    isUpdating,
  };
};
