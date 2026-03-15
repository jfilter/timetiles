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

import type { FilterState } from "@/lib/hooks/use-filters";
import { useTimeRangeSlider } from "@/lib/hooks/use-time-range-slider";
import { formatISODate, formatShortDate, parseISODate } from "@/lib/utils/date-slider";

const DATE_INPUT_CLASS =
  "border-cartographic-navy/20 focus:border-cartographic-terracotta focus:ring-cartographic-terracotta/20 rounded border bg-transparent px-2 py-1 font-mono text-xs focus:ring-1 focus:outline-none";

const DateInput = ({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min: string;
  max: string;
  label: string;
}) => (
  <input
    type="date"
    value={value}
    onChange={onChange}
    min={min}
    max={max}
    aria-label={label}
    className={DATE_INPUT_CLASS}
  />
);

interface TimeRangeSliderProps {
  filters: FilterState;
  startDate: string | null;
  endDate: string | null;
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
}

export const TimeRangeSlider = ({
  filters,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: Readonly<TimeRangeSliderProps>) => {
  const {
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
  } = useTimeRangeSlider({ filters, startDate, endDate, onStartDateChange, onEndDateChange });

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
    <div className="space-y-3 px-2 select-none">
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
          className="bg-cartographic-terracotta/60 dark:bg-cartographic-terracotta/50 absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-[left,right] duration-75"
          style={rangeStyle}
        />

        {/* Start handle */}
        <button
          type="button"
          className="bg-cartographic-parchment dark:bg-cartographic-charcoal border-cartographic-terracotta focus-visible:ring-cartographic-blue absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none active:scale-110 active:cursor-grabbing"
          style={startHandleStyle}
          onPointerDown={handlePointerDown("start")}
          role="slider"
          aria-label={`Start date: ${startDate ?? formatISODate(minTimestamp)}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(startPosition * 100)}
        />

        {/* End handle */}
        <button
          type="button"
          className="bg-cartographic-parchment dark:bg-cartographic-charcoal border-cartographic-terracotta focus-visible:ring-cartographic-blue absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none active:scale-110 active:cursor-grabbing"
          style={endHandleStyle}
          onPointerDown={handlePointerDown("end")}
          role="slider"
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
              <DateInput
                value={startDate ?? formatISODate(minTimestamp)}
                onChange={handleStartDateInputChange}
                min={formatISODate(minTimestamp)}
                max={endDate ?? formatISODate(maxTimestamp)}
                label="Start date"
              />
              <span className="text-cartographic-navy/40 dark:text-cartographic-charcoal/40 text-xs" aria-hidden="true">
                →
              </span>
              <DateInput
                value={endDate ?? formatISODate(maxTimestamp)}
                onChange={handleEndDateInputChange}
                min={startDate ?? formatISODate(minTimestamp)}
                max={formatISODate(maxTimestamp)}
                label="End date"
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
              {startDate == null ? formatShortDate(minTimestamp) : formatShortDate(parseISODate(startDate))}
              {" → "}
              {endDate == null ? formatShortDate(maxTimestamp) : formatShortDate(parseISODate(endDate))}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
