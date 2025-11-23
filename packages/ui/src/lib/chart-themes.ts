/**
 * @module
 */

import type { EChartsOption, SeriesOption } from "echarts";

import type { ChartTheme } from "../components/charts/types";

// Type for ECharts series configuration
interface EChartsSeriesItem {
  itemStyle?: {
    color?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Type guard to check if a value is a valid series item
const isSeriesItem = (value: unknown): value is EChartsSeriesItem => typeof value === "object" && value !== null;

// Cartographic color palette (OKLCH converted to hex for ECharts)
// These match the design system defined in packages/ui/DESIGN_SYSTEM.md
const cartographicColors = {
  parchment: "#f8f5f0", // oklch(0.96 0.01 80)
  charcoal: "#404040", // oklch(0.25 0 0)
  navy: "#4a5568", // oklch(0.35 0.06 250)
  blue: "#6495ed", // oklch(0.58 0.11 220)
  terracotta: "#cd853f", // oklch(0.56 0.14 35)
  forest: "#5f9e6e", // oklch(0.42 0.08 145)
  cream: "#e8e4dd", // oklch(0.88 0.01 80)
};

export const defaultLightTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: cartographicColors.charcoal,
  axisLineColor: `${cartographicColors.navy}4D`, // navy at 30% opacity
  splitLineColor: `${cartographicColors.navy}1A`, // navy at 10% opacity
  itemColor: cartographicColors.blue,
};

export const defaultDarkTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: cartographicColors.charcoal,
  axisLineColor: `${cartographicColors.charcoal}66`, // charcoal at 40% opacity
  splitLineColor: `${cartographicColors.charcoal}33`, // charcoal at 20% opacity
  itemColor: cartographicColors.blue,
};

// Export color palette for use in other charts
export { cartographicColors };

// Helper function to safely spread axis options
const safeSpreadAxis = (axis: unknown): Record<string, unknown> => {
  if (typeof axis === "object" && axis !== null && !Array.isArray(axis)) {
    return axis as Record<string, unknown>;
  }
  return {};
};

export const applyThemeToOption = (option: EChartsOption, theme: ChartTheme): EChartsOption => {
  const result: EChartsOption = {
    ...option,
    backgroundColor: theme.backgroundColor,
    textStyle: {
      color: theme.textColor,
    },
  };

  // Handle xAxis safely
  result.xAxis = {
    ...safeSpreadAxis(option.xAxis),
    axisLine: {
      lineStyle: {
        color: theme.axisLineColor,
      },
    },
    axisLabel: {
      color: theme.textColor,
    },
    splitLine: {
      lineStyle: {
        color: theme.splitLineColor,
      },
    },
  };

  // Handle yAxis safely
  result.yAxis = {
    ...safeSpreadAxis(option.yAxis),
    axisLine: {
      lineStyle: {
        color: theme.axisLineColor,
      },
    },
    axisLabel: {
      color: theme.textColor,
    },
    splitLine: {
      lineStyle: {
        color: theme.splitLineColor,
      },
    },
  };

  // Handle series safely
  if (Array.isArray(option.series)) {
    result.series = option.series.map((s) => {
      if (!isSeriesItem(s)) {
        return s;
      }

      return {
        ...s,
        itemStyle: {
          ...(s.itemStyle ?? {}),
          color: Array.isArray(theme.itemColor) ? theme.itemColor[0] : theme.itemColor,
        },
      } satisfies SeriesOption;
    });
  } else {
    result.series = option.series;
  }

  return result;
};
