/**
 * Numeric range slider for filtering events by a numeric data field.
 *
 * A dual-handle range slider over a numeric domain `[min, max]`. Users drag the
 * handles or type exact bounds to select an inclusive min/max range. Mirrors the
 * structure and WAI-ARIA pattern of {@link TimeRangeSlider}, but maps a numeric
 * domain (not timestamps) to 0..1 handle positions.
 *
 * A bound equal to the domain edge is reported back as `null` (open end), so an
 * unconstrained side never narrows the query.
 *
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- dual-thumb slider: each thumb is a button with role="slider" per the WAI-ARIA multi-thumb slider pattern; no native dual-range <input> element exists */

const NUMBER_INPUT_CLASS =
  "border-primary/20 focus:border-secondary focus:ring-secondary/20 w-24 rounded border bg-transparent px-2 py-1 font-mono text-xs focus:ring-1 focus:outline-none";

/** Clamp a value into [0, 1]. */
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Map a numeric value to a 0..1 position within [min, max] (0 when degenerate). */
const valueToPosition = (value: number, min: number, max: number): number =>
  max > min ? clamp01((value - min) / (max - min)) : 0;

/** Map a 0..1 position back to a numeric value within [min, max], rounding integers. */
const positionToValue = (position: number, min: number, max: number, isInteger: boolean): number => {
  const raw = min + clamp01(position) * (max - min);
  return isInteger ? Math.round(raw) : raw;
};

/** Format a numeric bound for display (locale-aware, compact for integers). */
const formatBound = (value: number, isInteger: boolean): string =>
  value.toLocaleString(undefined, isInteger ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 4 });

const NumberInput = ({
  value,
  onChange,
  min,
  max,
  step,
  label,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min: number;
  max: number;
  step: number | "any";
  label: string;
}) => (
  <input
    type="number"
    value={value}
    onChange={onChange}
    min={min}
    max={max}
    step={step}
    aria-label={label}
    className={NUMBER_INPUT_CLASS}
  />
);

export interface NumericRangeValue {
  min: number | null;
  max: number | null;
}

interface NumericRangeSliderProps {
  /** Human-readable label for the field */
  label: string;
  /** Domain lower bound */
  min: number;
  /** Domain upper bound */
  max: number;
  /** Whether the column is integer-only (controls input step + rounding) */
  isInteger: boolean;
  /** Current selected bounds; `null` on a side means "unbounded" (domain edge) */
  value: NumericRangeValue;
  /** Called with the resolved bounds (domain-edge values collapse to `null`) */
  onChange: (min: number | null, max: number | null) => void;
}

/**
 * Dual-handle numeric range slider.
 *
 * Effective bounds: a `null` side snaps the handle to its domain edge. On
 * commit, a bound at the domain edge is reported back as `null` so an
 * unconstrained side does not narrow the query.
 */
