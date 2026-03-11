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
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import { useFilters } from "@/lib/filters";
import type { HistogramResponse } from "@/lib/hooks/use-events-queries";
import { buildBaseEventParams } from "@/lib/utils/event-params";

import { formatISODate, parseISODate } from "../utils/date-slider";

interface UseTimeRangeSliderProps {
  startDate: string | null;
  endDate: string | null;
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
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
  histogramRef: React.RefObject<HTMLDivElement | null>;
  /** Whether histogram data is loading */
  isLoading: boolean;
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
  /** Change handler for start date input */
  handleStartDateInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Change handler for end date input */
  handleEndDateInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Open date editing mode */
  handleOpenEditMode: () => void;
  /** Close date editing mode */
  handleCloseEditMode: () => void;
  /** No-op keyboard handler for histogram accessibility */
  handleHistogramKeyDown: () => void;
  /** Click handler for histogram area */
  handleHistogramClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Fetch histogram data for the full date range (no date filters)
 */
const fetchFullHistogram = async (catalog: string | null, datasets: string[]): Promise<HistogramResponse> => {
  // Use buildBaseEventParams with no date filters to get full range
  const params = buildBaseEventParams({ catalog, datasets, startDate: null, endDate: null, fieldFilters: {} });

  const response = await fetch(`/api/v1/events/temporal?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch histogram: ${response.statusText}`);
  }

  return response.json() as Promise<HistogramResponse>;
};

export const useTimeRangeSlider = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: UseTimeRangeSliderProps): UseTimeRangeSliderReturn => {
  const { filters } = useFilters();
  const trackRef = useRef<HTMLDivElement>(null);
  const histogramRef = useRef<HTMLDivElement>(null);
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
    () => ({ left: `${startPosition * 100}%`, right: `${(1 - endPosition) * 100}%` }),
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

  // Keyboard handler for histogram (no-op, users should use the handles)
  const handleHistogramKeyDown = useCallback(() => {
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

  return {
    trackRef,
    histogramRef,
    isLoading,
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
    handleStartDateInputChange,
    handleEndDateInputChange,
    handleOpenEditMode,
    handleCloseEditMode,
    handleHistogramKeyDown,
    handleHistogramClick,
  };
};
