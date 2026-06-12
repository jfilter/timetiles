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

import { defaultDarkTheme, defaultLightTheme } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import { ChartEmptyState } from "./chart-empty-state";
import type { ChartTheme, EChartsEventParams } from "./types";

export interface TimeHistogramDataItem {
  date: string | Date | number;
  /** End date of the bucket (for adaptive tooltips showing date ranges) */
  dateEnd?: string | Date | number;
  count: number;
}

/** A named series for stacked/grouped histogram display. */
export interface TimeHistogramSeries {
  name: string;
  color: string;
  data: TimeHistogramDataItem[];
}

export interface TimeHistogramProps {
  /** Histogram data items with date and count (single series) */
  data?: TimeHistogramDataItem[];
  /** Grouped/stacked series — overrides `data` when provided */
  groupedData?: TimeHistogramSeries[];
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
  /** Custom empty message */
  emptyMessage?: string;
  /** Bucket size in seconds (for adaptive tooltip formatting) */
  bucketSizeSeconds?: number | null;
  /** Whether the data fetch encountered an error */
  isError?: boolean;
  /** Callback to retry the failed fetch */
  onRetry?: () => void;
  /** Show DataZoom slider and enable scroll/pinch zoom */
  showDataZoom?: boolean;
  /** Controlled DataZoom start position (0-100) */
  dataZoomStart?: number;
  /** Controlled DataZoom end position (0-100) */
  dataZoomEnd?: number;
  /** Callback when DataZoom range changes */
  onDataZoomChange?: (start: number, end: number) => void;
  /** BCP 47 locale for tooltip date formatting (defaults to the browser locale) */
  locale?: string;
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

/** Raw time-axis values as they appear in series data: ISO strings from the
 *  API, Date objects from fixtures/stories, or epoch milliseconds. */
type TimeAxisValue = string | number | Date;

const isTimeAxisValue = (value: unknown): value is TimeAxisValue =>
  typeof value === "string" || typeof value === "number" || value instanceof Date;

/** Parse a raw time-axis value into a Date, or null if unparseable. */
const parseTimeAxisValue = (value: unknown): Date | null => {
  if (!isTimeAxisValue(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Format time portion of a date.
 * @param date - The date to format
 * @param includeSeconds - Whether to include seconds in the output
 * @param locale - BCP 47 locale (defaults to the browser locale)
 * @returns Formatted time string (e.g., "10:30" or "10:30:45")
 */
export const formatTime = (date: Date, includeSeconds: boolean, locale?: string): string => {
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  });
};

/**
 * Format date with time portion.
 * @param date - The date to format
 * @param includeSeconds - Whether to include seconds in the time portion
 * @param locale - BCP 47 locale (defaults to the browser locale)
 * @returns Formatted datetime string (e.g., "Nov 25, 2025 10:30")
 */
export const formatDateTime = (date: Date, includeSeconds: boolean, locale?: string): string => {
  const datePart = date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  return `${datePart} ${formatTime(date, includeSeconds, locale)}`;
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
export const formatDateRange = (
  startDate: Date,
  endDate: Date,
  bucketSeconds: number | null | undefined,
  locale?: string
): string => {
  // For sub-minute buckets (seconds), show full datetime with seconds
  if (bucketSeconds && bucketSeconds < MINUTE_SECONDS) {
    return formatDateTime(startDate, true, locale);
  }

  // For sub-hour buckets (minutes), show datetime with minutes
  if (bucketSeconds && bucketSeconds < HOUR_SECONDS) {
    return formatDateTime(startDate, false, locale);
  }

  // For sub-day buckets (hours), show date and hour range — these are real
  // instants, so the viewer's local time is correct.
  if (bucketSeconds && bucketSeconds < DAY_SECONDS) {
    const sameDay =
      startDate.getDate() === endDate.getDate() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getFullYear() === endDate.getFullYear();

    if (sameDay) {
      // Same day: "Nov 25, 2025 10:00 - 11:00"
      const datePart = startDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
      return `${datePart} ${formatTime(startDate, false, locale)} - ${formatTime(endDate, false, locale)}`;
    }
    // Different days: show full range
    return `${formatDateTime(startDate, false, locale)} - ${formatDateTime(endDate, false, locale)}`;
  }

  // Day-and-coarser buckets are UTC calendar units (the server buckets by UTC
  // day/month/year) — formatting them in the viewer's zone shifts the label a
  // day/month/year west of UTC. Render these in UTC.
  const utc = { timeZone: "UTC" } as const;

  // If no bucket size or single day bucket, show single date
  if (!bucketSeconds || bucketSeconds <= DAY_SECONDS) {
    return startDate.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", ...utc });
  }

  // For yearly buckets, show just the year
  if (bucketSeconds >= YEAR_SECONDS) {
    return startDate.getUTCFullYear().toString();
  }

  // For monthly buckets, show month and year
  if (bucketSeconds >= MONTH_SECONDS) {
    return startDate.toLocaleDateString(locale, { year: "numeric", month: "long", ...utc });
  }

  // For weekly or multi-day buckets, show date range
  const sameMonth = startDate.getUTCMonth() === endDate.getUTCMonth();
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();

  if (sameMonth && sameYear) {
    // Same month: "Jan 1 - 7, 2024"
    return `${startDate.toLocaleDateString(locale, { month: "short", day: "numeric", ...utc })} - ${endDate.getUTCDate()}, ${startDate.getUTCFullYear()}`;
  } else if (sameYear) {
    // Same year, different months: "Jan 1 - Feb 7, 2024"
    return `${startDate.toLocaleDateString(locale, { month: "short", day: "numeric", ...utc })} - ${endDate.toLocaleDateString(locale, { month: "short", day: "numeric", ...utc })}, ${startDate.getUTCFullYear()}`;
  } else {
    // Different years: "Dec 25, 2023 - Jan 1, 2024"
    return `${startDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", ...utc })} - ${endDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", ...utc })}`;
  }
};

// Helper functions for chart configuration — hoisted out of the component
// to keep `TimeHistogram`'s cyclomatic complexity under control.
const getAxisConfig = (chartTheme: ChartTheme): Pick<EChartsOption, "xAxis" | "yAxis"> => ({
  xAxis: {
    type: "time" as const,
    boundaryGap: [0, 0],
    axisLabel: { color: chartTheme.textColor, fontSize: 11 },
    axisLine: { lineStyle: { color: chartTheme.axisLineColor } },
    splitLine: { show: false },
  },
  yAxis: {
    type: "value" as const,
    axisLabel: { color: chartTheme.textColor, fontSize: 11 },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: chartTheme.splitLineColor, type: "dashed" } },
  },
});

interface HistogramTooltipEntry {
  marker: string;
  seriesName: string;
  data: [TimeAxisValue, number, TimeAxisValue];
}

// ECharts hands the formatter the RAW data item — the time values are
// whatever the series was built from (ISO strings from the API, Dates in
// stories), NOT normalized timestamps. Requiring numbers here rejected
// every real entry and rendered an empty tooltip.
const isHistogramTooltipEntry = (entry: unknown): entry is HistogramTooltipEntry =>
  typeof entry === "object" &&
  entry !== null &&
  "data" in entry &&
  "marker" in entry &&
  "seriesName" in entry &&
  Array.isArray(entry.data) &&
  isTimeAxisValue(entry.data[0]) &&
  typeof entry.data[1] === "number" &&
  isTimeAxisValue(entry.data[2]) &&
  typeof entry.marker === "string" &&
  typeof entry.seriesName === "string";

const getTooltipConfig = (
  chartTheme: ChartTheme,
  _darkMode: boolean,
  bucketSeconds: number | null | undefined,
  isStacked: boolean,
  locale?: string
): NonNullable<EChartsOption["tooltip"]> => ({
  trigger: "axis" as const,
  backgroundColor: chartTheme.tooltipBackground,
  borderColor: chartTheme.axisLineColor,
  textStyle: { color: chartTheme.tooltipForeground },
  formatter: (params) => {
    const rawEntries = Array.isArray(params) ? params : [params];
    const histogramEntries: HistogramTooltipEntry[] = [];

    for (const entry of rawEntries) {
      if (isHistogramTooltipEntry(entry)) {
        histogramEntries.push(entry);
      }
    }

    const point = histogramEntries[0];

    if (!point) {
      return "";
    }

    const startDate = parseTimeAxisValue(point.data[0]);
    const endDate = parseTimeAxisValue(point.data[2]);
    if (!startDate || !endDate) {
      return "";
    }
    const pointCount = typeof point.data[1] === "number" ? point.data[1] : 0;

    if (!isStacked) {
      return `<div style="padding: 4px 8px;"><div style="font-weight: 600;">${formatDateRange(startDate, endDate, bucketSeconds, locale)}</div><div>Events: ${pointCount.toLocaleString()}</div></div>`;
    }

    // Stacked: show each group's count
    const total = histogramEntries.reduce((sum, entry) => sum + entry.data[1], 0);
    const rows = histogramEntries
      .filter((entry) => entry.data[1] > 0)
      .sort((a, b) => b.data[1] - a.data[1])
      .map((entry) => `<div>${entry.marker} ${entry.seriesName}: ${entry.data[1].toLocaleString()}</div>`)
      .join("");
    return `<div style="padding: 4px 8px; max-width: 320px;"><div style="font-weight: 600;">${formatDateRange(startDate, endDate, bucketSeconds, locale)}</div><div style="font-weight: 600;">Total: ${total.toLocaleString()}</div>${rows}</div>`;
  },
});

const getSeriesConfig = (chartTheme: ChartTheme, histogramData: TimeHistogramDataItem[]) => [
  {
    type: "bar" as const,
    // Include dateEnd as third element for tooltip access: [date, count, dateEnd]
    data: histogramData.map((item) => [item.date, item.count, item.dateEnd ?? item.date]),
    itemStyle: {
      color: Array.isArray(chartTheme.itemColor) ? chartTheme.itemColor[0] : chartTheme.itemColor,
      borderRadius: [2, 2, 0, 0],
    },
    emphasis: { itemStyle: { color: chartTheme.emphasisColor } },
  },
];

const getStackedSeriesConfig = (grouped: TimeHistogramSeries[], chartTheme: ChartTheme) =>
  grouped.map((s, i) => ({
    type: "bar" as const,
    name: s.name,
    stack: "total",
    color: s.color, // series-level color for legend + rendering
    data: s.data.map((item) => [item.date, item.count, item.dateEnd ?? item.date]),
    itemStyle: {
      color: s.color, // explicit per-item color
      borderColor: chartTheme.backgroundColor ?? "transparent",
      borderWidth: 0.5,
      borderRadius: i === grouped.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0],
    },
    emphasis: { itemStyle: { opacity: 1, borderWidth: 1 } },
  }));

