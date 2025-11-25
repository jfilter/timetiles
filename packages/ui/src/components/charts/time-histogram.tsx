/**
 * Time-based histogram chart component for visualizing temporal data distribution.
 *
 * This is a pure presentation component that renders a bar chart showing
 * event counts over time. It accepts pre-calculated histogram data from
 * the server and handles theming, loading states, and click interactions.
 *
 * @module
 * @category Components
 */
"use client";

import type { EChartsOption } from "echarts";
import { useCallback, useMemo } from "react";

import { cartographicColors, defaultDarkTheme, defaultLightTheme } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import type { ChartTheme, EChartsEventParams } from "./types";

export interface TimeHistogramDataItem {
  date: string | Date | number;
  /** End date of the bucket (for adaptive tooltips showing date ranges) */
  dateEnd?: string | Date | number;
  count: number;
}

export interface TimeHistogramProps {
  /** Histogram data items with date and count */
  data?: TimeHistogramDataItem[];
  /** Callback when a bar is clicked, receives the date */
  onBarClick?: (date: Date) => void;
  /** Chart theme configuration */
  theme?: ChartTheme;
  /** Height of the chart */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Show full loading overlay (for initial load) */
  isInitialLoad?: boolean;
  /** Show corner spinner badge (for updates) */
  isUpdating?: boolean;
  /** Custom loading message */
  loadingMessage?: string;
  /** Custom empty message */
  emptyMessage?: string;
  /** Bucket size in seconds (for adaptive tooltip formatting) */
  bucketSizeSeconds?: number | null;
}

/**
 * Pure presentation component for rendering time-based histograms.
 *
 * @example
 * ```tsx
 * <TimeHistogram
 *   data={[{ date: '2024-01-01', count: 10 }, { date: '2024-01-02', count: 15 }]}
 *   onBarClick={(date) => console.log('Clicked:', date)}
 *   theme={chartTheme}
 *   isUpdating={isLoading}
 * />
 * ```
 */
const defaultData: TimeHistogramDataItem[] = [];

// Time constants for bucket size comparisons (exported for testing)
export const MINUTE_SECONDS = 60;
export const HOUR_SECONDS = 3600;
export const DAY_SECONDS = 86400;
export const MONTH_SECONDS = 30 * DAY_SECONDS;
export const YEAR_SECONDS = 365 * DAY_SECONDS;

/**
 * Format time portion of a date.
 * @param date - The date to format
 * @param includeSeconds - Whether to include seconds in the output
 * @returns Formatted time string (e.g., "10:30" or "10:30:45")
 */
export const formatTime = (date: Date, includeSeconds: boolean): string => {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  });
};

/**
 * Format date with time portion.
 * @param date - The date to format
 * @param includeSeconds - Whether to include seconds in the time portion
 * @returns Formatted datetime string (e.g., "Nov 25, 2025 10:30")
 */
