/**
 * React Query hook for fetching live enum field counts from a dataset.
 *
 * Fetches from `/api/v1/datasets/{id}/enum-stats` which computes counts
 * via SQL aggregation on events.transformed_data. Accepts optional filter
 * state so dropdown values reflect the currently visible data subset.
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
 * Represents an enum field ready for display in the filter UI.
 */
export interface EnumField {
  /** Field path in the data (e.g., "status", "category") */
  path: string;
  /** Human-readable label derived from the path */
  label: string;
  /** Available values with counts */
  values: Array<{ value: string; count: number; percent: number }>;
  /** Number of unique values */
  cardinality: number;
}

interface EnumStatsResponse {
  fields: EnumField[];
}

export const datasetEnumFieldsKeys = {
  all: ["dataset-enum-fields"] as const,
  byDataset: (datasetId: string | null, filters?: FilterState, bounds?: SimpleBounds | null) =>
    ["dataset-enum-fields", datasetId, filters, bounds] as const,
};

interface SimpleBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Hook to fetch live enum field counts for a dataset.
 *
 * Passes current filter state (time range, bounds, field filters) so
 * dropdown values reflect the currently visible subset of data.
 * Cross-filtering is handled server-side.
 *
 * @param datasetId - The dataset ID to fetch enum fields for
 * @param filters - Current filter state (optional, for contextual counts)
 * @param bounds - Current map bounds (optional, for spatial filtering)
 */
export const useDatasetEnumFieldsQuery = (
  datasetId: string | null,
  filters?: FilterState,
  bounds?: SimpleBounds | null
) => {
  return useQuery({
    queryKey: datasetEnumFieldsKeys.byDataset(datasetId, filters, bounds),
    queryFn: () => {
      const params = filters ? buildBaseEventParams(filters, {}) : new URLSearchParams();
      // Add bounds if available
      if (bounds) {
        params.set("bounds", JSON.stringify(bounds));
      }
      const qs = params.toString();
      const url = `/api/v1/datasets/${datasetId}/enum-stats${qs ? `?${qs}` : ""}`;
      return fetchJson<EnumStatsResponse>(url);
    },
    enabled: datasetId != null,
    ...QUERY_PRESETS.standard,
    select: (data) => data.fields,
  });
};
