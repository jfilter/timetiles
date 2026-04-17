/**
 * Custom hook encapsulating time range slider interaction logic.
 *
 * Manages drag state, edit mode, pointer event handlers, date input handlers,
 * histogram click handling, and computed memoized values for the TimeRangeSlider
 * component.
 *
 * @module
 * @category Hooks
 */
/* eslint-disable sonarjs/max-lines-per-function -- Hook consolidates all slider state/handlers from the component */
import type React from "react";
import { useMemo, useRef, useState } from "react";

import { useFullHistogramQuery, useHistogramQuery } from "@/lib/hooks/use-events-queries";
import type { FilterState } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import type { HistogramResponse } from "@/lib/schemas/events";

import { formatISODate, parseISODate } from "../utils/date";

/** Referentially stable empty array to avoid re-creating on every render */
const EMPTY_HISTOGRAM: HistogramResponse["histogram"] = [];

interface UseTimeRangeSliderProps {
  filters: FilterState;
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
  /** Optional map bounds — when set, histogram data is spatially filtered */
  bounds?: { north: number; south: number; east: number; west: number } | null;
}

interface NormalizedBar {
  date: number;
  dateEnd: number;
  count: number;
  normalizedHeight: number;
}

interface UseTimeRangeSliderReturn {
  /** Ref for the slider track element */
  trackRef: React.RefObject<HTMLDivElement | null>;
  /** Ref for the histogram element */
  histogramRef: React.RefObject<HTMLButtonElement | null>;
  /** Whether histogram data is loading */
  isLoading: boolean;
  /** Current start date filter value (pass-through from filters) */
  startDate: string | null;
  /** Current end date filter value (pass-through from filters) */
  endDate: string | null;
  /** Raw histogram buckets */
  histogram: HistogramResponse["histogram"];
  /** Minimum timestamp in the data range */
  minTimestamp: number;
  /** Maximum timestamp in the data range */
  maxTimestamp: number;
  /** Normalized bar data for rendering */
  normalizedBars: NormalizedBar[];
  /** Start handle position (0-1) */
  startPosition: number;
  /** End handle position (0-1) */
  endPosition: number;
  /** Style object for the selected range highlight */
  rangeStyle: { left: string; right: string };
  /** Style object for the start handle */
  startHandleStyle: { left: string };
  /** Style object for the end handle */
  endHandleStyle: { left: string };
  /** Whether date inputs are being edited */
  isEditingDates: boolean;
  /** Check if a bar falls within the selected range */
  isBarInRange: (barStart: number, barEnd: number) => boolean;
  /** Pointer down handler factory for start/end handles */
  handlePointerDown: (handle: "start" | "end") => (e: React.PointerEvent) => void;
  /** Pointer move handler for drag tracking */
  handlePointerMove: (e: React.PointerEvent) => void;
  /** Pointer up handler to end dragging */
  handlePointerUp: () => void;
  /** Keyboard handler factory for start/end slider handles */
  handleHandleKeyDown: (handle: "start" | "end") => (e: React.KeyboardEvent) => void;
  /** Change handler for start date input */
  handleStartDateInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Change handler for end date input */
  handleEndDateInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Open date editing mode */
  handleOpenEditMode: () => void;
  /** Close date editing mode */
  handleCloseEditMode: () => void;
  /** Click handler for histogram area */
  handleHistogramClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const useTimeRangeSlider = ({
  filters,
  onStartDateChange,
  onEndDateChange,
  bounds,
}: UseTimeRangeSliderProps): UseTimeRangeSliderReturn => {
  const { startDate, endDate } = filters;
  const trackRef = useRef<HTMLDivElement>(null);
  const histogramRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState<"start" | "end" | null>(null);
  const [isEditingDates, setIsEditingDates] = useState(false);

  // Fetch histogram data for full date range (no date filter applied)
  // When bounds are provided, spatially filter the histogram to match the map viewport
  const scope = useViewScope();
  const fullRangeFilters = useMemo(() => ({ ...filters, startDate: null, endDate: null }), [filters]);
  const unboundedQuery = useFullHistogramQuery(filters, scope);
  const boundedQuery = useHistogramQuery(fullRangeFilters, bounds ?? null, bounds != null, scope);
  const histogramQuery = bounds != null ? boundedQuery : unboundedQuery;
  const histogramData = histogramQuery.data;
  const isLoading = histogramQuery.isLoading;

  const histogram = histogramData?.histogram ?? EMPTY_HISTOGRAM;

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
  const startPosition = (() => {
    if (startDate == null || minTimestamp === maxTimestamp) return 0;
    const ts = parseISODate(startDate);
    return Math.max(0, Math.min(1, (ts - minTimestamp) / (maxTimestamp - minTimestamp)));
  })();

  const endPosition = (() => {
    if (endDate == null || minTimestamp === maxTimestamp) return 1;
    const ts = parseISODate(endDate);
    return Math.max(0, Math.min(1, (ts - minTimestamp) / (maxTimestamp - minTimestamp)));
  })();

  const rangeStyle = { left: `${startPosition * 100}%`, right: `${(1 - endPosition) * 100}%` };
  const startHandleStyle = { left: `${startPosition * 100}%` };
  const endHandleStyle = { left: `${endPosition * 100}%` };

  const clampTimestamp = (timestamp: number): number => {
    return Math.max(minTimestamp, Math.min(maxTimestamp, timestamp));
  };

  const commitHandleTimestamp = (handle: "start" | "end", timestamp: number) => {
    const clampedTimestamp = clampTimestamp(timestamp);

    if (handle === "start") {
      const endTs = endDate != null ? parseISODate(endDate) : maxTimestamp;
      if (clampedTimestamp <= endTs) {
        onStartDateChange(formatISODate(clampedTimestamp));
      }
      return;
    }

    const startTs = startDate != null ? parseISODate(startDate) : minTimestamp;
    if (clampedTimestamp >= startTs) {
      onEndDateChange(formatISODate(clampedTimestamp));
    }
  };

  // Convert position (0-1) to timestamp
  const positionToTimestamp = (position: number): number => {
    return minTimestamp + position * (maxTimestamp - minTimestamp);
  };

  // Handle mouse/touch events for dragging
  const handlePointerDown = (handle: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(handle);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging == null || trackRef.current == null) return;

    const rect = trackRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    commitHandleTimestamp(isDragging, positionToTimestamp(position));
  };