const getDataZoomConfig = (chartTheme: ChartTheme, start?: number, end?: number) => {
  const primaryColor = Array.isArray(chartTheme.itemColor) ? chartTheme.itemColor[0] : chartTheme.itemColor;
  return [
    {
      type: "slider" as const,
      show: true,
      xAxisIndex: 0,
      bottom: 8,
      height: 24,
      ...(start != null ? { start } : {}),
      ...(end != null ? { end } : {}),
      borderColor: chartTheme.axisLineColor,
      fillerColor: `${primaryColor}33`,
      dataBackground: { lineStyle: { color: chartTheme.axisLineColor }, areaStyle: { color: `${primaryColor}1A` } },
      selectedDataBackground: { lineStyle: { color: primaryColor }, areaStyle: { color: `${primaryColor}33` } },
      handleStyle: { color: primaryColor, borderColor: chartTheme.axisLineColor },
      textStyle: { color: chartTheme.textColor, fontSize: 10 },
    },
    { type: "inside" as const, xAxisIndex: 0, ...(start != null ? { start } : {}), ...(end != null ? { end } : {}) },
  ];
};

const detectDarkTheme = (theme: ChartTheme | undefined): boolean =>
  theme ? theme.axisLineColor === defaultDarkTheme.axisLineColor : false;

