/**
 * Map-related constants shared across map components.
 *
 * @module
 * @category Constants
 */

/**
 * Map style URLs for light and dark themes.
 * These point to the locally-served VersaTiles cartographic styles.
 */
export const MAP_STYLES = {
  light: "/map-styles/cartographic-light.json",
  dark: "/map-styles/cartographic-dark.json",
} as const;

/**
 * Default cluster statistics used when no data is available.
 * These provide sensible defaults for percentile-based cluster visualization.
 */
export const DEFAULT_CLUSTER_STATS = {
  p20: 2,
  p40: 5,
  p60: 10,
  p80: 20,
  p100: 50,
} as const;

/**
 * Cluster statistics interface for percentile breakpoints.
 */
export interface ClusterStats {
  p20: number;
  p40: number;
  p60: number;
  p80: number;
  p100: number;
}

/**
 * Ensure percentile values are strictly ascending for MapLibre step expressions.
 *
 * MapLibre step expressions require strictly ascending breakpoints. This function
 * takes raw percentile values and ensures each subsequent percentile is at least
 * 1 greater than the previous one.
 *
 * @param rawStats - Raw percentile statistics (may have equal or non-ascending values)
 * @returns Percentile statistics with strictly ascending values
 *
 * @example
 * ```typescript
 * // Raw stats from database might have equal values
 * const raw = { p20: 5, p40: 5, p60: 5, p80: 10, p100: 20 };
 * const ascending = ensureAscendingPercentiles(raw);
 * // Result: { p20: 5, p40: 6, p60: 7, p80: 10, p100: 20 }
 * ```
 */
export const ensureAscendingPercentiles = (rawStats: Partial<ClusterStats>): ClusterStats => {
  const stats: ClusterStats = {
    p20: rawStats.p20 ?? DEFAULT_CLUSTER_STATS.p20,
    p40: 0,
    p60: 0,
    p80: 0,
    p100: 0,
  };
  stats.p40 = Math.max(rawStats.p40 ?? DEFAULT_CLUSTER_STATS.p40, stats.p20 + 1);
  stats.p60 = Math.max(rawStats.p60 ?? DEFAULT_CLUSTER_STATS.p60, stats.p40 + 1);
  stats.p80 = Math.max(rawStats.p80 ?? DEFAULT_CLUSTER_STATS.p80, stats.p60 + 1);
  stats.p100 = Math.max(rawStats.p100 ?? DEFAULT_CLUSTER_STATS.p100, stats.p80 + 1);
  return stats;
};
