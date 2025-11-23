/**
 * @module
 */

"use client";

import type { EChartsReactProps } from "echarts-for-react";
import ReactEChartsLib from "echarts-for-react";
import { useEffect, useMemo, useRef } from "react";
import * as React from "react";

// Type the ReactECharts component properly for strict TypeScript
// Add ref support to the props
type ReactEChartsWithRef = React.ComponentType<
  EChartsReactProps & {
    ref?: React.Ref<ReactEChartsLib>;
  }
>;

const ReactECharts = ReactEChartsLib as ReactEChartsWithRef;

import { applyThemeToOption, defaultLightTheme } from "../../lib/chart-themes";
import { cn } from "../../lib/utils";
import type { BaseChartProps, EChartsInstance } from "./types";

const containerStyle = { height: "100%", width: "100%" };
const chartStyle = { height: "100%", width: "100%" };
const defaultConfig = {};
const defaultEvents = {};

export const BaseChart = ({
  height = 400,
  width = "100%",
  className,
  isInitialLoad = false,
  isUpdating = false,
  theme = defaultLightTheme,
  config = defaultConfig,
  onChartReady,
  onEvents = defaultEvents,
}: BaseChartProps) => {
  const chartRef = useRef<ReactEChartsLib>(null);

  useEffect(() => {
    const handleResize = () => {
      const chartInstance = chartRef.current?.getEchartsInstance();
      chartInstance?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const themedOption = useMemo(() => applyThemeToOption(config, theme), [config, theme]);

  const containerDivStyle = useMemo(() => ({ height, width }), [height, width]);

  const handleChartReady = React.useCallback(
    (chart: unknown) => {
      if (
        onChartReady != null &&
        chart != null &&
        typeof chart === "object" &&
        "resize" in chart &&
        typeof (chart as { resize?: unknown }).resize === "function"
      ) {
        onChartReady(chart as EChartsInstance);
      }
    },
    [onChartReady]
  );

  return (
    <div className={cn("relative", className)} style={containerDivStyle}>
      {/* Full loading overlay on initial load */}
      {isInitialLoad && (
        <div className="bg-muted/50 absolute inset-0 z-10 flex items-center justify-center">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
        </div>
      )}
      {/* Subtle corner badge when updating */}
      {isUpdating && (
        <div className="absolute right-2 top-2 z-10">
          <div className="border-border bg-background/80 flex items-center gap-2 rounded-sm border px-3 py-1 text-xs backdrop-blur-sm">
            <div className="border-primary h-3 w-3 animate-spin rounded-full border-b-2" />
            <span className="text-muted-foreground">Updating...</span>
          </div>
        </div>
      )}
      <div className={cn("transition-opacity", isUpdating && "opacity-90")} style={containerStyle}>
        <ReactECharts
          ref={chartRef}
          option={themedOption}
          style={chartStyle}
          showLoading={false}
          onChartReady={handleChartReady}
          onEvents={onEvents}
          notMerge={false}
          lazyUpdate={false}
        />
      </div>
    </div>
  );
};
