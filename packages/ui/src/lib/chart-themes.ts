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
function isSeriesItem(value: unknown): value is EChartsSeriesItem {
  return typeof value === "object" && value !== null;
}

export const defaultLightTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: "#374151",
  axisLineColor: "#e5e7eb",
  splitLineColor: "#f3f4f6",
  itemColor: "#3b82f6",
};

export const defaultDarkTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: "#d1d5db",
  axisLineColor: "#374151",
  splitLineColor: "#1f2937",
  itemColor: "#60a5fa",
};

// Helper function to safely spread axis options
function safeSpreadAxis(axis: unknown): Record<string, unknown> {
  if (typeof axis === "object" && axis !== null && !Array.isArray(axis)) {
    return axis as Record<string, unknown>;
  }
  return {};
}

export function applyThemeToOption(option: EChartsOption, theme: ChartTheme): EChartsOption {
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
}
