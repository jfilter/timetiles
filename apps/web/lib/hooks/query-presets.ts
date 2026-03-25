/**
 * Shared React Query cache timing presets.
 *
 * @module
 * @category Hooks
 */

/**
 * Create a refetchInterval function that polls while any item matches a predicate.
 * Returns `intervalMs` while any doc matches, `false` otherwise.
 *
 * Satisfies React Query's `refetchInterval: (query) => number | false` signature.
 */
export const createActivePollingInterval =
  <T>(predicate: (doc: T) => boolean, intervalMs: number) =>
  // eslint-disable-next-line sonarjs/function-return-type -- React Query refetchInterval API requires false | number
  (query: { state: { data: T[] | undefined } }): number | false => {
    const docs = query.state.data;
    if (!docs?.length) return false;
    return docs.some(predicate) ? intervalMs : false;
  };

/**
 * Create a refetchInterval for a single-item query that polls while a predicate holds.
 * Returns `intervalMs` while the predicate is true, `false` when it's false or data is absent.
 */
export const createItemPollingInterval =
  <T>(predicate: (data: T) => boolean, intervalMs: number) =>
  // eslint-disable-next-line sonarjs/function-return-type -- React Query refetchInterval API requires false | number
  (query: { state: { data: T | undefined } }): number | false => {
    const data = query.state.data;
    if (data == null) return false; // let React Query handle the initial fetch
    return predicate(data) ? intervalMs : false;
  };

export const QUERY_PRESETS = {
  /** Standard data: 1 min stale, 5 min cache. */
  standard: { staleTime: 60 * 1000, gcTime: 5 * 60 * 1000, refetchOnWindowFocus: false as const },
  /** Expensive queries: 2 min stale, 10 min cache. For histograms and aggregations. */
  expensive: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: false as const },
  /** Stable data: 5 min stale, 30 min cache. For metadata that rarely changes. */
  stable: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const },
  /** Frequently-updated data: 30s stale, 2 min cache. For active monitoring views. */
  frequent: { staleTime: 30 * 1000, gcTime: 2 * 60 * 1000, refetchOnWindowFocus: false as const },
} as const;
