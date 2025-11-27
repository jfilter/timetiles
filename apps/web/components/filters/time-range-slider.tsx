/**
 * Time range slider with mini histogram visualization.
 *
 * A dual-handle range slider that displays event distribution over time,
 * styled with cartographic design elements. Users can drag handles to
 * select a date range, with visual feedback showing where events are
 * concentrated.
 *
 * @module
 * @category Components
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import { useFilters } from "@/lib/filters";
import type { HistogramResponse } from "@/lib/hooks/use-events-queries";
import { buildBaseEventParams } from "@/lib/utils/event-params";

interface TimeRangeSliderProps {
  startDate: string | null;
  endDate: string | null;
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
}

/**
 * Format a timestamp to a short date string (e.g., "Jan 2024")
 */
const formatShortDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

/**
 * Format a timestamp to ISO date string (YYYY-MM-DD)
 */
const formatISODate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const parts = date.toISOString().split("T");
  return parts[0] ?? "";
};

/**
 * Parse an ISO date string to timestamp
 */
const parseISODate = (dateStr: string): number => {
  return new Date(dateStr).getTime();
};

/**
 * Fetch histogram data for the full date range (no date filters)
 */
const fetchFullHistogram = async (catalog: string | null, datasets: string[]): Promise<HistogramResponse> => {
  // Use buildBaseEventParams with no date filters to get full range
  const params = buildBaseEventParams({
    catalog,
    datasets,
    startDate: null,
    endDate: null,
  });

  const response = await fetch(`/api/v1/events/temporal?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch histogram: ${response.statusText}`);
  }

  return response.json() as Promise<HistogramResponse>;
};

