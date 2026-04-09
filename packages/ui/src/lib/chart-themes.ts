/**
 * @module
 */

import type { EChartsOption, SeriesOption } from "echarts";

import type { ChartTheme } from "../components/charts/types";

// Type for ECharts series configuration
interface EChartsSeriesItem {
  itemStyle?: { color?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// Type guard to check if a value is a valid series item
const isSeriesItem = (value: unknown): value is EChartsSeriesItem => typeof value === "object" && value !== null;

// Default color palette (hex values for ECharts compatibility).
// Matches the Cartographic design system. Override via UIProvider's
// lightChartTheme / darkChartTheme for custom palettes.
const defaultColors = {
  parchment: "#f8f5f0", // oklch(0.96 0.01 80)
  charcoal: "#404040", // oklch(0.25 0 0)
  navy: "#4a5568", // oklch(0.35 0.06 250)
  blue: "#0089a7", // oklch(0.58 0.11 220)
  terracotta: "#cd853f", // oklch(0.56 0.14 35)
  forest: "#5f9e6e", // oklch(0.42 0.08 145)
  cream: "#e8e4dd", // oklch(0.88 0.01 80)

  // Map visualization colors (cartographic palette)
  mapPoint: "#0089a7", // cartographic-blue for individual event points
  mapClusterGradient: [
    "#f0dcc6", // p0-p20: warm cream
    "#d4a55a", // p20-p40: golden terracotta
    "#b87333", // p40-p60: copper/bronze
    "#8b4513", // p60-p80: saddle brown
    "#5c2d0e", // p80-p100: dark chocolate
  ] as const,
  mapStroke: "#ffffff", // White stroke for circles
};

export const defaultLightTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: defaultColors.charcoal,
  axisLineColor: `${defaultColors.navy}4D`, // navy at 30% opacity
  splitLineColor: `${defaultColors.navy}1A`, // navy at 10% opacity
  itemColor: defaultColors.blue,
  tooltipBackground: defaultColors.parchment,
  tooltipForeground: defaultColors.charcoal,
  emphasisColor: defaultColors.navy,
};

export const defaultDarkTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: defaultColors.charcoal,
  axisLineColor: `${defaultColors.charcoal}66`, // charcoal at 40% opacity
  splitLineColor: `${defaultColors.charcoal}33`, // charcoal at 20% opacity
  itemColor: defaultColors.blue,
  tooltipBackground: defaultColors.charcoal,
  tooltipForeground: defaultColors.parchment,
  emphasisColor: defaultColors.navy,
};

/** Configuration for map point and cluster visualization colors. */
export interface MapColors {
  /** Color for individual event points on the map. */
  mapPoint: string;
  /** 5-level gradient for cluster circles (lightest to darkest). */
  mapClusterGradient: readonly [string, string, string, string, string];
  /** Stroke color for point and cluster circles. */
  mapStroke: string;
}

/** Default map visualization colors (matches the cartographic palette). */
export const defaultMapColors: MapColors = {
  mapPoint: defaultColors.mapPoint,
  mapClusterGradient: defaultColors.mapClusterGradient,
  mapStroke: defaultColors.mapStroke,
};

// Export color palette for use in other charts
export { defaultColors };

type AxisLike = Record<string, Record<string, unknown> | undefined>;

// Helper function to safely spread axis options
const safeSpreadAxis = (axis: unknown): AxisLike => {
  if (typeof axis === "object" && axis !== null && !Array.isArray(axis)) {
    return axis as AxisLike;
  }
  return {};
};

// Helper to safely spread a nested axis sub-object (e.g. axisLine, axisLabel)
const safeSpread = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const applyThemeToOption = (option: EChartsOption, theme: ChartTheme): EChartsOption => {
  const result: EChartsOption = {
    ...option,
    backgroundColor: theme.backgroundColor,
    textStyle: { color: theme.textColor },
  };

  // Handle xAxis safely — deep-merge to preserve custom formatters etc.
  const xAxis = safeSpreadAxis(option.xAxis);
  result.xAxis = {
    ...xAxis,
    axisLine: { ...safeSpread(xAxis.axisLine), lineStyle: { color: theme.axisLineColor } },
    axisLabel: { ...safeSpread(xAxis.axisLabel), color: theme.textColor },
    splitLine: { ...safeSpread(xAxis.splitLine), lineStyle: { color: theme.splitLineColor } },
  };

  // Handle yAxis safely — deep-merge to preserve custom formatters, intervals, etc.
  const yAxis = safeSpreadAxis(option.yAxis);
  result.yAxis = {
    ...yAxis,
    axisLine: { ...safeSpread(yAxis.axisLine), lineStyle: { color: theme.axisLineColor } },
    axisLabel: { ...safeSpread(yAxis.axisLabel), color: theme.textColor },
    splitLine: { ...safeSpread(yAxis.splitLine), lineStyle: { color: theme.splitLineColor } },
  };

  // Handle series safely
  if (Array.isArray(option.series)) {
    result.series = option.series.map((s) => {
      if (!isSeriesItem(s)) {
        return s;
      }

      // Only apply theme color if the series doesn't have its own color
      const hasOwnColor = s.itemStyle?.color != null;
      return {
        ...s,
        itemStyle: hasOwnColor
          ? s.itemStyle
          : { ...s.itemStyle, color: Array.isArray(theme.itemColor) ? theme.itemColor[0] : theme.itemColor },
      } satisfies SeriesOption;
    });
  } else {
    result.series = option.series;
  }

  return result;
};
