/**
 * Container component for numeric range filters.
 *
 * Renders a dual-handle range slider for each numeric field. The parent
 * fetches the numeric field bounds (min/max/isInteger) and passes them as
 * props. Only shown when exactly one dataset is selected (number formats are
 * dataset-specific — see the single-dataset gate in EventFilters).
 *
 * @module
 * @category Components
 */
"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { NumericField } from "@/lib/hooks/use-dataset-numeric-fields";
import { useFilters } from "@/lib/hooks/use-filters";

import { NumericRangeSlider } from "./numeric-range-slider";

const INITIAL_VISIBLE = 5;

/**
 * Loading skeleton for numeric range filters.
 */
const NumericRangeFiltersSkeleton = () => {
  const t = useTranslations("Common");

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- live region wraps block-level skeleton rows; <output> only permits phrasing content
    <div className="space-y-3" role="status" aria-label={t("loadingFilters")}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1">
          <div className="bg-muted h-3 w-20 animate-pulse rounded" />
          <div className="bg-muted h-6 w-full animate-pulse rounded-sm" />
        </div>
      ))}
    </div>
  );
};

/** Props for the NumericRangeFilters component */
export interface NumericRangeFiltersProps {
  /** Numeric fields to display as range sliders */
  numericFields: NumericField[];
  /** Whether the numeric fields are currently loading */
  isLoading: boolean;
}

/**
 * Numeric range filters container.
 *
 * Renders a range slider per numeric field when a single dataset is selected.
 * Numeric field data (bounds + isInteger) is fetched by the parent and passed
 * as props.
 */
export const NumericRangeFilters = ({ numericFields, isLoading }: NumericRangeFiltersProps) => {
  const { filters, setRangeFilter } = useFilters();
  const t = useTranslations("Filters");
  const [expanded, setExpanded] = useState(false);

  if (isLoading) return <NumericRangeFiltersSkeleton />;
  if (numericFields.length === 0) return null;

  const hasMore = numericFields.length > INITIAL_VISIBLE;
  const visibleFields = expanded ? numericFields : numericFields.slice(0, INITIAL_VISIBLE);

  return (
    <div className="space-y-3">
      {visibleFields.map((field) => {
        const current = filters.rangeFilters[field.path];
        return (
          <NumericRangeSlider
            key={field.path}
            label={field.label}
            min={field.min}
            max={field.max}
            isInteger={field.isInteger}
            value={{ min: current?.min ?? null, max: current?.max ?? null }}
            onChange={(min, max) => setRangeFilter(field.path, min, max)}
          />
        );
      })}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 py-1 text-xs transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>
            {expanded ? t("showLessRanges") : t("showMoreRanges", { count: numericFields.length - INITIAL_VISIBLE })}
          </span>
        </button>
      )}
    </div>
  );
};