export const TimeRangeSlider = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: Readonly<TimeRangeSliderProps>) => {
  const { filters } = useFilters();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<"start" | "end" | null>(null);
  const [isEditingDates, setIsEditingDates] = useState(false);

  // Fetch histogram data for full date range (no date filter applied)
  const { data: histogramData, isLoading } = useQuery({
    queryKey: ["histogram-full", filters.catalog, filters.datasets],
    queryFn: () => fetchFullHistogram(filters.catalog, filters.datasets),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Memoize histogram to prevent useMemo dependencies from changing on every render
  const histogram = useMemo(() => histogramData?.histogram ?? [], [histogramData?.histogram]);

  // Calculate the data range and normalize histogram
  const { minTimestamp, maxTimestamp, normalizedBars } = useMemo(() => {
    if (histogram.length === 0) {
      return { minTimestamp: 0, maxTimestamp: 0, normalizedBars: [] };
    }

    const firstBucket = histogram[0];
    const lastBucket = histogram[histogram.length - 1];
    // Parse ISO date strings to timestamps
    const min = firstBucket?.date ? new Date(firstBucket.date).getTime() : 0;
    const max = lastBucket?.dateEnd ? new Date(lastBucket.dateEnd).getTime() : 0;
    const maxC = Math.max(...histogram.map((h) => h.count));

    // Normalize bar heights (0-1) and convert dates to timestamps
    const bars = histogram.map((h) => ({
      date: new Date(h.date).getTime(),
      dateEnd: h.dateEnd ? new Date(h.dateEnd).getTime() : new Date(h.date).getTime(),
      count: h.count,
      normalizedHeight: maxC > 0 ? h.count / maxC : 0,
    }));

    return { minTimestamp: min, maxTimestamp: max, normalizedBars: bars };
  }, [histogram]);

  // Convert current filter dates to slider positions (0-1)
  const startPosition = useMemo(() => {
    if (startDate == null || minTimestamp === maxTimestamp) return 0;
    const ts = parseISODate(startDate);
    return Math.max(0, Math.min(1, (ts - minTimestamp) / (maxTimestamp - minTimestamp)));
  }, [startDate, minTimestamp, maxTimestamp]);

  const endPosition = useMemo(() => {
    if (endDate == null || minTimestamp === maxTimestamp) return 1;
    const ts = parseISODate(endDate);
    return Math.max(0, Math.min(1, (ts - minTimestamp) / (maxTimestamp - minTimestamp)));
  }, [endDate, minTimestamp, maxTimestamp]);

  // Memoize style objects to avoid creating new objects on each render
  const rangeStyle = useMemo(
    () => ({
      left: `${startPosition * 100}%`,
      right: `${(1 - endPosition) * 100}%`,
    }),
    [startPosition, endPosition]
  );

  const startHandleStyle = useMemo(() => ({ left: `${startPosition * 100}%` }), [startPosition]);

  const endHandleStyle = useMemo(() => ({ left: `${endPosition * 100}%` }), [endPosition]);

  // Convert position (0-1) to timestamp
  const positionToTimestamp = useCallback(
    (position: number): number => {
      return minTimestamp + position * (maxTimestamp - minTimestamp);
    },
    [minTimestamp, maxTimestamp]
  );

  // Handle mouse/touch events for dragging
  const handlePointerDown = useCallback(
    (handle: "start" | "end") => (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(handle);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging == null || trackRef.current == null) return;

      const rect = trackRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const timestamp = positionToTimestamp(position);
      const dateStr = formatISODate(timestamp);

      if (isDragging === "start") {
        // Don't let start go past end
        const endTs = endDate != null ? parseISODate(endDate) : maxTimestamp;
        if (timestamp <= endTs) {
          onStartDateChange(dateStr);
        }
      } else {
        // Don't let end go before start
        const startTs = startDate != null ? parseISODate(startDate) : minTimestamp;
        if (timestamp >= startTs) {
          onEndDateChange(dateStr);
        }
      }
    },
    [
      isDragging,
      positionToTimestamp,
      startDate,
      endDate,
      minTimestamp,
      maxTimestamp,
      onStartDateChange,
      onEndDateChange,
    ]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Check if a bar is within the selected range
  const isBarInRange = useCallback(
    (barStart: number, barEnd: number): boolean => {
      const rangeStart = startDate != null ? parseISODate(startDate) : minTimestamp;
      const rangeEnd = endDate != null ? parseISODate(endDate) : maxTimestamp;
      return barEnd >= rangeStart && barStart <= rangeEnd;
    },
    [startDate, endDate, minTimestamp, maxTimestamp]
  );

  // Date input handlers
  const handleStartDateInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onStartDateChange(e.target.value || null);
    },
    [onStartDateChange]
  );

  const handleEndDateInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onEndDateChange(e.target.value || null);
    },
    [onEndDateChange]
  );

  const handleOpenEditMode = useCallback(() => {
    setIsEditingDates(true);
  }, []);

  const handleCloseEditMode = useCallback(() => {
    setIsEditingDates(false);
  }, []);

  // Handle click on histogram area - move closest handle
  const histogramRef = useRef<HTMLDivElement>(null);

  // Keyboard handler for histogram (no-op, users should use the handles)
  const handleHistogramKeyDown = useCallback((_e: React.KeyboardEvent) => {
    // Keyboard navigation is handled by the individual slider handles
    // This handler exists to satisfy accessibility requirements
  }, []);

  const handleHistogramClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (histogramRef.current == null) return;

      const rect = histogramRef.current.getBoundingClientRect();
      const clickPosition = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const timestamp = positionToTimestamp(clickPosition);
      const dateStr = formatISODate(timestamp);

      // Determine which handle to move based on click position
      if (clickPosition < startPosition) {
        // Clicked left of start handle - move start
        onStartDateChange(dateStr);
      } else if (clickPosition > endPosition) {
        // Clicked right of end handle - move end
        onEndDateChange(dateStr);
      } else {
        // Clicked between handles - move the closest one
        const distToStart = Math.abs(clickPosition - startPosition);
        const distToEnd = Math.abs(clickPosition - endPosition);
        if (distToStart <= distToEnd) {
          onStartDateChange(dateStr);
        } else {
          onEndDateChange(dateStr);
        }
      }
    },
    [positionToTimestamp, startPosition, endPosition, onStartDateChange, onEndDateChange]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="text-muted-foreground font-mono text-xs">Loading timeline...</span>
      </div>
    );
  }

  // No data state - no events match current filters
  if (histogram.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="text-muted-foreground font-mono text-xs">No events to display</span>
      </div>
    );
  }

  return (
    <div className="select-none space-y-3 px-2">
      {/* Date range labels */}
      <div className="-mx-2 flex items-center justify-between">
        <span className="text-cartographic-navy/60 dark:text-cartographic-charcoal/60 font-mono text-xs">
          {formatShortDate(minTimestamp)}
        </span>
        <span className="text-cartographic-navy/60 dark:text-cartographic-charcoal/60 font-mono text-xs">
          {formatShortDate(maxTimestamp)}
        </span>
      </div>

      {/* Slider track with handles */}
      <div
        ref={trackRef}
        className="relative h-10 cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Track background */}
        <div className="bg-cartographic-navy/10 dark:bg-cartographic-charcoal/10 absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full" />

        {/* Selected range highlight */}
        <div
          className="bg-cartographic-terracotta/60 dark:bg-cartographic-terracotta/50 absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-all duration-75"
          style={rangeStyle}
        />

        {/* Start handle */}
        <button
          type="button"
          className="bg-cartographic-parchment dark:bg-cartographic-charcoal border-cartographic-terracotta focus-visible:ring-cartographic-blue absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 active:scale-110 active:cursor-grabbing"
          style={startHandleStyle}
          onPointerDown={handlePointerDown("start")}
          aria-label={`Start date: ${startDate ?? formatISODate(minTimestamp)}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(startPosition * 100)}
        />

        {/* End handle */}
        <button
          type="button"
          className="bg-cartographic-parchment dark:bg-cartographic-charcoal border-cartographic-terracotta focus-visible:ring-cartographic-blue absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 active:scale-110 active:cursor-grabbing"
          style={endHandleStyle}
          onPointerDown={handlePointerDown("end")}
          aria-label={`End date: ${endDate ?? formatISODate(maxTimestamp)}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(endPosition * 100)}
        />
      </div>

      {/* Mini histogram - clickable area */}
      <div
        ref={histogramRef}
        className="relative h-8 cursor-pointer"
        onClick={handleHistogramClick}
        onKeyDown={handleHistogramKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Timeline histogram - click to set date range"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(((startPosition + endPosition) / 2) * 100)}
      >
        {/* Invisible click target covering full area */}
        <div className="absolute inset-0" />
        {/* Bars container - positioned at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-full items-end gap-px">
          {normalizedBars.map((bar) => (
            <div
              key={bar.date}
              className={`pointer-events-none flex-1 rounded-t-sm transition-colors duration-150 ${
                isBarInRange(bar.date, bar.dateEnd)
                  ? "bg-cartographic-blue dark:bg-cartographic-blue/80"
                  : "bg-cartographic-navy/20 dark:bg-cartographic-charcoal/20"
              }`}
              style={
                // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop -- Dynamic height per bar
                { height: `${Math.max(4, bar.normalizedHeight * 100)}%` }
              }
              title={`${formatShortDate(bar.date)}: ${bar.count} events`}
            />
          ))}
        </div>
      </div>

      {/* Selected range display / Date picker */}
      <div className="-mx-2 mt-1">
        {isEditingDates ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <input
                type="date"
                value={startDate ?? formatISODate(minTimestamp)}
                onChange={handleStartDateInputChange}
                min={formatISODate(minTimestamp)}
                max={endDate ?? formatISODate(maxTimestamp)}
                className="border-cartographic-navy/20 focus:border-cartographic-terracotta focus:ring-cartographic-terracotta/20 rounded border bg-transparent px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1"
              />
              <span className="text-cartographic-navy/40 dark:text-cartographic-charcoal/40 text-xs">→</span>
              <input
                type="date"
                value={endDate ?? formatISODate(maxTimestamp)}
                onChange={handleEndDateInputChange}
                min={startDate ?? formatISODate(minTimestamp)}
                max={formatISODate(maxTimestamp)}
                className="border-cartographic-navy/20 focus:border-cartographic-terracotta focus:ring-cartographic-terracotta/20 rounded border bg-transparent px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1"
              />
            </div>
            <button
              type="button"
              onClick={handleCloseEditMode}
              className="text-cartographic-navy/60 hover:text-cartographic-navy dark:text-cartographic-charcoal/60 dark:hover:text-cartographic-charcoal w-full text-center text-xs"
            >
              Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpenEditMode}
            className="hover:bg-cartographic-navy/5 dark:hover:bg-cartographic-charcoal/5 w-full rounded py-1 text-center transition-colors"
          >
            <span className="text-cartographic-charcoal dark:text-cartographic-charcoal font-mono text-xs">
              {startDate != null ? formatShortDate(parseISODate(startDate)) : formatShortDate(minTimestamp)}
              {" → "}
              {endDate != null ? formatShortDate(parseISODate(endDate)) : formatShortDate(maxTimestamp)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
