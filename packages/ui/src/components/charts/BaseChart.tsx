"use client";

import ReactEChartsLib from "echarts-for-react";
import type { EChartsReactProps } from "echarts-for-react";
import { useEffect, useRef } from "react";
import * as React from "react";

// Type the ReactECharts component properly for strict TypeScript
// Add ref support to the props
type ReactEChartsWithRef = React.ComponentType<
  EChartsReactProps & {
    ref?: React.Ref<ReactEChartsLib>;
  }
>;

const ReactECharts = ReactEChartsLib as ReactEChartsWithRef;

import type { BaseChartProps, EChartsInstance } from "./types";
import { applyThemeToOption, defaultLightTheme } from "./utils/theme";
import { cn } from "../../lib/utils";

export function BaseChart({
  height = 400,
  width = "100%",
  className,
  loading = false,
  theme = defaultLightTheme,
  config = {},
  onChartReady,
  onEvents = {},
}: BaseChartProps) {
  const chartRef = useRef<ReactEChartsLib>(null);

  useEffect(() => {
    const handleResize = () => {
      const chartInstance = chartRef.current?.getEchartsInstance();
      chartInstance?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const themedOption = applyThemeToOption(config, theme);

  return (
    <div className={cn("relative", className)} style={{ height, width }}>
      {loading && (
        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
        </div>
      )}
      <ReactECharts
        ref={chartRef}
        option={themedOption}
        style={{ height: "100%", width: "100%" }}
        showLoading={false}
        onChartReady={(chart: unknown) => {
          if (
            onChartReady != null &&
            chart != null &&
            typeof chart === "object" &&
            "resize" in chart &&
            typeof (chart as { resize?: unknown }).resize === "function"
          ) {
            onChartReady(chart as EChartsInstance);
          }
        }}
        onEvents={onEvents}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
}
