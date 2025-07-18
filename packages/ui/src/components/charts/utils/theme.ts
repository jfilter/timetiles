import type { ChartTheme } from "../types";
import type { EChartsOption } from "echarts";

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

export function applyThemeToOption(
  option: EChartsOption,
  theme: ChartTheme,
): EChartsOption {
  return {
    ...option,
    backgroundColor: theme.backgroundColor,
    textStyle: {
      color: theme.textColor,
    },
    xAxis: {
      ...option.xAxis,
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
    },
    yAxis: {
      ...option.yAxis,
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
    },
    series: Array.isArray(option.series)
      ? option.series.map((s: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const series = s as Record<string, any>;
          return {
            ...series,
            itemStyle: {
              ...(series.itemStyle || {}),
              color: theme.itemColor,
            },
          };
        })
      : option.series,
  };
}