export const formatDateTime = (date: Date, includeSeconds: boolean): string => {
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${datePart} ${formatTime(date, includeSeconds)}`;
};

/**
 * Format date range based on bucket size for adaptive tooltips.
 *
 * Formats dates appropriately based on the time granularity:
 * - Seconds (<60s): "Nov 25, 2025 10:30:45"
 * - Minutes (<1hr): "Nov 25, 2025 10:30"
 * - Hours (<1 day): "Nov 25, 2025 10:00 - 11:00"
 * - Daily (1 day): "Nov 25, 2025"
 * - Weekly (multi-day): "Jan 1 - 7, 2024"
 * - Monthly (≥30 days): "January 2025"
 * - Yearly (≥365 days): "2025"
 *
 * @param startDate - Start date of the bucket
 * @param endDate - End date of the bucket
 * @param bucketSeconds - Size of the bucket in seconds (null for default daily format)
 * @returns Formatted date range string
 */
export const formatDateRange = (startDate: Date, endDate: Date, bucketSeconds: number | null | undefined): string => {
  // For sub-minute buckets (seconds), show full datetime with seconds
  if (bucketSeconds && bucketSeconds < MINUTE_SECONDS) {
    return formatDateTime(startDate, true);
  }

  // For sub-hour buckets (minutes), show datetime with minutes
  if (bucketSeconds && bucketSeconds < HOUR_SECONDS) {
    return formatDateTime(startDate, false);
  }

  // For sub-day buckets (hours), show date and hour range
  if (bucketSeconds && bucketSeconds < DAY_SECONDS) {
    const sameDay =
      startDate.getDate() === endDate.getDate() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getFullYear() === endDate.getFullYear();

    if (sameDay) {
      // Same day: "Nov 25, 2025 10:00 - 11:00"
      const datePart = startDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `${datePart} ${formatTime(startDate, false)} - ${formatTime(endDate, false)}`;
    }
    // Different days: show full range
    return `${formatDateTime(startDate, false)} - ${formatDateTime(endDate, false)}`;
  }

  // If no bucket size or single day bucket, show single date
  if (!bucketSeconds || bucketSeconds <= DAY_SECONDS) {
    return startDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // For yearly buckets, show just the year
  if (bucketSeconds >= YEAR_SECONDS) {
    return startDate.getFullYear().toString();
  }

  // For monthly buckets, show month and year
  if (bucketSeconds >= MONTH_SECONDS) {
    return startDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  }

  // For weekly or multi-day buckets, show date range
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const sameYear = startDate.getFullYear() === endDate.getFullYear();

  if (sameMonth && sameYear) {
    // Same month: "Jan 1 - 7, 2024"
    return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${endDate.getDate()}, ${startDate.getFullYear()}`;
  } else if (sameYear) {
    // Same year, different months: "Jan 1 - Feb 7, 2024"
    return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${startDate.getFullYear()}`;
  } else {
    // Different years: "Dec 25, 2023 - Jan 1, 2024"
    return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} - ${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
};

export const TimeHistogram = ({
  data = defaultData,
  onBarClick,
  theme,
  height = 200,
  className,
  isInitialLoad = false,
  isUpdating = false,
  emptyMessage = "No data available",
  bucketSizeSeconds,
}: TimeHistogramProps) => {
  // Determine if dark theme based on theme prop
  const isDark = useMemo(() => {
    if (!theme) return false;
    // Check axisLineColor which differs between light/dark themes
    // (textColor is the same in both themes, so can't be used for detection)
    return theme.axisLineColor === defaultDarkTheme.axisLineColor;
  }, [theme]);

  // Get the effective theme, falling back to defaults
  const effectiveTheme = useMemo(() => {
    if (theme) return theme;
    return isDark ? defaultDarkTheme : defaultLightTheme;
  }, [theme, isDark]);

  // Helper functions for chart configuration - now uses theme colors
  const getAxisConfig = useCallback(
    (chartTheme: ChartTheme) => ({
      xAxis: {
        type: "time",
        boundaryGap: false,
        axisLabel: {
          color: chartTheme.textColor,
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: chartTheme.axisLineColor,
          },
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: chartTheme.textColor,
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
            color: chartTheme.splitLineColor,
            type: "dashed",
          },
        },
      },
    }),
    []
  );

  const getTooltipConfig = useCallback(
    (chartTheme: ChartTheme, darkMode: boolean, bucketSeconds: number | null | undefined) => ({
      trigger: "axis",
      backgroundColor: darkMode ? cartographicColors.charcoal : cartographicColors.parchment,
      borderColor: chartTheme.axisLineColor,
      textStyle: {
        // Use contrasting text color: light text on dark background, dark text on light background
        color: darkMode ? cartographicColors.parchment : chartTheme.textColor,
      },
      formatter: (
        params: Array<{
          value: [number, number, number];
          data: [number, number, number];
          marker: string;
          seriesName: string;
        }>
      ) => {
        const point = params[0];
        if (!point) return "";
        const startDate = new Date(point.data[0]);
        const endDate = new Date(point.data[2]);
        const count = point.data[1];

        return `
          <div style="padding: 4px 8px;">
            <div style="font-weight: 600;">${formatDateRange(startDate, endDate, bucketSeconds)}</div>
            <div>Events: ${count.toLocaleString()}</div>
          </div>
        `;
      },
    }),
    []
  );

  const getSeriesConfig = useCallback(
    (chartTheme: ChartTheme, histogramData: TimeHistogramDataItem[]) => [
      {
        type: "bar",
        // Include dateEnd as third element for tooltip access: [date, count, dateEnd]
        data: histogramData.map((item) => [item.date, item.count, item.dateEnd ?? item.date]),
        itemStyle: {
          color: Array.isArray(chartTheme.itemColor) ? chartTheme.itemColor[0] : chartTheme.itemColor,
          borderRadius: [2, 2, 0, 0],
        },
        emphasis: {
          itemStyle: {
            color: cartographicColors.navy,
          },
        },
      },
    ],
    []
  );

  // Create ECharts option for the histogram
  const chartOption = useMemo(() => {
    const axisConfig = getAxisConfig(effectiveTheme);

    return {
      backgroundColor: "transparent",
      textStyle: {
        color: effectiveTheme.textColor,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        top: "10%",
        containLabel: true,
      },
      ...axisConfig,
      tooltip: getTooltipConfig(effectiveTheme, isDark, bucketSizeSeconds),
      series: getSeriesConfig(effectiveTheme, data),
      animation: true,
      animationDuration: 300,
    };
  }, [isDark, effectiveTheme, data, bucketSizeSeconds, getAxisConfig, getTooltipConfig, getSeriesConfig]);

  const handleChartClick = useCallback(
    (params: EChartsEventParams) => {
      if (
        onBarClick &&
        params.data != null &&
        Array.isArray(params.data) &&
        params.data.length >= 2 &&
        typeof params.data[0] === "number"
      ) {
        const date = new Date(params.data[0]);
        onBarClick(date);
      }
    },
    [onBarClick]
  );

  const chartEvents = useMemo(() => ({ click: handleChartClick }), [handleChartClick]);

  // Handle empty state
  const containerHeight = useMemo(() => (typeof height === "number" ? `${height}px` : height), [height]);
  const emptyStateStyle = useMemo(
    () => ({ height: containerHeight, display: "flex", alignItems: "center", justifyContent: "center" }),
    [containerHeight]
  );
  const emptyTextStyle = useMemo(
    () => ({ color: theme?.textColor ?? cartographicColors.navy, fontSize: "14px" }),
    [theme?.textColor]
  );

  if (data.length === 0 && !isInitialLoad && !isUpdating) {
    return (
      <div className={className} style={emptyStateStyle}>
        <div style={emptyTextStyle}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <BaseChart
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={theme}
      config={chartOption as unknown as Partial<EChartsOption>}
      onEvents={chartEvents}
    />
  );
};
