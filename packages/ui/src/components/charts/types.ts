/**
 * @module
 */

import type { EChartsOption } from "echarts";

export interface ChartTheme {
  backgroundColor?: string;
  textColor?: string;
  axisLineColor?: string;
  splitLineColor?: string;
  itemColor?: string | string[];
  /** Tooltip background color. Falls back to foreground color if omitted. */
  tooltipBackground?: string;
  /** Tooltip text color. Falls back to background color if omitted. */
  tooltipForeground?: string;
  /** Color for hover emphasis on chart items. Falls back to primary/navy if omitted. */
  emphasisColor?: string;
}

// ECharts event parameter types
export interface EChartsEventParams {
  componentType?: string;
  seriesType?: string;
  dataIndex?: number;
  value?: unknown;
  name?: string;
  data?: unknown;
}

export interface EChartsInstance {
  resize: () => void;
  getOption: () => EChartsOption;
  setOption: (option: EChartsOption) => void;
}

export interface BaseChartProps {
  height?: number | string;
  width?: number | string;
  className?: string;
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  theme?: ChartTheme;
  config?: Partial<EChartsOption>;
  onChartReady?: (chart: EChartsInstance) => void;
  onEvents?: Record<string, (params: EChartsEventParams) => void>;
  /** Skeleton variant to show during initial load */
  skeletonVariant?: "histogram" | "bar" | "scatter";
  /** Label for the corner badge shown while isUpdating is true */
  updatingLabel?: string;
}

export interface BarChartDataItem {
  label: string;
  value: number;
  color?: string;
  metadata?: unknown;
}
