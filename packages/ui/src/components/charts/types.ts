import type { EChartsOption } from "echarts";

export interface ChartTheme {
  backgroundColor?: string;
  textColor?: string;
  axisLineColor?: string;
  splitLineColor?: string;
  itemColor?: string | string[];
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
export function isValidEventParams(
  params: unknown,
): params is EChartsEventParams {
  return (
    typeof params === "object" && params !== null && "componentType" in params
  );
}

export function isValidFormatterParams(
  params: unknown,
): params is EChartsFormatterParams {
  return typeof params === "object" && params !== null && "dataIndex" in params;
}

export function isValidDataIndex(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && Number.isInteger(value);
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
  loading?: boolean;
  theme?: ChartTheme;
  config?: Partial<EChartsOption>;
  onChartReady?: (chart: EChartsInstance) => void;
  onEvents?: Record<string, (params: EChartsEventParams) => void>;
}

export interface HistogramBin<T = unknown> {
  range: [Date | number, Date | number];
  count: number;
  items: T[];
}

export interface HistogramProps<T = unknown> extends BaseChartProps {
  data: T[];
  xAccessor: (item: T) => Date | string | number;
  yAccessor?: (items: T[]) => number;
  binning?: "auto" | "day" | "week" | "month" | "year" | number;
  color?: string | ((bin: HistogramBin<T>) => string);
  onBarClick?: (bin: HistogramBin<T>) => void;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  formatter?: {
    xAxis?: (value: Date | string | number) => string;
    yAxis?: (value: number) => string;
    tooltip?: (bin: HistogramBin<T>) => string;
  };
}

export type BinningStrategy = "day" | "week" | "month" | "year";

export interface BarChartDataItem {
  label: string;
  value: number;
  color?: string;
  metadata?: unknown;
}

export interface BarChartProps extends BaseChartProps {
  data: BarChartDataItem[];
  orientation?: "horizontal" | "vertical";
  onBarClick?: (item: BarChartDataItem, index: number) => void;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  showValues?: boolean;
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
  maxLabelLength?: number;
  sortBy?: "value" | "label" | "none";
  sortOrder?: "asc" | "desc";
}
