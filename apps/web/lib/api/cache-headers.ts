/**
 * Pre-defined cache control strategies for API responses.
 *
 * @module
 * @category API
 */

const CACHE_STRATEGIES = {
  /** 60s server cache, 5min stale-while-revalidate (feature flags, quotas) */
  short: "public, s-maxage=60, stale-while-revalidate=300",
  /** 5min server cache, 10min stale-while-revalidate (legal notices, static content) */
  medium: "public, s-maxage=300, stale-while-revalidate=600",
  /** 1hr server cache, 2hr stale-while-revalidate (rarely changing content) */
  long: "public, s-maxage=3600, stale-while-revalidate=7200",
} as const;

export type CacheStrategy = keyof typeof CACHE_STRATEGIES;

/**
 * Returns a headers object with the appropriate Cache-Control header.
 */
export const cacheHeaders = (strategy: CacheStrategy): { "Cache-Control": string } => ({
  "Cache-Control": CACHE_STRATEGIES[strategy],
});
