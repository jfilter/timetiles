/**
 * @module
 */

import type { ChartTheme } from "../types";

export interface BeeswarmDataItem {
  /** Timestamp (ms) for X position */
  x: number;
  /** Y position — overridden by the internal beeswarm layout */
  y: number;
  /** Event ID for click handling */
  id: number;
  /** Tooltip label (event title) */
  label?: string;
  /** Dataset name for legend/tooltip */
  dataset?: string;
  /** Series index (for dataset grouping) */
  seriesIndex?: number;
  /** Cluster count (when this point represents multiple events) */
  count?: number;
}

export interface BeeswarmSeries {
  name: string;
  color: string;
  data: BeeswarmDataItem[];
}

export interface BeeswarmChartProps {
  /** Grouped series data (one per dataset) */
  series: BeeswarmSeries[];
  /** Callback when a point is clicked */
  onPointClick?: (eventId: number) => void;
  theme?: ChartTheme;
  height?: number | string;
  className?: string;
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Total event count (show "X of Y" when limited) */
  totalCount?: number;
  /** Number of visible points */
  visibleCount?: number;
  emptyMessage?: string;
  /** Max cluster count for sizing proportional circles */
  maxClusterCount?: number;
  /**
   * Layout mode:
   * - `"merged"` (default): all series share the same Y space
   * - `"rows"`: each series gets its own horizontal lane with a label
   */
  layout?: "merged" | "rows";
  /** Override the auto-computed dot size (pixels). */
  dotSizeOverride?: number;
  /** Min cluster circle size (pixels). @default 10 */
  clusterMinSize?: number;
  /** Max cluster circle size (pixels). @default 40 */
  clusterMaxSize?: number;
}

/** Y-axis config produced by the merged-layout builder. */
export interface MergedYAxisConfig {
  type: "value";
  show: false;
  min: number;
  max: number;
}

/** Y-axis config produced by the row-layout builder. */
export interface RowYAxisConfig {
  type: "value";
  show: true;
  min: number;
  max: number;
  interval: number;
  inverse: true;
  axisLabel: { color: string | undefined; fontSize: number; formatter: (value: number) => string };
  axisLine: { show: false };
  axisTick: { show: false };
  splitLine: {
    show: boolean;
    interval: number;
    lineStyle: { color: string | undefined; opacity: number; type: "dashed" };
  };
}

export type BeeswarmYAxisConfig = MergedYAxisConfig | RowYAxisConfig;