const resolveHistogramTheme = (theme: ChartTheme | undefined): { effectiveTheme: ChartTheme; isDark: boolean } => {
  const isDark = detectDarkTheme(theme);
  return { isDark, effectiveTheme: theme ?? (isDark ? defaultDarkTheme : defaultLightTheme) };
};

const buildHistogramChartOption = ({
  data,
  groupedData,
  effectiveTheme,
  isDark,
  bucketSizeSeconds,
  showDataZoom,
  dataZoomStart,
  dataZoomEnd,
  locale,
}: {
  data: TimeHistogramDataItem[];
  groupedData: TimeHistogramSeries[] | undefined;
  effectiveTheme: ChartTheme;
  isDark: boolean;
  bucketSizeSeconds: number | null | undefined;
  showDataZoom: boolean;
  dataZoomStart: number | undefined;
  dataZoomEnd: number | undefined;
  locale: string | undefined;
}): EChartsOption => {
  const axisConfig = getAxisConfig(effectiveTheme);
  const hasGroupedLegend = Boolean(groupedData && groupedData.length > 1);

  return {
    backgroundColor: "transparent",
    textStyle: { color: effectiveTheme.textColor },
    grid: {
      left: "3%",
      right: "4%",
      bottom: showDataZoom ? 45 : "3%",
      top: hasGroupedLegend ? 30 : "10%",
      containLabel: true,
    },
    ...axisConfig,
    tooltip: getTooltipConfig(effectiveTheme, isDark, bucketSizeSeconds, Boolean(groupedData), locale),
    series: groupedData ? getStackedSeriesConfig(groupedData, effectiveTheme) : getSeriesConfig(effectiveTheme, data),
    ...(hasGroupedLegend
      ? {
          color: groupedData?.map((series) => series.color),
          legend: { show: true, top: 0, textStyle: { color: effectiveTheme.textColor, fontSize: 11 } },
        }
      : {}),
    ...(showDataZoom ? { dataZoom: getDataZoomConfig(effectiveTheme, dataZoomStart, dataZoomEnd) } : {}),
    animation: true,
    animationDuration: 300,
  };
};