export const NumericRangeSlider = ({
  label,
  min,
  max,
  isInteger,
  value,
  onChange,
}: Readonly<NumericRangeSliderProps>) => {
  const t = useTranslations("Filters");
  const tCommon = useTranslations("Common");
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"min" | "max" | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const lowValue = value.min ?? min;
  const highValue = value.max ?? max;
  const lowPosition = valueToPosition(lowValue, min, max);
  const highPosition = valueToPosition(highValue, min, max);
  const step = isInteger ? 1 : "any";

  // Collapse a bound at the domain edge back to `null` (open end).
  const commit = useCallback(
    (nextLow: number, nextHigh: number) => {
      onChange(nextLow <= min ? null : nextLow, nextHigh >= max ? null : nextHigh);
    },
    [onChange, min, max]
  );

  const positionFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const handle = draggingRef.current;
      if (!handle) return;
      const next = positionToValue(positionFromClientX(e.clientX), min, max, isInteger);
      if (handle === "min") {
        commit(Math.min(next, highValue), highValue);
      } else {
        commit(lowValue, Math.max(next, lowValue));
      }
    },
    [positionFromClientX, min, max, isInteger, commit, highValue, lowValue]
  );

  // Capture the pointer on the handle (same pattern as use-time-range-slider):
  // without it the drag dies as soon as the cursor leaves the 24px track, since
  // move events stop reaching the track and onPointerLeave ends the drag.
  const handlePointerDown = (handle: "min" | "max") => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = handle;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerUp = () => {
    draggingRef.current = null;
  };

  const handleKeyDown = (handle: "min" | "max") => (e: React.KeyboardEvent) => {
    const delta = isInteger ? 1 : (max - min) / 100;
    let direction = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") direction = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") direction = 1;
    else return;
    e.preventDefault();
    if (handle === "min") {
      const next = Math.max(min, Math.min(lowValue + direction * delta, highValue));
      commit(next, highValue);
    } else {
      const next = Math.min(max, Math.max(highValue + direction * delta, lowValue));
      commit(lowValue, next);
    }
  };

  // Typed inputs route through `commit` so a value at the domain edge collapses
  // to `null` (open end), consistent with the drag/keyboard paths. `?? min`/`?? max`
  // resolve an already-open side to its domain edge, which commit collapses back.
  const handleMinInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = e.target.value === "" ? null : Number(e.target.value);
    const nextMin = parsed != null && Number.isFinite(parsed) ? parsed : null;
    commit(nextMin ?? min, value.max ?? max);
  };
  const handleMaxInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = e.target.value === "" ? null : Number(e.target.value);
    const nextMax = parsed != null && Number.isFinite(parsed) ? parsed : null;
    commit(value.min ?? min, nextMax ?? max);
  };

  return (
    <div className="space-y-2 px-2 select-none">
      <div className="text-muted-foreground dark:text-foreground/60 font-mono text-xs tracking-wider uppercase">
        {label}
      </div>

      {/* Slider track with handles */}
      <div
        ref={trackRef}
        className="relative h-6 cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="bg-primary/10 dark:bg-foreground/10 absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full" />
        <div
          className="bg-secondary/60 dark:bg-secondary/50 absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ left: `${lowPosition * 100}%`, right: `${(1 - highPosition) * 100}%` }}
        />
        <button
          type="button"
          className="bg-background dark:bg-foreground border-secondary focus-visible:ring-ring absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none active:scale-110 active:cursor-grabbing"
          style={{ left: `${lowPosition * 100}%` }}
          onPointerDown={handlePointerDown("min")}
          onKeyDown={handleKeyDown("min")}
          role="slider"
          aria-label={t("rangeMinSlider", { label })}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={lowValue}
          aria-valuetext={formatBound(lowValue, isInteger)}
          aria-orientation="horizontal"
        />
        <button
          type="button"
          className="bg-background dark:bg-foreground border-secondary focus-visible:ring-ring absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none active:scale-110 active:cursor-grabbing"
          style={{ left: `${highPosition * 100}%` }}
          onPointerDown={handlePointerDown("max")}
          onKeyDown={handleKeyDown("max")}
          role="slider"
          aria-label={t("rangeMaxSlider", { label })}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={highValue}
          aria-valuetext={formatBound(highValue, isInteger)}
          aria-orientation="horizontal"
        />
      </div>

      {/* Selected range display / numeric inputs */}
      <div className="mt-1">
        {isEditing ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <NumberInput
                value={value.min == null ? "" : String(value.min)}
                onChange={handleMinInput}
                min={min}
                max={max}
                step={step}
                label={t("rangeMinSlider", { label })}
              />
              <span className="text-primary/40 dark:text-foreground/40 text-xs" aria-hidden="true">
                →
              </span>
              <NumberInput
                value={value.max == null ? "" : String(value.max)}
                onChange={handleMaxInput}
                min={min}
                max={max}
                step={step}
                label={t("rangeMaxSlider", { label })}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-muted-foreground hover:text-primary dark:text-foreground/60 dark:hover:text-foreground w-full text-center text-xs"
            >
              {tCommon("done")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="hover:bg-primary/5 dark:hover:bg-foreground/5 w-full rounded py-1 text-center transition-colors"
          >
            <span className="text-foreground dark:text-foreground font-mono text-xs">
              {formatBound(lowValue, isInteger)}
              {" → "}
              {formatBound(highValue, isInteger)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
