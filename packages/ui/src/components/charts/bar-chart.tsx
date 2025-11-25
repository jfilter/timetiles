/**
 * Minimal bar chart for smooth animations.
 *
 * Simple implementation with stable category axes and value-only updates
 * for smooth ECharts animations.
 *
 * @module
 * @category Components
 */
"use client";

import type { EChartsOption } from "echarts";
import { useMemo } from "react";

import { cartographicColors } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import type { BarChartDataItem, ChartTheme } from "./types";

// Helper to check if click params are valid
const isValidClickParams = (params: unknown): params is { dataIndex?: number; componentType?: string } =>
  typeof params === "object" && params !== null && "dataIndex" in params;

export interface BarChartProps {
  /** Chart data */
  data: BarChartDataItem[];
  /** Chart height */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Chart theme */
  theme?: ChartTheme;
  /** Show loading overlay */
  isInitialLoad?: boolean;
  /** Show updating indicator */
  isUpdating?: boolean;
  /** Click handler for bar clicks */
  onBarClick?: (item: BarChartDataItem, index: number) => void;
}

/**
 * Minimal bar chart component with smooth animations.
 *
 * Key features:
 * - Fixed horizontal orientation
 * - No sorting (maintains data order)
 * - Minimal configuration
 * - Focus on smooth value updates
 */
export const BarChart = ({
  data,
  height = 300,
  className,
  theme,
  isInitialLoad,
  isUpdating,
  onBarClick,
}: BarChartProps) => {
  const chartOption: EChartsOption = useMemo(() => {
    // Extract labels and values
    const labels = data.map((item) => item.label);
    const values = data.map((item) => item.value);

    return {
      // Animation config
      animation: true,
      animationDuration: 300,
      animationDurationUpdate: 300,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",

      // Grid
      grid: {
        left: "15%",
        right: "10%",
        bottom: "10%",
        top: "5%",
        containLabel: true,
      },

      // Horizontal bar chart
      xAxis: {
        type: "value",
        name: "Count",
      },
      yAxis: {
        type: "category",
        data: labels, // Fixed category order
        inverse: true,
      },

      // Series
      series: [
        {
          type: "bar",
          data: values.map((value, index) => ({
            value,
            name: labels[index], // Track by name
            itemStyle: {
              color: Array.isArray(theme?.itemColor)
                ? theme.itemColor[0]
                : (theme?.itemColor ?? cartographicColors.blue),
            },
          })),
          universalTransition: true,
          animationDuration: 300,
          animationDurationUpdate: 300,
          label: {
            show: true,
            position: "right",
            formatter: (params: unknown) => {
              if (typeof params === "object" && params !== null && "value" in params) {
                const value = (params as { value?: unknown }).value;
                if (typeof value === "number" || typeof value === "string") {
                  return value.toString();
                }
              }
              return "0";
            },
          },
        },
      ],
    };
  }, [data, theme?.itemColor]);

  // Create event handlers
  // Very important to depend on data to enable animation on data change.
  // Otherwise the chart will be re-rendered without animation on data updates.
  const onEventsHandler = useMemo(() => {
    if (!onBarClick) return undefined;

    return {
      click: (params: unknown) => {
        if (!isValidClickParams(params)) return;

        const dataIndex = params.dataIndex;
        if (typeof dataIndex !== "number" || dataIndex < 0 || dataIndex >= data.length) return;

        const item = data[dataIndex];
        if (item) {
          onBarClick(item, dataIndex);
        }
      },
    };
  }, [onBarClick, data]);

  return (
    <BaseChart
      height={height}
      className={className}
      theme={theme}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      config={chartOption}
      onEvents={onEventsHandler}
    />
  );
};
