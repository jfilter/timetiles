import type { EChartsOption } from "echarts";

export interface ChartTheme {
  backgroundColor?: string;
  textColor?: string;
  axisLineColor?: string;
  splitLineColor?: string;
  itemColor?: string | string[];
}

export interface BaseChartProps {
  height?: number | string;
  width?: number | string;
  className?: string;
  loading?: boolean;
  theme?: ChartTheme;
  config?: Partial<EChartsOption>;
  onChartReady?: (chart: any) => void;
  onEvents?: Record<string, (params: any) => void>;
}

export interface HistogramBin<T = any> {
  range: [Date | number, Date | number];
  count: number;
  items: T[];
}

export interface HistogramProps<T = any> extends BaseChartProps {
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
    xAxis?: (value: any) => string;
    yAxis?: (value: any) => string;
    tooltip?: (bin: HistogramBin<T>) => string;
  };
}

export type BinningStrategy = "day" | "week" | "month" | "year";

export interface BarChartDataItem {
  label: string;
  value: number;
  color?: string;
  metadata?: any;
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