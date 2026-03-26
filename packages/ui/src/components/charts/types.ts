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

export interface EChartsFormatterParams {
  dataIndex?: number;
  value?: unknown;
  name?: string;
  data?: unknown;
}

// Type guards for ECharts parameters
export const isValidEventParams = (params: unknown): params is EChartsEventParams =>
  typeof params === "object" && params !== null && "componentType" in params;

export const isValidFormatterParams = (params: unknown): params is EChartsFormatterParams =>
  typeof params === "object" && params !== null && "dataIndex" in params;

export const isValidDataIndex = (value: unknown): value is number =>
  typeof value === "number" && value >= 0 && Number.isInteger(value);

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
}

export interface BarChartDataItem {
  label: string;
  value: number;
  color?: string;
  metadata?: unknown;
}

export interface BarChartProps {
  data: BarChartDataItem[];
  height?: number | string;
  className?: string;
  theme?: ChartTheme;
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onBarClick?: (item: BarChartDataItem, index: number) => void;
}

export interface TimeHistogramDataItem {
  date: string | Date | number;
  count: number;
}

export interface TimeHistogramProps {
  data?: TimeHistogramDataItem[];
  onBarClick?: (date: Date) => void;
  theme?: ChartTheme;
  height?: number | string;
  className?: string;
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  loadingMessage?: string;
  emptyMessage?: string;
}
