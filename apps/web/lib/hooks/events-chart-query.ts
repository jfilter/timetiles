/**
 * Loading-phase flags shared by the chart-facing events queries.
 *
 * Charts distinguish "nothing on screen yet" from "refetching behind visible data",
 * which React Query's own flags do not express directly.
 *
 * @module
 * @category Hooks
 */

import type { UseQueryResult } from "@tanstack/react-query";

/** Query result enriched with loading-phase flags for chart components. */
export type ChartQueryResult<TData, TError = Error> = UseQueryResult<TData, TError> & {
  /** True when no successful fetch has completed yet (nothing rendered). */
  isInitialLoad: boolean;
  /** True when fetching but stale data is already on screen. */
  isUpdating: boolean;
};

export const withChartFlags = <TData, TError = Error>(
  query: UseQueryResult<TData, TError>
): ChartQueryResult<TData, TError> => ({
  ...query,
  isInitialLoad: query.dataUpdatedAt === 0,
  isUpdating: query.isFetching && !!query.data,
});
