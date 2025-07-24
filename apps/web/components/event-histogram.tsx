"use client";

import ReactECharts from "echarts-for-react";
import type { LngLatBounds } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useQueryState } from "nuqs";
import { useMemo } from "react";

import { useFilters } from "../lib/filters";
import { useHistogramQuery } from "../lib/hooks/use-events-queries";
import { useUIStore } from "../lib/store";

interface EventHistogramProps {
  loading?: boolean;
  height?: number | string;
  className?: string;
}

export function EventHistogram({
  loading: externalLoading = false,
  height = 200,
  className,
}: EventHistogramProps) {
  const { theme } = useTheme();
  const [, setStartDate] = useQueryState("startDate");
  const [, setEndDate] = useQueryState("endDate");

  // Get filter state and map bounds
  const { filters } = useFilters();
  const mapBounds = useUIStore((state) => state.ui.mapBounds);

  // Convert mapBounds to LngLatBounds format for React Query
  const bounds: LngLatBounds | null = useMemo(() => {
    if (!mapBounds) return null;

    return {
      getNorth: () => mapBounds.north,
      getSouth: () => mapBounds.south,
      getEast: () => mapBounds.east,
      getWest: () => mapBounds.west,
    } as LngLatBounds;
  }, [mapBounds]);

  // Fetch histogram data using React Query
  const { data: histogramData, isLoading } = useHistogramQuery(filters, bounds);

  // Extract histogram data, with fallback for error states
  const histogram = histogramData?.histogram ?? [];
  const loading = isLoading || externalLoading;

  // Create ECharts option for the histogram
  const getChartOption = () => {
    const isDark = theme === "dark";

    return {
      backgroundColor: "transparent",
      textStyle: {
        color: isDark ? "#e5e7eb" : "#374151",
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "time",
        boundaryGap: false,
        axisLabel: {
          color: isDark ? "#9ca3af" : "#6b7280",
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#374151" : "#e5e7eb",
          },
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: isDark ? "#9ca3af" : "#6b7280",
          fontSize: 11,
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: isDark ? "#374151" : "#f3f4f6",
            type: "dashed",
          },
        },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#1f2937" : "#ffffff",
        borderColor: isDark ? "#374151" : "#e5e7eb",
        textStyle: {
          color: isDark ? "#f9fafb" : "#111827",
        },
        formatter: (
          params: Array<{
            value: [string, number];
            data: [string, number];
            marker: string;
            seriesName: string;
          }>,
        ) => {
          const point = params[0];
          if (!point) return "";
          const date = new Date(point.data[0]);
          const count = point.data[1];
          return `
            <div style="padding: 4px 8px;">
              <div style="font-weight: 600;">${date.toLocaleDateString()}</div>
              <div>Events: ${count}</div>
            </div>
          `;
        },
      },
      series: [
        {
          type: "bar",
          data: histogram.map((item) => [item.date, item.count]),
          itemStyle: {
            color: isDark ? "#60a5fa" : "#3b82f6",
            borderRadius: [2, 2, 0, 0],
          },
          emphasis: {
            itemStyle: {
              color: isDark ? "#93c5fd" : "#1d4ed8",
            },
          },
        },
      ],
      animation: true,
      animationDuration: 300,
    };
  };

  const handleChartClick = (params: { data: [string, number] }) => {
    if (params.data !== undefined && params.data !== null) {
      const date = new Date(params.data[0]);
      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      void setStartDate(formatDate(date));
      void setEndDate(formatDate(date));
    }
  };

  if (loading || externalLoading) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-muted-foreground text-sm">
          Loading histogram...
        </div>
      </div>
    );
  }

  if (histogram.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-muted-foreground text-sm">No data available</div>
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ReactECharts
        option={getChartOption()}
        style={{ height: "100%", width: "100%" }}
        onEvents={{
          click: handleChartClick,
        }}
        opts={{ renderer: "svg" }}
      />
    </div>
  );
}