const getClickedBarDate = (params: EChartsEventParams): Date | null => {
  if (params.data == null || !Array.isArray(params.data) || params.data.length < 2) {
    return null;
  }

  // Click params carry the raw data item — same string/Date/number forms as
  // the tooltip. A number-only check made bar clicks dead for ISO-string data.
  return parseTimeAxisValue(params.data[0]);
};

const getDataZoomRange = (params: EChartsEventParams): { start: number; end: number } => {
  const dataZoomParams = params as unknown as {
    start?: number;
    end?: number;
    batch?: Array<{ start: number; end: number }>;
  };

  return {
    start: dataZoomParams.batch?.[0]?.start ?? dataZoomParams.start ?? 0,
    end: dataZoomParams.batch?.[0]?.end ?? dataZoomParams.end ?? 100,
  };
};

const hasHistogramData = (data: TimeHistogramDataItem[], groupedData: TimeHistogramSeries[] | undefined): boolean =>
  groupedData ? groupedData.some((series) => series.data.length > 0) : data.length > 0;

export const TimeHistogram = ({
  data = defaultData,
  groupedData,
  onBarClick,
  theme,
  height = 200,
  className,
  isInitialLoad = false,
  isUpdating = false,
  emptyMessage = "No data available",
  bucketSizeSeconds,
  isError = false,
  onRetry,
  showDataZoom = false,
  dataZoomStart,
  dataZoomEnd,
  onDataZoomChange,
  locale,
}: TimeHistogramProps) => {
  const { effectiveTheme, isDark } = resolveHistogramTheme(theme);
  const chartOption = buildHistogramChartOption({
    data,
    groupedData,
    effectiveTheme,
    isDark,
    bucketSizeSeconds,
    showDataZoom,
    dataZoomStart,
    dataZoomEnd,
    locale,
  });

  const handleChartClick = (params: EChartsEventParams) => {
    const clickedDate = getClickedBarDate(params);
    if (clickedDate && onBarClick) {
      onBarClick(clickedDate);
    }
  };

  const handleDataZoom = (params: EChartsEventParams) => {
    if (!onDataZoomChange) {
      return;
    }

    const { start, end } = getDataZoomRange(params);
    onDataZoomChange(start, end);
  };

  const chartEvents = { click: handleChartClick, ...(onDataZoomChange ? { datazoom: handleDataZoom } : {}) };

  // Handle error state
  if (isError && !isInitialLoad) {
    return <ChartEmptyState variant="error" height={height} className={className} onRetry={onRetry} />;
  }

  // Handle empty state — check both single-series and grouped data
  const hasData = hasHistogramData(data, groupedData);
  if (!hasData && !isInitialLoad && !isUpdating) {
    return <ChartEmptyState variant="no-match" height={height} className={className} message={emptyMessage} />;
  }

  return (
    <BaseChart
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={theme}
      config={chartOption}
      onEvents={chartEvents}
      skeletonVariant="histogram"
    />
  );
};
