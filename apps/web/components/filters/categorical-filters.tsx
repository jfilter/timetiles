/**
 * Container component for categorical/enum field filters.
 *
 * Renders multi-select dropdowns for each enum field. The parent
 * component is responsible for fetching enum field metadata and
 * passing it as props. Only shown when exactly one dataset is
 * selected (enum fields are dataset-specific).
 *
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";

import { EMPTY_ARRAY } from "@/lib/constants/empty";
import type { EnumField } from "@/lib/hooks/use-dataset-enum-fields";
import { useFilters } from "@/lib/hooks/use-filters";

import { EnumFieldDropdown } from "./enum-field-dropdown";

/**
 * Loading skeleton for categorical filters.
 */
const CategoricalFiltersSkeleton = () => {
  const t = useTranslations("Common");

  return (
    <div className="space-y-3" role="status" aria-label={t("loadingFilters")}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1">
          <div className="bg-muted h-3 w-20 animate-pulse rounded" />
          <div className="bg-muted h-9 w-full animate-pulse rounded-sm" />
        </div>
      ))}
    </div>
  );
};

/** Props for the CategoricalFilters component */
export interface CategoricalFiltersProps {
  /** Enum fields to display as filter dropdowns */
  enumFields: EnumField[];
  /** Whether the enum fields are currently loading */
  isLoading: boolean;
}

/**
 * Categorical filters container.
 *
 * Renders enum field dropdowns when a single dataset is selected.
 * Enum field data is fetched by the parent and passed as props.
 */
export const CategoricalFilters = ({ enumFields, isLoading }: CategoricalFiltersProps) => {
  const { filters, setFieldFilter } = useFilters();

  // Show skeleton while loading
  if (isLoading) return <CategoricalFiltersSkeleton />;

  // Don't show if no enum fields
  if (enumFields.length === 0) return null;

  return (
    <div className="space-y-3">
      {enumFields.map((field) => (
        <EnumFieldDropdown
          key={field.path}
          label={field.label}
          values={field.values}
          selectedValues={filters.fieldFilters[field.path] ?? EMPTY_ARRAY}
          onSelectionChange={(newValues: string[]) => setFieldFilter(field.path, newValues)}
        />
      ))}
    </div>
  );
};
