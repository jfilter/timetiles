/**
 * @module
 */

export { useChartTheme } from "../../hooks/use-chart-theme";
export { applyThemeToOption, defaultDarkTheme, defaultLightTheme } from "../../lib/chart-themes";
export { BarChart } from "./bar-chart";
export { BaseChart } from "./base-chart";
export { TimeHistogram } from "./time-histogram";
export type {
  BarChartDataItem,
  BarChartProps,
  BaseChartProps,
  ChartTheme,
  TimeHistogramDataItem,
  TimeHistogramProps,
} from "./types";
