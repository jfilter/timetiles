/**
 * React Query hook for fetching enum field metadata from a dataset.
 *
 * Used by categorical filter components to display enum field dropdowns.
 * Extracts fields where `isEnumCandidate` is true from the dataset's
 * fieldMetadata and selects the top N fields by cardinality heuristics.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { FieldStatistics } from "@/lib/types/schema-detection";

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

/**
 * Humanize a field path to a readable label.
 * Converts snake_case/camelCase to Title Case with spaces.
 */
const humanizeFieldPath = (path: string): string => {
  // Get the last segment if path contains dots
  const lastSegment = path.split(".").pop() ?? path;

  return lastSegment
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Select top enum fields using cardinality heuristics.
 *
 * Prefers fields with:
 * - 2-30 unique values (good for filtering)
 * - High occurrence percentage (present in most records)
 * - Cardinality close to 5-15 (ideal for dropdown selection)
 */
const selectTopEnumFields = (
  fieldMetadata: Record<string, FieldStatistics> | null | undefined,
  maxFields = 5
): EnumField[] => {
  if (!fieldMetadata) return [];

  const enumCandidates = Object.values(fieldMetadata).filter(
    (field): field is FieldStatistics & { enumValues: NonNullable<FieldStatistics["enumValues"]> } =>
      field.isEnumCandidate &&
      field.enumValues != null &&
      field.enumValues.length >= 2 &&
      field.enumValues.length <= 30 &&
      field.occurrencePercent >= 50
  );

  // Sort by cardinality preference (prefer 5-15 unique values)
  const idealCardinality = 10;
  enumCandidates.sort((a, b) => {
    const aDistance = Math.abs(a.enumValues.length - idealCardinality);
    const bDistance = Math.abs(b.enumValues.length - idealCardinality);
    return aDistance - bDistance;
  });

  return enumCandidates.slice(0, maxFields).map((field) => ({
    path: field.path,
    label: humanizeFieldPath(field.path),
    values: field.enumValues.map((v) => ({
      value: String(v.value),
      count: v.count,
      percent: v.percent,
    })),
    cardinality: field.enumValues.length,
  }));
};

/**
 * Fetch dataset and extract fieldMetadata.
 */
const fetchDatasetFieldMetadata = async (
  datasetId: string
): Promise<Record<string, FieldStatistics> | null> => {
  const response = await fetch(`/api/datasets/${datasetId}?depth=0`);

  if (!response.ok) {
    throw new Error("Failed to fetch dataset");
  }

  const dataset = await response.json();
  return dataset.fieldMetadata ?? null;
};

export const datasetEnumFieldsKeys = {
  all: ["dataset-enum-fields"] as const,
  byDataset: (datasetId: string | null) => ["dataset-enum-fields", datasetId] as const,
};

/**
 * Hook to fetch enum fields for a dataset.
 *
 * Returns the top N enum candidate fields from the dataset's fieldMetadata,
 * ready for display in categorical filter dropdowns.
 *
 * @param datasetId - The dataset ID to fetch enum fields for
 * @param maxFields - Maximum number of fields to return (default: 5)
 */
export const useDatasetEnumFieldsQuery = (datasetId: string | null, maxFields = 5) =>
  useQuery({
    queryKey: datasetEnumFieldsKeys.byDataset(datasetId),
    queryFn: () => fetchDatasetFieldMetadata(datasetId!),
    enabled: datasetId != null,
    staleTime: 5 * 60 * 1000, // 5 minutes - field metadata rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes
    select: (data) => selectTopEnumFields(data, maxFields),
  });
