"use client";

import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { useFilters } from "../lib/filters";
import { useUIStore } from "../lib/store";
import ReactECharts from "echarts-for-react";
import { useTheme } from "next-themes";
import { logger } from "@/lib/logger";

interface EventHistogramProps {
  loading?: boolean;
  height?: number | string;
  className?: string;
}

interface HistogramData {
  date: string;
  count: number;
}

export function EventHistogram({
  loading: externalLoading = false,
  height = 200,
  className,
}: EventHistogramProps) {
  const { theme } = useTheme();
  const [, setStartDate] = useQueryState("startDate");
  const [, setEndDate] = useQueryState("endDate");
  const [histogramData, setHistogramData] = useState<HistogramData[]>([]);
  const [loading, setLoading] = useState(false);

  // Get filter state and map bounds
  const { filters } = useFilters();
  const mapBounds = useUIStore((state) => state.ui.mapBounds);

  // Fetch histogram data from API
  useEffect(() => {
    const fetchHistogramData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();

        // Add filter params
        if (filters.catalog) params.set("catalog", filters.catalog);
        if (filters.datasets.length > 0) {
          filters.datasets.forEach((dataset) =>
            params.append("datasets", dataset),
          );
        }
        if (filters.startDate) params.set("startDate", filters.startDate);
        if (filters.endDate) params.set("endDate", filters.endDate);

        // Add map bounds if available
        if (mapBounds) {
          const bounds = {
            north: mapBounds.north,
            south: mapBounds.south,
            east: mapBounds.east,
            west: mapBounds.west,
          };
          params.set("bounds", JSON.stringify(bounds));
        }

        params.set("granularity", "auto");

        const response = await fetch(
          `/api/events/histogram?${params.toString()}`,
        );
        const data = await response.json();

        if (data.histogram) {
          setHistogramData(data.histogram);
        }
      } catch (error) {
        logger.error("Failed to fetch histogram data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistogramData();
  }, [filters, mapBounds]);

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
        formatter: (params: any) => {
          const point = params[0];
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
          data: histogramData.map((item) => [item.date, item.count]),
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

  const handleChartClick = (params: any) => {
    if (params.data) {
      const date = new Date(params.data[0]);
      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      setStartDate(formatDate(date));
      setEndDate(formatDate(date));
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

  if (histogramData.length === 0) {
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
