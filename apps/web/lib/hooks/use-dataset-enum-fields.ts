/**
 * React Query hook for fetching live enum field counts from a dataset.
 *
 * Fetches from `/api/v1/datasets/{id}/enum-stats` which computes counts
 * via SQL aggregation on events.transformed_data. Returns fresh counts
 * instead of stale fieldMetadata values.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/http-error";

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
  byDataset: (datasetId: string | null) => ["dataset-enum-fields", datasetId] as const,
};

/**
 * Hook to fetch live enum field counts for a dataset.
 *
 * Returns the top enum candidate fields with accurate counts computed
 * from SQL aggregation on the events table.
 *
 * @param datasetId - The dataset ID to fetch enum fields for
 */
export const useDatasetEnumFieldsQuery = (datasetId: string | null, _maxFields = 5) =>
  useQuery({
    queryKey: datasetEnumFieldsKeys.byDataset(datasetId),
    queryFn: () => fetchJson<EnumStatsResponse>(`/api/v1/datasets/${datasetId}/enum-stats`),
    enabled: datasetId != null,
    ...QUERY_PRESETS.stable,
    select: (data) => data.fields,
  });
