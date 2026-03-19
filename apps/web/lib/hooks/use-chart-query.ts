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

import type { LoadingPhase } from "./use-loading-phase";
import { useLoadingPhase } from "./use-loading-phase";

export type ChartQueryResult<TData, TError> = UseQueryResult<TData, TError> & LoadingPhase;

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
  const { isInitialLoad, isUpdating } = useLoadingPhase(queryResult.isLoading);
  return { ...queryResult, isInitialLoad, isUpdating };
};
