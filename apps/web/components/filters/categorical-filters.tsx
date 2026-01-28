/**
 * Container component for categorical/enum field filters.
 *
 * Fetches enum field metadata for the selected dataset and renders
 * multi-select dropdowns for each field. Only shown when exactly
 * one dataset is selected (enum fields are dataset-specific).
 *
 * @module
 * @category Components
 */
"use client";

import { useCallback } from "react";

import { useFilters } from "@/lib/filters";
import { useDatasetEnumFieldsQuery } from "@/lib/hooks/use-dataset-enum-fields";

import { EnumFieldDropdown } from "./enum-field-dropdown";

/** Stable empty array to avoid creating new references on each render */
const EMPTY_ARRAY: string[] = [];

/**
 * Loading skeleton for categorical filters.
 */
const CategoricalFiltersSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="space-y-1">
        <div className="bg-muted h-3 w-20 animate-pulse rounded" />
        <div className="bg-muted h-9 w-full animate-pulse rounded-sm" />
      </div>
    ))}
  </div>
);

/** Enum value with count and percentage */
interface EnumValue {
  value: string;
  count: number;
  percent: number;
}

/** Props for the memoized enum field dropdown wrapper */
interface MemoizedEnumFieldProps {
  fieldPath: string;
  label: string;
  values: EnumValue[];
  selectedValues: string[];
  onFieldFilterChange: (path: string, values: string[]) => void;
}

/**
 * Memoized wrapper for EnumFieldDropdown that creates a stable callback.
 */
const MemoizedEnumField = ({
  fieldPath,
  label,
  values,
  selectedValues,
  onFieldFilterChange,
}: MemoizedEnumFieldProps) => {
  const handleSelectionChange = useCallback(
    (newValues: string[]) => {
      onFieldFilterChange(fieldPath, newValues);
    },
    [onFieldFilterChange, fieldPath]
  );

  return (
    <EnumFieldDropdown
      fieldPath={fieldPath}
      label={label}
      values={values}
      selectedValues={selectedValues}
      onSelectionChange={handleSelectionChange}
    />
  );
};

/**
 * Categorical filters container.
 *
 * Renders enum field dropdowns when a single dataset is selected.
 * Uses the dataset's fieldMetadata to determine which fields are
 * enum candidates and auto-selects the top 5 by cardinality.
 */
export const CategoricalFilters = () => {
  const { filters, setFieldFilter } = useFilters();

  // Only show when exactly one dataset is selected
  const singleDatasetId = filters.datasets.length === 1 ? (filters.datasets[0] ?? null) : null;
  const { data: enumFields, isLoading, isError } = useDatasetEnumFieldsQuery(singleDatasetId);

  // Don't render if no single dataset selected
  if (!singleDatasetId) return null;

  // Show skeleton while loading
  if (isLoading) return <CategoricalFiltersSkeleton />;

  // Don't show if error or no enum fields
  if (isError || !enumFields || enumFields.length === 0) return null;

  return (
    <div className="space-y-3">
      {enumFields.map((field) => (
        <MemoizedEnumField
          key={field.path}
          fieldPath={field.path}
          label={field.label}
          values={field.values}
          selectedValues={filters.fieldFilters[field.path] ?? EMPTY_ARRAY}
          onFieldFilterChange={setFieldFilter}
        />
      ))}
    </div>
  );
};
