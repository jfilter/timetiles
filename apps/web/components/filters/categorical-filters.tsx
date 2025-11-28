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

import { useFilters } from "@/lib/filters";
import { useDatasetEnumFieldsQuery } from "@/lib/hooks/use-dataset-enum-fields";

import { EnumFieldDropdown } from "./enum-field-dropdown";

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
        <EnumFieldDropdown
          key={field.path}
          fieldPath={field.path}
          label={field.label}
          values={field.values}
          selectedValues={filters.fieldFilters[field.path] ?? []}
          onSelectionChange={(values) => setFieldFilter(field.path, values)}
        />
      ))}
    </div>
  );
};
