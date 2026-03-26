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

import { useTranslations } from "next-intl";

import type { FilterState } from "@/lib/hooks/use-filters";
import { useTimeRangeSlider } from "@/lib/hooks/use-time-range-slider";
import { formatISODate, formatMonthYear, parseISODate } from "@/lib/utils/date";

const DATE_INPUT_CLASS =
  "border-primary/20 focus:border-secondary focus:ring-secondary/20 rounded border bg-transparent px-2 py-1 font-mono text-xs focus:ring-1 focus:outline-none";

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
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
  /** Optional map bounds — when set, mini histogram is spatially filtered */
  bounds?: { north: number; south: number; east: number; west: number } | null;
}

export const TimeRangeSlider = ({
  filters,
  onStartDateChange,
  onEndDateChange,
  bounds,
}: Readonly<TimeRangeSliderProps>) => {
  const t = useTranslations("Explore");
  const tCommon = useTranslations("Common");

  const {
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
    handleStartDateInputChange,
    handleEndDateInputChange,
    handleOpenEditMode,
    handleCloseEditMode,
    handleHistogramKeyDown,
    handleHistogramClick,
  } = useTimeRangeSlider({ filters, onStartDateChange, onEndDateChange, bounds });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="text-muted-foreground font-mono text-xs">{t("loadingTimeline")}</span>
      </div>
    );
  }

  // No data state - no events match current filters
  if (histogram.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="text-muted-foreground font-mono text-xs">{t("noEventsToDisplay")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-2 select-none">
      {/* Slider track with handles */}
      <div
        ref={trackRef}
        className="relative h-10 cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Track background */}
        <div className="bg-primary/10 dark:bg-foreground/10 absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full" />

        {/* Selected range highlight */}
        <div
          className="bg-secondary/60 dark:bg-secondary/50 absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-[left,right] duration-75"
          style={rangeStyle}
        />

        {/* Start handle */}
        <button
          type="button"
          className="bg-background dark:bg-foreground border-secondary focus-visible:ring-ring absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none active:scale-110 active:cursor-grabbing"
          style={startHandleStyle}
          onPointerDown={handlePointerDown("start")}
          role="slider"
          aria-label={t("startDateSlider", { date: startDate ?? formatISODate(minTimestamp) })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(startPosition * 100)}
        />

        {/* End handle */}
        <button
          type="button"
          className="bg-background dark:bg-foreground border-secondary focus-visible:ring-ring absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none active:scale-110 active:cursor-grabbing"
          style={endHandleStyle}
          onPointerDown={handlePointerDown("end")}
          role="slider"
          aria-label={t("endDateSlider", { date: endDate ?? formatISODate(maxTimestamp) })}
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
        aria-label={t("timelineHistogram")}
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
                isBarInRange(bar.date, bar.dateEnd) ? "bg-ring dark:bg-ring/80" : "bg-primary/20 dark:bg-foreground/20"
              }`}
              style={{ height: `${Math.max(4, bar.normalizedHeight * 100)}%` }}
              title={t("histogramBarTitle", { date: formatMonthYear(bar.date), count: bar.count })}
            />
          ))}
        </div>
      </div>

      {/* Total date range labels */}
      <div className="-mx-2 flex items-center justify-between">
        <span className="text-muted-foreground dark:text-foreground/60 font-mono text-xs">
          {formatMonthYear(minTimestamp)}
        </span>
        <span className="text-muted-foreground dark:text-foreground/60 font-mono text-xs">
          {formatMonthYear(maxTimestamp)}
        </span>
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
                label={t("startDate")}
              />
              <span className="text-primary/40 dark:text-foreground/40 text-xs" aria-hidden="true">
                →
              </span>
              <DateInput
                value={endDate ?? formatISODate(maxTimestamp)}
                onChange={handleEndDateInputChange}
                min={startDate ?? formatISODate(minTimestamp)}
                max={formatISODate(maxTimestamp)}
                label={t("endDate")}
              />
            </div>
            <button
              type="button"
              onClick={handleCloseEditMode}
              className="text-muted-foreground hover:text-primary dark:text-foreground/60 dark:hover:text-foreground w-full text-center text-xs"
            >
              {tCommon("done")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpenEditMode}
            className="hover:bg-primary/5 dark:hover:bg-foreground/5 w-full rounded py-1 text-center transition-colors"
          >
            <span className="text-foreground dark:text-foreground font-mono text-xs">
              {startDate == null ? formatMonthYear(minTimestamp) : formatMonthYear(parseISODate(startDate))}
              {" → "}
              {endDate == null ? formatMonthYear(maxTimestamp) : formatMonthYear(parseISODate(endDate))}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
