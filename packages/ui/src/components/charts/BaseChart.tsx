"use client";

import { useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import type { BaseChartProps } from "./types";
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
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    const handleResize = () => {
      chartRef.current?.getEchartsInstance()?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const themedOption = applyThemeToOption(config, theme);

  return (
    <div className={cn("relative", className)} style={{ height, width }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      <ReactECharts
        ref={chartRef}
        option={themedOption}
        style={{ height: "100%", width: "100%" }}
        showLoading={false}
        onChartReady={onChartReady}
        onEvents={onEvents}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
}