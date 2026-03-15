/**
 * Hook for handling chart click interactions and filter updates.
 *
 * Provides a date click handler for updating URL-based date filters when
 * users click on histogram bars.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQueryState } from "nuqs";

interface ChartFilterHandlers {
  /** Callback for date-based chart clicks */
  handleDateClick: (date: Date) => void;
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

  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleDateClick = (date: Date) => {
    const formattedDate = formatDate(date);
    void setStartDate(formattedDate);
    void setEndDate(formattedDate);
  };

  return { handleDateClick };
};
