/**
 * Hook for handling chart click interactions and filter updates.
 *
 * Provides standardized callbacks for updating URL-based filters when
 * users click on chart elements (bars, points, etc.).
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQueryState } from "nuqs";
import { useCallback } from "react";

interface ChartFilterHandlers {
  /** Callback for date-based chart clicks */
  handleDateClick: (date: Date) => void;
  /** Callback for dataset-based chart clicks */
  handleDatasetClick: (datasetId: number) => void;
  /** Callback for catalog-based chart clicks */
  handleCatalogClick: (catalogId: number) => void;
}

/**
 * Creates filter update handlers for chart interactions.
 *
 * @returns Object with handlers for different chart click types
 *
 * @example
 * ```tsx
 * function MyHistogram() {
 *   const { handleDateClick } = useChartFilters();
 *
 *   return (
 *     <TimeHistogram
 *       data={data}
 *       onBarClick={handleDateClick}
 *     />
 *   );
 * }
 * ```
 */
export const useChartFilters = (): ChartFilterHandlers => {
  const [, setStartDate] = useQueryState("startDate");
  const [, setEndDate] = useQueryState("endDate");
  const [, setDataset] = useQueryState("dataset");
  const [, setCatalog] = useQueryState("catalog");

  const formatDate = useCallback((d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const handleDateClick = useCallback(
    (date: Date) => {
      const formattedDate = formatDate(date);
      void setStartDate(formattedDate);
      void setEndDate(formattedDate);
    },
    [setStartDate, setEndDate, formatDate]
  );

  const handleDatasetClick = useCallback(
    (datasetId: number) => {
      void setDataset(String(datasetId));
    },
    [setDataset]
  );

  const handleCatalogClick = useCallback(
    (catalogId: number) => {
      void setCatalog(String(catalogId));
    },
    [setCatalog]
  );

  return {
    handleDateClick,
    handleDatasetClick,
    handleCatalogClick,
  };
};
