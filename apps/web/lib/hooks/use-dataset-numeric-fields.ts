/**
 * React Query hook for fetching numeric field bounds (min/max) from a dataset.
 *
 * Fetches from `/api/v1/datasets/{id}/numeric-stats` which computes bounds via a
 * locale-aware SQL aggregate on events.transformed_data (EU string columns have
 * no precomputed numericStats, so a live parse is required). Accepts optional
 * filter state so the bounds reflect the currently visible data subset.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/http-error";
import type { FilterState } from "@/lib/types/filter-state";
import { buildBaseEventParams } from "@/lib/utils/event-params";

import { QUERY_PRESETS } from "./query-presets";

/**
 * A numeric field ready for display in the range-filter UI.
 */
export interface NumericField {
  /** Field path in the data (e.g., "price", "amount") */
  path: string;
  /** Human-readable label derived from the path */
  label: string;
  /** Minimum value across the currently visible subset */
  min: number;
  /** Maximum value across the currently visible subset */
  max: number;
  /** Whether all numeric values in the column are whole numbers */
  isInteger: boolean;
}

interface NumericStatsResponse {
  fields: NumericField[];
}

interface SimpleBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const datasetNumericFieldsKeys = {
  all: ["dataset-numeric-fields"] as const,
  byDataset: (datasetId: string | null, filters?: FilterState, bounds?: SimpleBounds | null) =>
    ["dataset-numeric-fields", datasetId, filters, bounds] as const,
};

/**
 * Hook to fetch numeric field bounds for a dataset.
 *
 * Passes current filter state (time range, bounds, field filters) so the
 * min/max bounds reflect the currently visible subset of data.
 *
 * @param datasetId - The dataset ID to fetch numeric fields for
 * @param filters - Current filter state (optional, for contextual bounds)
 * @param bounds - Current map bounds (optional, for spatial filtering)
 */
export const useDatasetNumericFieldsQuery = (
  datasetId: string | null,
  filters?: FilterState,
  bounds?: SimpleBounds | null
) => {
  return useQuery({
    queryKey: datasetNumericFieldsKeys.byDataset(datasetId, filters, bounds),
    queryFn: () => {
      const params = filters ? buildBaseEventParams(filters, {}) : new URLSearchParams();
      if (bounds) {
        params.set("bounds", JSON.stringify(bounds));
      }
      const qs = params.toString();
      const suffix = qs ? `?${qs}` : "";
      const url = `/api/v1/datasets/${datasetId}/numeric-stats${suffix}`;
      return fetchJson<NumericStatsResponse>(url);
    },
    enabled: datasetId != null,
    ...QUERY_PRESETS.standard,
    select: (data) => data.fields,
  });
};
