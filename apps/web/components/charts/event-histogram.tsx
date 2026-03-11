/**
 * Interactive histogram visualization for temporal event distribution.
 *
 * Displays a time-based histogram of event data with configurable granularity
 * (day, week, month, year). Supports interactive tooltips and click-to-filter
 * functionality for exploring event patterns over time.
 *
 * This component handles data fetching and passes the data to the presentational
 * TimeHistogram component from the UI package.
 *
 * @module
 * @category Components
 */
"use client";

import { TimeHistogram, useChartTheme } from "@timetiles/ui/charts";

import { useFilters } from "@/lib/filters";
import { useChartFilters } from "@/lib/hooks/use-chart-filters";
import { useChartQuery } from "@/lib/hooks/use-chart-query";
import type { HistogramData } from "@/lib/hooks/use-events-queries";
import { useHistogramQuery } from "@/lib/hooks/use-events-queries";
import { useViewScope } from "@/lib/hooks/use-view-scope";

import type { BaseChartProps } from "./types";

/** Stable empty array to avoid creating a new reference when histogramData is null. */
const EMPTY_HISTOGRAM: HistogramData[] = [];

/**
 * Event histogram component with data fetching.
 *
 * Fetches histogram data from the API and renders it using the TimeHistogram
 * component. Handles filter state and click interactions.
 */
export const EventHistogram = ({ height = 200, className, bounds }: Readonly<BaseChartProps>) => {
  const chartTheme = useChartTheme();
  const { filters } = useFilters();
  const { handleDateClick } = useChartFilters();
  const scope = useViewScope();

  const histogramQuery = useHistogramQuery(filters, bounds ?? null, true, scope);
  const { data: histogramData, isInitialLoad, isUpdating, isError } = useChartQuery(histogramQuery);

  const histogram = histogramData?.histogram ?? EMPTY_HISTOGRAM;
  const bucketSizeSeconds = histogramData?.metadata?.bucketSizeSeconds ?? null;

  return (
    <TimeHistogram
      data={histogram}
      onBarClick={handleDateClick}
      theme={chartTheme}
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      isError={isError}
      bucketSizeSeconds={bucketSizeSeconds}
    />
  );
};