  const handlePointerUp = () => {
    setIsDragging(null);
  };

  const handleHandleKeyDown = (handle: "start" | "end") => (e: React.KeyboardEvent) => {
    if (minTimestamp === maxTimestamp) return;

    let currentValue: number;
    if (handle === "start") {
      currentValue = startDate != null ? parseISODate(startDate) : minTimestamp;
    } else {
      currentValue = endDate != null ? parseISODate(endDate) : maxTimestamp;
    }
    const step = Math.max((maxTimestamp - minTimestamp) * 0.01, 1);

    let nextValue: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextValue = currentValue - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextValue = currentValue + step;
        break;
      case "PageDown":
        nextValue = currentValue - step * 10;
        break;
      case "PageUp":
        nextValue = currentValue + step * 10;
        break;
      case "Home":
        nextValue = minTimestamp;
        break;
      case "End":
        nextValue = maxTimestamp;
        break;
      default:
        return;
    }

    e.preventDefault();
    commitHandleTimestamp(handle, nextValue);
  };

  // Check if a bar is within the selected range
  const isBarInRange = (barStart: number, barEnd: number): boolean => {
    const rangeStart = startDate != null ? parseISODate(startDate) : minTimestamp;
    const rangeEnd = endDate != null ? parseISODate(endDate) : maxTimestamp;
    return barEnd >= rangeStart && barStart <= rangeEnd;
  };

  // Date input handlers
  const handleStartDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onStartDateChange(e.target.value || null);
  };

  const handleEndDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onEndDateChange(e.target.value || null);
  };

  const handleOpenEditMode = () => {
    setIsEditingDates(true);
  };

  const handleCloseEditMode = () => {
    setIsEditingDates(false);
  };

  const handleHistogramClick = (e: React.MouseEvent<HTMLButtonElement>) => {
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
  };

  return {
    trackRef,
    histogramRef,
    isLoading,
    startDate,
    endDate,
    histogram,
    minTimestamp,
    maxTimestamp,
    normalizedBars,
    startPosition,
    endPosition,
    rangeStyle,
    startHandleStyle,
    endHandleStyle,
    isEditingDates,
    isBarInRange,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleHandleKeyDown,
    handleStartDateInputChange,
    handleEndDateInputChange,
    handleOpenEditMode,
    handleCloseEditMode,
    handleHistogramClick,
  };
};
